import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { nameGlyphs } from "./name-glyphs";
import { fitWord, unitsPerPixel, type PxRect } from "./plate-fit";

const metrics = nameGlyphs;
const { ADRIAN, LUK } = nameGlyphs.words;
const em = (metrics.ascender - metrics.descender) / metrics.unitsPerEm;

/** The inline box Chrome gives a word set in Anybody at `fontSize` px. */
function domRect(
  left: number,
  top: number,
  fontSize: number,
  advance: number,
): PxRect {
  return {
    left,
    top,
    width: (advance / metrics.unitsPerEm) * fontSize,
    height: em * fontSize,
  };
}

/** Projects a camera-space point on the plate plane back to canvas pixels. */
function toPixels(
  camera: PerspectiveCamera,
  viewport: { width: number; height: number },
  depth: number,
  x: number,
  y: number,
) {
  const p = new Vector3(x, y, -depth)
    .applyMatrix4(camera.matrixWorld)
    .project(camera);
  return {
    x: ((p.x + 1) / 2) * viewport.width,
    y: ((1 - p.y) / 2) * viewport.height,
  };
}

describe("unitsPerPixel", () => {
  it("is the visible world height at the plate's depth over the canvas height", () => {
    // 90 degrees: the half-height at depth d is d itself.
    expect(unitsPerPixel(90, 50, 1000)).toBeCloseTo(0.1);
  });
});

describe("fitWord", () => {
  const cases = [
    {
      name: "desktop, one line",
      viewport: { width: 1440, height: 820 },
      fontSize: 104,
    },
    {
      name: "phone, stacked",
      viewport: { width: 412, height: 780 },
      fontSize: 57.7,
    },
    {
      name: "2560 wide",
      viewport: { width: 2560, height: 1300 },
      fontSize: 104,
    },
  ];

  for (const { name, viewport, fontSize } of cases) {
    it(`puts the word's baseline ends where the DOM sets them (${name})`, () => {
      const camera = new PerspectiveCamera(
        40,
        viewport.width / viewport.height,
        0.1,
        2000,
      );
      camera.updateMatrixWorld();
      const depth = 60;
      const perPx = unitsPerPixel(40, depth, viewport.height);
      const rect = domRect(
        24,
        viewport.height * 0.55,
        fontSize,
        ADRIAN.advance,
      );

      const fit = fitWord(rect, ADRIAN.advance, metrics, viewport, perPx);

      const baselinePx =
        rect.top +
        (metrics.ascender / (metrics.ascender - metrics.descender)) *
          rect.height;
      const start = toPixels(camera, viewport, depth, fit.x, fit.y);
      const end = toPixels(
        camera,
        viewport,
        depth,
        fit.x + ADRIAN.advance * fit.scale,
        fit.y,
      );
      expect(start.x).toBeCloseTo(rect.left, 3);
      expect(start.y).toBeCloseTo(baselinePx, 3);
      expect(end.x).toBeCloseTo(rect.left + rect.width, 3);
      expect(end.y).toBeCloseTo(baselinePx, 3);
      expect(fit.matched).toBe(true);
    });
  }

  it("stacks LUK one line below ADRIAN at the same scale", () => {
    const viewport = { width: 390, height: 760 };
    const perPx = unitsPerPixel(40, 60, viewport.height);
    const top = domRect(16, 400, 54.6, ADRIAN.advance);
    const bottom = domRect(16, 400 + 54.6, 54.6, LUK.advance);

    const a = fitWord(top, ADRIAN.advance, metrics, viewport, perPx);
    const b = fitWord(bottom, LUK.advance, metrics, viewport, perPx);

    expect(b.scale).toBeCloseTo(a.scale, 9);
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(a.y - b.y).toBeCloseTo(54.6 * perPx, 6);
  });

  it("fits the width and centres the caps when the DOM fell back to another face", () => {
    const viewport = { width: 1280, height: 720 };
    const perPx = unitsPerPixel(40, 60, viewport.height);
    // A narrower system face: same line box, 30% less advance.
    const rect = { ...domRect(32, 300, 96, ADRIAN.advance) };
    rect.width *= 0.7;

    const fit = fitWord(rect, ADRIAN.advance, metrics, viewport, perPx);

    expect(fit.matched).toBe(false);
    expect(ADRIAN.advance * fit.scale).toBeCloseTo(rect.width * perPx, 6);
    const capMid = fit.y + (metrics.capHeight / 2) * fit.scale;
    expect(capMid).toBeCloseTo(
      (viewport.height / 2 - (rect.top + rect.height / 2)) * perPx,
      6,
    );
  });
});

describe("the generated glyphs", () => {
  it("stay inside each word's advance and the font's vertical metrics", () => {
    for (const word of Object.values(nameGlyphs.words)) {
      const nums = word.outline
        .split(" ")
        .filter((t) => !/[a-z]/.test(t))
        .map(Number);
      const xs = nums.filter((_, i) => i % 2 === 0);
      const ys = nums.filter((_, i) => i % 2 === 1);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(word.advance);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(metrics.descender);
      expect(Math.max(...ys)).toBeLessThanOrEqual(metrics.ascender);
    }
  });
});
