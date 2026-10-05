import { QuadraticBezierCurve } from "three";
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
 * The most any chord of the outline's curves turns from the one before it, in
 * degrees: each quadratic sampled at its segments, as three.js extrudes it.
 */
function steepestChord(outline: string, curveSegments: number) {
  let steepest = 0;
  for (const shape of outlineToShapes(outline)) {
    for (const path of [shape, ...shape.holes]) {
      for (const curve of path.curves) {
        if (!(curve instanceof QuadraticBezierCurve)) continue;
        const points = curve.getPoints(curveSegments);
        for (let i = 2; i < points.length; i++) {
          const before = points[i - 1].clone().sub(points[i - 2]);
          const after = points[i].clone().sub(points[i - 1]);
          const turn = Math.abs(
            Math.atan2(before.cross(after), before.dot(after)),
          );
          steepest = Math.max(steepest, (turn * 180) / Math.PI);
        }
      }
    }
  }
  return steepest;
}

describe("wordGeometry", () => {
  it("keeps the lite plate at its 3,564 triangles", () => {
    expect(plateTriangles("lite")).toBe(3564);
  });

  it("smooths the full plate in 12,972 triangles (the scene is ~118,000)", () => {
    expect(plateTriangles("full")).toBe(12_972);
  });

  it("turns no chord of the full plate's curves by more than 5 degrees", () => {
    const { curveSegments } = plateFinishFor("full");
    for (const word of Object.values(nameGlyphs.words)) {
      expect(steepestChord(word.outline, curveSegments)).toBeLessThanOrEqual(5);
    }
  });

  it("turns the lite plate's chords further, which is why large screens get the full one", () => {
    const { curveSegments } = plateFinishFor("lite");
    const steepest = Math.max(
      ...Object.values(nameGlyphs.words).map((w) =>
        steepestChord(w.outline, curveSegments),
      ),
    );
    expect(steepest).toBeGreaterThan(5);
  });
});
