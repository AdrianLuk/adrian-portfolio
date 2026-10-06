import { describe, expect, it } from "vitest";
import { layoutCourt } from "./court";
import { COURT } from "./court-size";
import { palette } from "./palette";

const scale = 0.8;
const court = layoutCourt({
  x: 30,
  z: -780,
  level: 1,
  scale,
  color: palette.violet,
});

/** The lines' outer edges, along x and z. */
function extent(axis: "x" | "z") {
  const size = axis === "x" ? "w" : "d";
  const lo = Math.min(...court.lines.map((b) => b[axis] - b[size] / 2));
  const hi = Math.max(...court.lines.map((b) => b[axis] + b[size] / 2));
  return { lo, hi, span: hi - lo };
}

describe("the pickleball court", () => {
  it("is 20 by 44, its length down the valley", () => {
    expect(COURT.width / COURT.length).toBeCloseTo(20 / 44);
    expect(extent("x").span).toBeCloseTo(COURT.width * scale);
    expect(extent("z").span).toBeCloseTo(COURT.length * scale);
  });

  it("has a kitchen 7 deep each side of the net", () => {
    expect(COURT.kitchen).toBe(7);
    const width = COURT.width * scale;
    const across = court.lines.filter((b) => Math.abs(b.w - width) < 1e-6);
    // Two baselines and two kitchen lines, the kitchen's outer edges 7 out.
    const edges = across
      .map((b) => Math.abs(b.z - court.net.z) + b.d / 2)
      .sort((a, b) => a - b);
    expect(edges).toHaveLength(4);
    expect(edges[0]).toBeCloseTo(COURT.kitchen * scale);
    expect(edges[1]).toBeCloseTo(COURT.kitchen * scale);
    expect(edges[2]).toBeCloseTo((COURT.length / 2) * scale);
  });

  it("splits each service court with a centre line from kitchen to baseline", () => {
    const centre = court.lines.filter(
      (b) =>
        Math.abs(b.x - 30) < 1e-6 && b.w < 1 && b.d < COURT.length * scale - 1,
    );
    expect(centre).toHaveLength(2);
    for (const b of centre) {
      expect(b.d).toBeCloseTo((COURT.length / 2 - COURT.kitchen) * scale);
    }
  });

  it("stretches the net across the middle at 34 inches, 36 at the posts", () => {
    expect(court.net.z).toBeCloseTo(-780);
    expect(court.net.h).toBeCloseTo((34 / 12) * scale);
    expect(court.net.w).toBeGreaterThan(COURT.width * scale);
    for (const post of court.posts) {
      expect(post.y + post.h / 2 - court.top).toBeCloseTo((36 / 12) * scale);
    }
  });

  it("lies on a level plinth above the ground under it", () => {
    for (const b of [...court.lines, ...court.surfaces]) {
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(court.top - 1e-6);
    }
    expect(court.plinth.y + court.plinth.h / 2).toBeCloseTo(court.top);
  });
});
