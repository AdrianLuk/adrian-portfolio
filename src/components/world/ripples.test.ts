import { describe, expect, it } from "vitest";
import { createRipples, RIPPLE, ringAt } from "./ripples";

describe("the rings at once", () => {
  it("are at most four: the oldest drops as a fifth starts", () => {
    const ripples = createRipples();
    for (let i = 0; i < 5; i++) ripples.start(i, -i, i * 0.25);
    const rings = ripples.at(1);
    expect(rings.map((r) => r.x)).toEqual([1, 2, 3, 4]);
    expect(rings[3]).toEqual({ x: 4, z: -4, radius: 0, strength: 1 });
    expect(rings[0]).toEqual({ x: 1, z: -1, ...ringAt(0.75) });
  });

  it("drop once they have faded out", () => {
    const ripples = createRipples();
    ripples.start(0, 0, 0);
    ripples.start(5, 5, 1);
    expect(ripples.at(RIPPLE.seconds).map((r) => r.x)).toEqual([5]);
    expect(ripples.at(10)).toEqual([]);
  });
});

describe("a ripple's ring over time", () => {
  it("starts as a point at full brightness", () => {
    expect(ringAt(0)).toEqual({ radius: 0, strength: 1 });
  });

  it("spreads and fades out over about a second and a half", () => {
    const mid = ringAt(0.75);
    expect(mid.radius).toBeGreaterThan(0);
    expect(mid.strength).toBeGreaterThan(0);
    expect(mid.strength).toBeLessThan(1);
    expect(ringAt(1.5).strength).toBe(0);
    expect(ringAt(4).strength).toBe(0);
  });

  it("only ever grows, and only ever fades: it never flashes", () => {
    let last = ringAt(0);
    for (let age = 0.05; age <= 2; age += 0.05) {
      const ring = ringAt(age);
      expect(ring.radius).toBeGreaterThanOrEqual(last.radius);
      expect(ring.strength).toBeLessThanOrEqual(last.strength);
      last = ring;
    }
  });
});
