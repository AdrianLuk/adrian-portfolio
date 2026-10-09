import { describe, expect, it } from "vitest";
import { CAMERA } from "./pose";
import {
  bayWidth,
  corridorHalfWidth,
  HARBOUR,
  harbourWater,
  onFloor,
  surfaceHeight,
  valleyCentre,
  valleyHeight,
} from "./terrain";

describe("the valley", () => {
  it("is the same valley on every visit", () => {
    for (const [x, z] of [
      [0, -60],
      [-140, -300],
      [90, -720],
    ]) {
      expect(valleyHeight(x, z)).toBe(valleyHeight(x, z));
    }
  });

  it("runs straight down the view axis where the plate stands", () => {
    expect(valleyCentre(0)).toBe(0);
    expect(valleyCentre(-CAMERA.plateDepth)).toBe(0);
  });

  it("has a level floor wide enough for the plate on a 2560px ultrawide", () => {
    // At 2560x1080 the plate plane is about 78 world units each side.
    const z = -CAMERA.plateDepth;
    expect(corridorHalfWidth(z)).toBeGreaterThan(80);
    for (let x = -80; x <= 80; x += 4) {
      expect(Math.abs(valleyHeight(x, z))).toBeLessThan(0.6);
    }
  });

  it("swells in the foreground, so the floor reads as ground, not a panel", () => {
    const heights = [];
    for (let x = -60; x <= 60; x += 3) heights.push(valleyHeight(x, -40));
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(1.2);
  });

  it("rises into ridges on both sides, all the way down", () => {
    for (const z of [-CAMERA.plateDepth, -300, -700]) {
      const c = valleyCentre(z);
      const w = corridorHalfWidth(z);
      const floor = valleyHeight(c, z);
      expect(valleyHeight(c - w - 90, z) - floor).toBeGreaterThan(18);
      expect(valleyHeight(c + w + 90, z) - floor).toBeGreaterThan(18);
    }
  });

  it("winds further out, so the flight has something to bank through", () => {
    const offsets = [-300, -450, -600, -750].map(valleyCentre);
    expect(Math.max(...offsets.map(Math.abs))).toBeGreaterThan(20);
  });
});

describe("the harbour", () => {
  const middle = (HARBOUR.near + HARBOUR.far) / 2;

  it("lies on the floor in front of downtown, from its mouth to its end", () => {
    const c = valleyCentre(middle);
    expect(harbourWater(c, middle)).toBe(1);
    expect(harbourWater(c, HARBOUR.near + 5)).toBe(0);
    expect(harbourWater(c, HARBOUR.far - 5)).toBe(0);
    // Up to downtown's shore, short of the skyline on the valley's right.
    expect(harbourWater(c + HARBOUR.shore + 1, middle)).toBe(0);
  });

  it("opens the valley out on its left into a bay, widest midway down", () => {
    expect(bayWidth(middle)).toBeCloseTo(HARBOUR.bay);
    expect(bayWidth(HARBOUR.near)).toBe(0);
    expect(bayWidth(HARBOUR.far)).toBe(0);
    const c = valleyCentre(middle);
    const edge = corridorHalfWidth(middle) + HARBOUR.bay;
    // Water nearly to the bay's wall, then a beach, then the wall rising.
    expect(harbourWater(c - edge + HARBOUR.beach + 10, middle)).toBe(1);
    expect(harbourWater(c - edge + 2, middle)).toBe(0);
    expect(onFloor(c - edge + 2, middle)).toBe(true);
    expect(valleyHeight(c - edge - 90, middle)).toBeGreaterThan(18);
  });

  it("stands its water over a basin, below where the floor dips anywhere else", () => {
    for (let z = HARBOUR.near; z >= HARBOUR.far; z -= 10) {
      const c = valleyCentre(z);
      for (let off = -250; off <= 60; off += 3) {
        const x = c + off;
        const ground = valleyHeight(x, z);
        if (harbourWater(x, z) === 0) {
          // No stray puddle where the harbour's water isn't.
          expect(ground).toBeGreaterThan(HARBOUR.level);
        }
        expect(surfaceHeight(x, z)).toBeGreaterThanOrEqual(ground);
      }
    }
    expect(valleyHeight(valleyCentre(middle), middle)).toBeLessThan(
      HARBOUR.level,
    );
  });

  it("leaves the rest of the valley as it was", () => {
    for (const z of [-300, -420, -620, -800]) {
      expect(bayWidth(z)).toBe(0);
      expect(harbourWater(valleyCentre(z), z)).toBe(0);
    }
  });
});
