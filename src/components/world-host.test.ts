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
}));
vi.mock("./world/scene", () => ({
  createWorld: async () => scene.world,
}));

describe("the world host", () => {
  let media: { listeners: Set<() => void>; matches: boolean };

  beforeEach(() => {
    media = { listeners: new Set(), matches: false };
    vi.stubGlobal("document", { fonts: { ready: Promise.resolve() } });
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

  it("follows the reduced-motion preference once built, until disposed", async () => {
    const host = createWorldHost();
    const canvas = {} as HTMLCanvasElement;
    host.attach(canvas, { kind: "outpost" });
    expect(await host.start()).toBe(scene.world);

    media.matches = true;
    for (const listener of media.listeners) listener();
    expect(scene.world.setMotion).toHaveBeenLastCalledWith(false);

    const onChange = vi.fn();
    host.subscribe(onChange);
    host.dispose();
    expect(media.listeners.size).toBe(0);
    expect(scene.world.dispose).toHaveBeenCalledOnce();
    expect(host.live()).toBe(false);
    expect(host.intent()).toBe("none");
  });

  it("disposes a world that finishes building after the host is gone", async () => {
    const host = createWorldHost();
    host.attach({} as HTMLCanvasElement, { kind: "outpost" });
    const building = host.start();
    host.dispose();
    expect(await building).toBeNull();
    expect(scene.world.dispose).toHaveBeenCalledOnce();
    expect(media.listeners.size).toBe(0);
  });
});
