/**
 * Where the name plate stands so that, seen from the settled camera, it covers
 * the DOM headline exactly. Pure maths, so it is unit tested without WebGL.
 *
 * Coordinates: pixels are canvas-relative (y down); the result is in camera
 * space on the plate plane (y up, origin on the view axis).
 */

export type PxRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type FontMetrics = {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  capHeight: number;
};

export type Viewport = { width: number; height: number };

export type WordFit = {
  /** Baseline-left origin of the word. */
  x: number;
  y: number;
  /** World units per font unit. */
  scale: number;
  /** False when the DOM set the word in a fallback face and the fit is by width. */
  matched: boolean;
};

/** How wide a gap between the DOM's width and Anybody's still counts as Anybody. */
const WIDTH_TOLERANCE = 0.03;

/** World units one canvas pixel spans on a plane `depth` in front of the camera. */
export function unitsPerPixel(
  fovYDeg: number,
  depth: number,
  viewportHeight: number,
) {
  const visibleHeight = 2 * depth * Math.tan(((fovYDeg / 2) * Math.PI) / 180);
  return visibleHeight / viewportHeight;
}

/**
 * Fits one word of the plate to its DOM inline box. The box spans the font's
 * typo ascender to descender, so the baseline and the font size follow from it.
 * If the DOM fell back to another face (display: optional), the widths differ:
 * the plate then fills the box's width and centres its caps on the line.
 */
export function fitWord(
  rect: PxRect,
  advance: number,
  metrics: FontMetrics,
  viewport: Viewport,
  perPx: number,
): WordFit {
  const { unitsPerEm, ascender, descender, capHeight } = metrics;
  const toWorldX = (px: number) => (px - viewport.width / 2) * perPx;
  const toWorldY = (py: number) => (viewport.height / 2 - py) * perPx;

  const fontSize = rect.height / ((ascender - descender) / unitsPerEm);
  const expectedWidth = (advance / unitsPerEm) * fontSize;
  const matched =
    Math.abs(rect.width - expectedWidth) <= expectedWidth * WIDTH_TOLERANCE;
  // Scale from the DOM's own width, so both ends of the word land.
  const scale = (rect.width * perPx) / advance;
  const x = toWorldX(rect.left);

  if (matched) {
    const baseline =
      rect.top + (ascender / (ascender - descender)) * rect.height;
    return { x, y: toWorldY(baseline), scale, matched };
  }

  const capMid = toWorldY(rect.top + rect.height / 2);
  return { x, y: capMid - (capHeight / 2) * scale, scale, matched };
}
