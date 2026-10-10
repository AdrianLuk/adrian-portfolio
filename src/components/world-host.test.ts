import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorldHost } from "./world-host";

/** The scene, without WebGL: a world that records what is asked of it. */
const scene = vi.hoisted(() => ({
  world: {
    setMotion: vi.fn(),
    setView: vi.fn(),
    setWeather: vi.fn(),
    dispose: vi.fn(),
  },
  /** What the world was built with. */
  opened: null as { weather: string; view: unknown } | null,
}));
vi.mock("./world/scene", () => ({
  createWorld: async (
    _: unknown,
    options: { weather: string; view: unknown },
  ) => {
    scene.opened = options;
    return scene.world;
  },
}));

describe("the world host", () => {
  let media: { listeners: Set<() => void>; matches: boolean };
  /** The document's pointerup listeners: the world's taps. */
  let taps: Set<unknown>;

  beforeEach(() => {
    media = { listeners: new Set(), matches: false };
    taps = new Set();
    vi.stubGlobal("document", {
      fonts: { ready: Promise.resolve() },
      addEventListener: (_: string, fn: unknown) => taps.add(fn),
      removeEventListener: (_: string, fn: unknown) => taps.delete(fn),
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
    for (const fn of Object.values(scene.world)) fn.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows the reduced-motion preference and taps once built, until disposed", async () => {
    const host = createWorldHost();
    const canvas = {} as HTMLCanvasElement;
    host.attach(canvas, { kind: "skyline", weather: "clear" });
    expect(await host.start()).toBe(scene.world);
    expect(taps.size).toBe(1);

    media.matches = true;
    for (const listener of media.listeners) listener();
    expect(scene.world.setMotion).toHaveBeenLastCalledWith(false);

    const onChange = vi.fn();
    host.subscribe(onChange);
    host.dispose();
    expect(media.listeners.size).toBe(0);
    expect(taps.size).toBe(0);
    expect(scene.world.dispose).toHaveBeenCalledOnce();
    expect(host.live()).toBe(false);
    expect(host.intent()).toBe("none");
  });

  it("shows the court and the Skyline each in the weather its page brings", async () => {
    const host = createWorldHost();
    const canvas = {} as HTMLCanvasElement;
    host.attach(canvas, { kind: "court", weather: "snow" });
    await host.start();
    expect(scene.opened).toMatchObject({
      weather: "snow",
      view: { kind: "court" },
    });
    expect(host.intent()).toBe("court");

    // On to the Resume page, and back to the Case study in the rain.
    host.attach(canvas, { kind: "skyline", weather: "snow" });
    expect(scene.world.setWeather).toHaveBeenLastCalledWith("snow");
    expect(scene.world.setView).toHaveBeenLastCalledWith({ kind: "skyline" });
    expect(host.intent()).toBe("skyline");
    host.attach(canvas, { kind: "court", weather: "rain" });
    expect(scene.world.setWeather).toHaveBeenLastCalledWith("rain");
    expect(scene.world.setView).toHaveBeenLastCalledWith({ kind: "court" });
    host.dispose();
  });

  it("disposes a world that finishes building after the host is gone", async () => {
    const host = createWorldHost();
    host.attach({} as HTMLCanvasElement, { kind: "skyline", weather: "clear" });
    const building = host.start();
    host.dispose();
    expect(await building).toBeNull();
    expect(scene.world.dispose).toHaveBeenCalledOnce();
    expect(media.listeners.size).toBe(0);
  });
});
