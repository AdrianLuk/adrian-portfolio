/** Device-dependent budgets for the world, kept here so they are tested. */

const MAX_PIXEL_RATIO = 1.5;

/** The canvas never renders above 1.5x, whatever the screen. */
export function pixelRatioFor(devicePixelRatio: number) {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
}

/** Roughly one mote per 4,500 CSS pixels of canvas, between 60 and 260. */
export function moteCountFor(cssWidth: number, cssHeight: number) {
  const count = Math.round((cssWidth * cssHeight) / 4500);
  return Math.min(260, Math.max(60, count));
}
