import { describe, expect, it } from "vitest";
import { person } from "../../content/site";
import { nameGlyphs } from "./name-glyphs";
import { outlineToShapes, wordGeometry } from "./name-plate";
import { plateFinishFor, type Tier } from "./quality";

describe("the generated glyphs", () => {
  it("cover every word of the name the site shows", () => {
    // If this fails, the name changed: rerun scripts/name-plate-glyphs.py.
    for (const word of person.name.toUpperCase().split(" ")) {
      expect(Object.keys(nameGlyphs.words)).toContain(word);
    }
  });
});

describe("outlineToShapes", () => {
  it("makes one solid per letter, with the counters cut as holes", () => {
    const adrian = outlineToShapes(nameGlyphs.words.ADRIAN.outline);
    expect(adrian).toHaveLength(6);
    // A, D, R and A have one counter each; I and N have none.
    expect(adrian.map((s) => s.holes.length).sort()).toEqual([
      0, 0, 1, 1, 1, 1,
    ]);

    const luk = outlineToShapes(nameGlyphs.words.LUK.outline);
    expect(luk.map((s) => s.holes.length)).toEqual([0, 0, 0]);
  });
});

/** Triangles in the whole plate (both words) on a tier. */
function plateTriangles(tier: Tier) {
  let triangles = 0;
  for (const word of Object.values(nameGlyphs.words)) {
    const geometry = wordGeometry(word.outline, plateFinishFor(tier));
    triangles += geometry.attributes.position.count / 3;
    geometry.dispose();
  }
  return triangles;
}

/**
 * The most any chord turns, in degrees: each quadratic in the outline turns
 * from its first tangent to its last, split evenly over its segments.
 */
function steepestChord(outline: string, curveSegments: number) {
  const t = outline.split(" ");
  let at = { x: 0, y: 0 };
  let steepest = 0;
  for (let i = 0; i < t.length; ) {
    const op = t[i++];
    if (op === "m" || op === "l") at = { x: +t[i++], y: +t[i++] };
    else if (op === "q") {
      const c = { x: +t[i++], y: +t[i++] };
      const end = { x: +t[i++], y: +t[i++] };
      const a = Math.atan2(c.y - at.y, c.x - at.x);
      const b = Math.atan2(end.y - c.y, end.x - c.x);
      let turn = Math.abs(b - a);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      steepest = Math.max(steepest, (turn * 180) / Math.PI / curveSegments);
      at = end;
    }
  }
  return steepest;
}

describe("wordGeometry", () => {
  it("keeps the lite plate at its 3,564 triangles", () => {
    expect(plateTriangles("lite")).toBe(3564);
  });

  it("smooths the full plate within a small budget (the scene is ~67,000)", () => {
    const full = plateTriangles("full");
    expect(full).toBeGreaterThan(plateTriangles("lite"));
    expect(full).toBeLessThanOrEqual(16_000);
  });

  it("turns no chord of the full plate's curves by more than 6 degrees", () => {
    const { curveSegments } = plateFinishFor("full");
    for (const word of Object.values(nameGlyphs.words)) {
      expect(steepestChord(word.outline, curveSegments)).toBeLessThanOrEqual(6);
    }
  });
});
