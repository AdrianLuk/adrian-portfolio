import { describe, expect, it } from "vitest";
import { person } from "../../content/site";
import { nameGlyphs } from "./name-glyphs";
import { outlineToShapes } from "./name-plate";

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
