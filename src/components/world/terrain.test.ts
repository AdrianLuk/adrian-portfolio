import { describe, expect, it } from "vitest";
import { CAMERA } from "./pose";
import {
  bayWidth,
  corridorHalfWidth,
  HARBOUR,
  HARBOURS,
  harbourWater,
  heightShortOfHongKong,
  onFloor,
  surfaceHeight,
  valleyCentre,
  valleyHeight,
  VICTORIA_HARBOUR,
  waterAt,
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
    expect(harbourWater(c, middle, HARBOUR)).toBe(1);
    expect(harbourWater(c, HARBOUR.near + 5, HARBOUR)).toBe(0);
    expect(harbourWater(c, HARBOUR.far - 5, HARBOUR)).toBe(0);
    // Up to downtown's shore, short of the skyline on the valley's right.
    expect(harbourWater(c + HARBOUR.shore + 1, middle, HARBOUR)).toBe(0);
  });

  it("opens the valley out on its left into a bay, widest midway down", () => {
    expect(bayWidth(middle, HARBOUR)).toBeCloseTo(HARBOUR.bay);
    expect(bayWidth(HARBOUR.near, HARBOUR)).toBe(0);
    expect(bayWidth(HARBOUR.far, HARBOUR)).toBe(0);
    const c = valleyCentre(middle);
    const edge = corridorHalfWidth(middle) + HARBOUR.bay;
    // Water nearly to the bay's wall, then a beach, then the wall rising.
    expect(harbourWater(c - edge + HARBOUR.beach + 10, middle, HARBOUR)).toBe(1);
    expect(harbourWater(c - edge + 2, middle, HARBOUR)).toBe(0);
    expect(onFloor(c - edge + 2, middle)).toBe(true);
    expect(valleyHeight(c - edge - 90, middle)).toBeGreaterThan(18);
  });
});

describe("Victoria Harbour", () => {
  const middle = (VICTORIA_HARBOUR.near + VICTORIA_HARBOUR.far) / 2;

  it("lies on the floor past the route's last stop, across the valley's width", () => {
    const c = valleyCentre(middle);
    const w = corridorHalfWidth(middle);
    const left = w + bayWidth(middle, VICTORIA_HARBOUR);
    expect(harbourWater(c, middle, VICTORIA_HARBOUR)).toBe(1);
    expect(harbourWater(c - left + 12, middle, VICTORIA_HARBOUR)).toBe(1);
    expect(harbourWater(c + w - 12, middle, VICTORIA_HARBOUR)).toBe(1);
    // Short of the walls, and of either end.
    expect(harbourWater(c - left, middle, VICTORIA_HARBOUR)).toBe(0);
    expect(harbourWater(c + w, middle, VICTORIA_HARBOUR)).toBe(0);
    expect(harbourWater(c, VICTORIA_HARBOUR.near + 5, VICTORIA_HARBOUR)).toBe(0);
    expect(harbourWater(c, VICTORIA_HARBOUR.far - 5, VICTORIA_HARBOUR)).toBe(0);
  });

  it("is not Toronto's Harbour, and Toronto's is not it", () => {
    const c = valleyCentre(middle);
    expect(harbourWater(c, middle, HARBOUR)).toBe(0);
    const toronto = (HARBOUR.near + HARBOUR.far) / 2;
    expect(
      harbourWater(valleyCentre(toronto), toronto, VICTORIA_HARBOUR),
    ).toBe(0);
  });

  it("is one of the world's two harbours, and its water is the world's", () => {
    expect(HARBOURS).toEqual([HARBOUR, VICTORIA_HARBOUR]);
    expect(waterAt(valleyCentre(middle), middle)).toBe(1);
  });
});

describe("either harbour", () => {
  it("stands its water over a basin, below where the floor dips anywhere else", () => {
    for (const harbour of HARBOURS) {
      for (let z = harbour.near; z >= harbour.far; z -= 10) {
        const c = valleyCentre(z);
        for (let off = -250; off <= 60; off += 3) {
          const x = c + off;
          const ground = valleyHeight(x, z);
          if (waterAt(x, z) === 0) {
            // No stray puddle where the harbour's water isn't.
            expect(ground).toBeGreaterThan(harbour.level);
          }
          expect(surfaceHeight(x, z)).toBeGreaterThanOrEqual(ground);
        }
      }
      const middle = (harbour.near + harbour.far) / 2;
      expect(valleyHeight(valleyCentre(middle), middle)).toBeLessThan(
        harbour.level,
      );
      expect(surfaceHeight(valleyCentre(middle), middle)).toBe(harbour.level);
    }
  });

  it("leaves the rest of the valley as it was", () => {
    for (const z of [-300, -420, -620, -800, -1000]) {
      for (const harbour of HARBOURS) expect(bayWidth(z, harbour)).toBe(0);
      expect(waterAt(valleyCentre(z), z)).toBe(0);
    }
  });
});

describe("Victoria Peak", () => {
  it("rises across the valley's far end, behind Hong Kong", () => {
    for (const off of [-30, 0, 30]) {
      const ridge = Math.max(
        ...[-1380, -1400, -1420].map((z) => valleyHeight(valleyCentre(z) + off, z)),
      );
      expect(ridge).toBeGreaterThan(40);
    }
  });

  it("leaves the floor level where Hong Kong stands", () => {
    for (let z = -1190; z >= -1305; z -= 10) {
      for (const off of [-25, 0, 25]) {
        expect(Math.abs(valleyHeight(valleyCentre(z) + off, z))).toBeLessThan(2);
      }
    }
  });
});

describe("the valley short of Hong Kong", () => {
  it("is the valley itself, up to Victoria Harbour", () => {
    for (let z = 0; z > VICTORIA_HARBOUR.near; z -= 37) {
      for (const off of [-200, -60, 0, 60, 200]) {
        const x = valleyCentre(z) + off;
        expect(heightShortOfHongKong(x, z)).toBe(valleyHeight(x, z));
      }
    }
  });

  it("has neither Victoria Harbour nor Victoria Peak", () => {
    const harbour = (VICTORIA_HARBOUR.near + VICTORIA_HARBOUR.far) / 2;
    const c = valleyCentre(harbour);
    expect(heightShortOfHongKong(c, harbour)).toBeGreaterThan(
      VICTORIA_HARBOUR.level,
    );
    const peak = -1400;
    expect(heightShortOfHongKong(valleyCentre(peak), peak)).toBeLessThan(5);
  });
});
