import { Euler, Quaternion, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldHost, WorldIntent, WorldState } from "./world-host";
import { createWorldTransits } from "./world-transits";
import { createFlightPath, type Pose } from "./world/flight";
import { CAMERA } from "./world/pose";
import {
  FLIGHT_START_RIG,
  SETTLED_RIG,
  TRANSIT_MAX_SECONDS,
  type FlightRig,
} from "./world/rigs";
import { createRoute, outpostPose } from "./world/route";

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

/**
 * A world host as the transits see it: drawn, on home, its camera settled,
 * with its rigs and the paths home measured. `steered` is the camera's pose
 * as the transit steers it (null once handed back).
 */
function fakeHost() {
  const route = createRoute(settled, plateCentre, aspect);
  const opening = createFlightPath(settled, plateCentre);
  const listeners = new Set<() => void>();
  const world = {
    intent: "hero" as WorldIntent,
    state: "drawn" as WorldState,
    rig: { ...SETTLED_RIG } as FlightRig,
    steering: null as (() => Pose) | null,
    listeners,
  };
  const host = {
    rig: world.rig,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    state: () => world.state,
    intent: () => world.intent,
    live: () => true,
    cameraPose: () =>
      world.intent === "outpost" ? outpostPose(aspect) : settled,
    steer(source: (() => Pose) | null) {
      world.steering = source;
    },
    holdWeather() {},
    scrollRoute: () => route,
    settledPose: () => settled,
    openingPath: () => opening,
  } as unknown as WorldHost;
  return { host, world, opening };
}

/** The world's root, as the transits mark it. */
function fakeRoot() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  };
}

function expectSamePose(a: Pose, b: Pose) {
  expect(a.position.distanceTo(b.position)).toBeLessThan(1e-6);
  expect(a.quaternion.angleTo(b.quaternion)).toBeLessThan(1e-6);
}

describe("transits between home and the Resume page", () => {
  let root: ReturnType<typeof fakeRoot>;
  let media: { listeners: Set<() => void>; matches: boolean };
  const disposers: (() => void)[] = [];

  beforeEach(() => {
    root = fakeRoot();
    media = { listeners: new Set(), matches: false };
    // Home at the top of its page: the camera's stop there is the settled view.
    vi.stubGlobal("document", {
      querySelector: () => root,
      getElementById: () => null,
      documentElement: { scrollHeight: 900 },
    });
    vi.stubGlobal("window", {
      innerHeight: 900,
      scrollY: 0,
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

  /** Transits over a drawn world, its maths loaded. */
  async function start(host: WorldHost, world: ReturnType<typeof fakeHost>["world"]) {
    const transits = createWorldTransits(host);
    disposers.push(transits.dispose);
    for (const listener of world.listeners) listener();
    await vi.dynamicImportSettled();
    return transits;
  }

  it("holds the Resume page's copy back for the cap at most, though the camera has yet to land", async () => {
    const { host, world } = fakeHost();
    const transits = await start(host, world);
    expect(transits.navigate("/resume")).toBe(true);
    expect(root.attributes.get("data-transit")).toBe("outpost");
    expect(root.attributes.get("data-arriving")).toBe("outpost");

    // The page is slow to arrive: the camera waits on it, the copy doesn't.
    vi.advanceTimersByTime(TRANSIT_MAX_SECONDS * 1000 - 50);
    expect(root.attributes.get("data-arriving")).toBe("outpost");
    vi.advanceTimersByTime(100);
    expect(root.attributes.has("data-arriving")).toBe(false);
    expect(root.attributes.get("data-transit")).toBe("outpost");
  });

  it("lands on the Outpost once the Resume page is in and the camera is there", async () => {
    const { host, world } = fakeHost();
    const transits = await start(host, world);
    transits.navigate("/resume");
    world.intent = "outpost";
    vi.advanceTimersByTime(TRANSIT_MAX_SECONDS * 1000 + 100);
    expect(root.attributes.has("data-transit")).toBe(false);
    expect(root.attributes.has("data-arriving")).toBe(false);
    expect(world.steering).toBeNull();
  });

  it("leaves from where the committed page is, so a navigation that never arrives changes nothing", async () => {
    const { host, world } = fakeHost();
    const transits = await start(host, world);
    expect(transits.navigate("/resume")).toBe(true);
    // The navigation is abandoned: home stays, and the camera gives up.
    vi.advanceTimersByTime(10_000);
    expect(root.attributes.has("data-transit")).toBe(false);
    // Still on home, the next click on the Resume page flies again.
    expect(transits.navigate("/resume")).toBe(true);
    expect(root.attributes.get("data-transit")).toBe("outpost");
    // And an anchor on home (the page it is on) doesn't.
    vi.advanceTimersByTime(10_000);
    expect(transits.navigate("/#work")).toBe(false);
  });

  it("turns round mid-flight when Back goes home before the Resume page arrives", async () => {
    const { host, world } = fakeHost();
    const transits = await start(host, world);
    transits.navigate("/resume");
    vi.advanceTimersByTime(500);
    const turning = world.steering!();
    expect(transits.navigate("/")).toBe(true);
    expect(root.attributes.get("data-transit")).toBe("hero");
    expectSamePose(world.steering!(), turning);
  });

  it("leaves the opening from the camera's live pose, never snapping to the settled view", async () => {
    const { host, world, opening } = fakeHost();
    Object.assign(world.rig, FLIGHT_START_RIG, { flight: 0.6 });
    const transits = await start(host, world);
    const live = opening.poseAt(world.rig);
    expect(transits.navigate("/resume")).toBe(true);
    expectSamePose(world.steering!(), live);
    expect(world.steering!().position.distanceTo(settled.position)).toBeGreaterThan(50);
  });

  it("stops listening once disposed, landing any transit under way", async () => {
    const { host, world } = fakeHost();
    const transits = await start(host, world);
    transits.navigate("/resume");
    transits.dispose();
    expect(root.attributes.size).toBe(0);
    expect(world.steering).toBeNull();
    expect(world.listeners.size).toBe(0);
    expect(media.listeners.size).toBe(0);
  });
});
