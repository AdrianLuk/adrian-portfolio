import { describe, expect, it } from "vitest";
import { CAMERA } from "./pose";
import { corridorHalfWidth, valleyCentre, valleyHeight } from "./terrain";

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
