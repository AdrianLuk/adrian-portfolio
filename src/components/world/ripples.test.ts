import { describe, expect, it } from "vitest";
import { createRipples, RIPPLE, ringAt } from "./ripples";

describe("the rings at once", () => {
  it("are at most four: the oldest drops as a fifth starts", () => {
    const ripples = createRipples<string>();
    for (const [i, at] of ["a", "b", "c", "d", "e"].entries()) {
      ripples.start(at, i * 0.25);
    }
    const rings = ripples.lit(1);
    expect(rings.map((r) => r.at)).toEqual(["b", "c", "d", "e"]);
    expect(rings[3]).toEqual({ at: "e", spread: 0, strength: 1 });
    expect(rings[0]).toEqual({ at: "b", ...ringAt(0.75) });
  });

  it("drop once they have faded out", () => {
    const ripples = createRipples<string>();
    ripples.start("first", 0);
    ripples.start("second", 1);
    expect(ripples.lit(RIPPLE.seconds).map((r) => r.at)).toEqual(["second"]);
    expect(ripples.lit(10)).toEqual([]);
  });
});

describe("a ripple's ring over time", () => {
  it("starts as a point at full brightness", () => {
    expect(ringAt(0)).toEqual({ spread: 0, strength: 1 });
  });

  it("spreads all the way and fades out over about a second and a half", () => {
    const mid = ringAt(0.75);
    expect(mid.spread).toBeGreaterThan(0.5);
    expect(mid.spread).toBeLessThan(1);
    expect(mid.strength).toBeGreaterThan(0);
    expect(mid.strength).toBeLessThan(1);
    expect(ringAt(1.5)).toEqual({ spread: 1, strength: 0 });
    expect(ringAt(4)).toEqual({ spread: 1, strength: 0 });
  });

  it("only ever grows, and only ever fades: it never flashes", () => {
    let last = ringAt(0);
    for (let age = 0.05; age <= 2; age += 0.05) {
      const ring = ringAt(age);
      expect(ring.spread).toBeGreaterThanOrEqual(last.spread);
      expect(ring.strength).toBeLessThanOrEqual(last.strength);
      last = ring;
    }
  });
});
