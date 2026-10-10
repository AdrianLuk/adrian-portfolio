import { Euler, Quaternion, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCameraDirector } from "./camera-director";
import type { WorldIntent, WorldState } from "./world-host";
import { createWorldTransits } from "./world-transits";
import { createFlightPath, type Pose } from "./world/flight";
import { CAMERA } from "./world/pose";
import { TRANSIT_MAX_SECONDS } from "./world/rigs";
import { layoutLandmarks } from "./world/landmarks";
import {
  arenaWayIn,
  courtPose,
  createRoute,
  derbyView,
  playView,
  skylinePose,
} from "./world/route";
import { COURT_STOP, transit, transitWithin } from "./world/transit";

/** A desktop layout's settled pose and plate (as in transit.test.ts). */
const settled: Pose = {
  position: new Vector3(0, 21, 0),
  quaternion: new Quaternion().setFromEuler(
    new Euler(-CAMERA.pitch, 0, 0, "YXZ"),
  ),
};
const plateCentre = new Vector3(-18, 0, -CAMERA.plateDepth)
  .applyQuaternion(settled.quaternion)
  .add(settled.position);
const aspect = 1.6;

type TransitHost = Parameters<typeof createWorldTransits>[0];

/**
 * The world host as the Transits see it: drawn, on home, the Opening landed,
 * its director holding the paths home measured.
 */
function standInHost() {
  const director = createCameraDirector({ homeStop: () => 0 });
  director.layout({
    opening: createFlightPath(settled, plateCentre),
    route: createRoute(settled, plateCentre, aspect),
    skyline: skylinePose(aspect),
    fovY: {
      world: CAMERA.fovY,
      skyline: CAMERA.fovY,
      play: CAMERA.fovY,
      encore: CAMERA.fovY,
      derby: CAMERA.fovY,
    },
    court: courtPose(aspect),
    play: playView(aspect, layoutLandmarks().court).pose,
    derby: derbyView(aspect, layoutLandmarks().field).pose,
    courtStop: COURT_STOP,
    transit,
    within: transitWithin,
    encore: (from) => arenaWayIn(aspect, from),
  });
  director.show("hero");
  director.openingLands();
  const world = {
    intent: "hero" as WorldIntent,
    state: "drawn" as WorldState,
    weatherHeld: false,
    listeners: new Set<() => void>(),
  };
  const host: TransitHost = {
    director,
    subscribe(listener) {
      world.listeners.add(listener);
      return () => {
        world.listeners.delete(listener);
      };
    },
    state: () => world.state,
    intent: () => world.intent,
    live: () => true,
    holdWeather(hold) {
      world.weatherHeld = hold;
    },
  };
  return { host, world, director };
}

/** The world's root, as the Transits mark it. */
function fakeRoot() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  };
}

describe("transits between Places", () => {
  let root: ReturnType<typeof fakeRoot>;
  let media: { listeners: Set<() => void>; matches: boolean };
  const disposers: (() => void)[] = [];

  beforeEach(() => {
    root = fakeRoot();
    media = { listeners: new Set(), matches: false };
    vi.stubGlobal("document", {
      querySelector: () => root,
      activeViewTransition: null,
    });
    vi.stubGlobal("window", {
      matchMedia: () => ({
        get matches() {
          return media.matches;
        },
        addEventListener: (_: string, fn: () => void) => media.listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) =>
          media.listeners.delete(fn),
      }),
    });
    vi.stubGlobal("requestAnimationFrame", (fn: (now: number) => void) =>
      setTimeout(() => fn(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "performance"],
    });
  });

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function start(host: TransitHost) {
    const transits = createWorldTransits(host);
    disposers.push(transits.dispose);
    return transits;
  }

  it("flies home → /rally, marking the world for /rally's view of the court and holding its copy", () => {
    const { host, world, director } = standInHost();
    const transits = start(host);
    expect(transits.navigate("/rally")).toBe(true);
    expect(root.attributes.get("data-transit")).toBe("play");
    expect(root.attributes.get("data-arriving")).toBe("play");
    world.intent = "play";
    director.show("play");
    vi.advanceTimersByTime(TRANSIT_MAX_SECONDS * 1000 + 200);
    expect(director.flying()).toBeNull();
    expect(root.attributes.has("data-transit")).toBe(false);
    expect(root.attributes.has("data-arriving")).toBe(false);
  });

  it("flies between the court's two views, the Case study and /rally, either way", () => {
    const { host, world, director } = standInHost();
    world.intent = "court";
    director.show("court");
    const transits = start(host);
    expect(transits.navigate("/rally")).toBe(true);
    expect(director.flying()).toBe("play");
    world.intent = "play";
    director.show("play");
    vi.advanceTimersByTime(TRANSIT_MAX_SECONDS * 1000 + 200);
    expect(director.flying()).toBeNull();
    expect(transits.navigate("/work/juice-bros")).toBe(true);
    expect(director.flying()).toBe("court");
    expect(transits.navigate("/rally?weather=snow")).toBe(true);
    expect(director.flying()).toBe("play");
  });

  describe("landed", () => {
    it("resolves at once with no Transit under way", async () => {
      const { host } = standInHost();
      const transits = start(host);
      await expect(transits.landed()).resolves.toBeUndefined();
    });

    it("resolves only once the camera lands", async () => {
      const { host, world, director } = standInHost();
      const transits = start(host);
      transits.navigate("/rally");
      let landed = false;
      void transits.landed().then(() => (landed = true));
      world.intent = "play";
      director.show("play");
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      expect(landed).toBe(false);
      vi.advanceTimersByTime(TRANSIT_MAX_SECONDS * 1000);
      await Promise.resolve();
      expect(director.flying()).toBeNull();
      expect(landed).toBe(true);
    });

    it("resolves when a Transit is called off, as by a lost GPU context", async () => {
      const { host, world } = standInHost();
      const transits = start(host);
      transits.navigate("/rally");
      const landed = transits.landed();
      world.state = "pending";
      for (const listener of world.listeners) listener();
      await expect(landed).resolves.toBeUndefined();
    });
  });

  it("holds the Resume page's copy back for the cap at most, though the camera has yet to land", () => {
    const { host, world } = standInHost();
    const transits = start(host);
    expect(transits.navigate("/resume")).toBe(true);
    expect(root.attributes.get("data-transit")).toBe("skyline");
    expect(root.attributes.get("data-arriving")).toBe("skyline");
    expect(world.weatherHeld).toBe(true);

    // The page is slow to arrive: the camera waits on it, the copy doesn't.
    vi.advanceTimersByTime(TRANSIT_MAX_SECONDS * 1000 - 50);
    expect(root.attributes.get("data-arriving")).toBe("skyline");
    vi.advanceTimersByTime(100);
    expect(root.attributes.has("data-arriving")).toBe(false);
    expect(root.attributes.get("data-transit")).toBe("skyline");
  });

  it("flies to the Case study's court, holding its copy back for the cap at most", () => {
    const { host, world, director } = standInHost();
    const transits = start(host);
    expect(transits.navigate("/work/juice-bros")).toBe(true);
    expect(root.attributes.get("data-transit")).toBe("court");
    expect(root.attributes.get("data-arriving")).toBe("court");
    expect(world.weatherHeld).toBe(true);

    world.intent = "court";
    director.show("court");
    vi.advanceTimersByTime(TRANSIT_MAX_SECONDS * 1000 - 50);
    // Never past the cap: the copy is in by then, and so is the camera.
    vi.advanceTimersByTime(100);
    expect(root.attributes.has("data-arriving")).toBe(false);
    vi.advanceTimersByTime(100);
    expect(director.flying()).toBeNull();
    expect(root.attributes.size).toBe(0);
    expect(world.weatherHeld).toBe(false);
  });

  it("flies on from the court to the Resume page, and an anchor on the court flies nowhere", () => {
    const { host, world, director } = standInHost();
    const transits = start(host);
    world.intent = "court";
    director.show("court");
    expect(transits.navigate("/work/juice-bros#approach")).toBe(false);
    expect(root.attributes.size).toBe(0);
    expect(transits.navigate("/resume")).toBe(true);
    expect(root.attributes.get("data-transit")).toBe("skyline");
    expect(root.attributes.get("data-arriving")).toBe("skyline");
  });

  it("clears its marks and lets the weather go once the director lands", () => {
    const { host, world, director } = standInHost();
    const transits = start(host);
    transits.navigate("/resume");
    world.intent = "skyline";
    director.show("skyline");
    vi.advanceTimersByTime(TRANSIT_MAX_SECONDS * 1000 + 100);
    expect(director.flying()).toBeNull();
    expect(root.attributes.size).toBe(0);
    expect(world.weatherHeld).toBe(false);
  });

  it("keeps the Transit's mark through the view transition its page commits in, so it never crossfades", async () => {
    const { host, world, director } = standInHost();
    const transits = start(host);
    transits.navigate("/work/juice-bros");
    // The page commits late, in a view transition of its own, after the
    // flight's time is up: the camera lands at once.
    vi.advanceTimersByTime(TRANSIT_MAX_SECONDS * 1000 + 100);
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    (document as unknown as { activeViewTransition: unknown }).activeViewTransition = {
      finished,
    };
    world.intent = "court";
    director.show("court");
    vi.advanceTimersByTime(50);
    expect(director.flying()).toBeNull();
    expect(world.weatherHeld).toBe(false);
    expect(root.attributes.has("data-arriving")).toBe(false);
    // The mark that turns the crossfade off stays until it is over.
    expect(root.attributes.get("data-transit")).toBe("court");
    finish();
    await finished;
    await Promise.resolve();
    expect(root.attributes.has("data-transit")).toBe(false);
  });

  it("leaves from where the committed page is, so a navigation that never arrives changes nothing", () => {
    const { host } = standInHost();
    const transits = start(host);
    expect(transits.navigate("/resume")).toBe(true);
    // The navigation is abandoned: home stays, and the camera gives up.
    vi.advanceTimersByTime(10_000);
    expect(root.attributes.has("data-transit")).toBe(false);
    // Still on home, the next click on the Resume page flies again.
    expect(transits.navigate("/resume")).toBe(true);
    expect(root.attributes.get("data-transit")).toBe("skyline");
    // And an anchor on home (the page it is on) doesn't.
    vi.advanceTimersByTime(10_000);
    expect(transits.navigate("/#work")).toBe(false);
  });

  it("flies nothing under reduced motion, and lands at once if it is reduced mid-flight", () => {
    const { host, director } = standInHost();
    const transits = start(host);
    transits.navigate("/resume");
    media.matches = true;
    for (const listener of media.listeners) listener();
    expect(director.flying()).toBeNull();
    expect(root.attributes.size).toBe(0);
    expect(transits.navigate("/resume")).toBe(false);
  });

  it("stops listening once disposed, landing any transit under way", () => {
    const { host, world, director } = standInHost();
    const transits = start(host);
    transits.navigate("/resume");
    transits.dispose();
    expect(root.attributes.size).toBe(0);
    expect(director.flying()).toBeNull();
    expect(world.listeners.size).toBe(0);
    expect(media.listeners.size).toBe(0);
  });
});
