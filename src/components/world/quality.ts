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

/**
 * Like Resend's hero, the richest version of the hero object goes to large
 * screens only: the full tier from 1024 CSS px wide (and at least 1x), the
 * lite tier for phones, small tablets and sub-1x screens.
 */
export type Tier = "full" | "lite";

export function tierFor(viewportWidth: number, devicePixelRatio: number): Tier {
  return viewportWidth >= 1024 && devicePixelRatio >= 1 ? "full" : "lite";
}

/**
 * How the name plate is finished on each tier. An envSize of 0 skips the
 * environment bake: the plate is then lit by its own emissive light alone.
 */
export function plateFinishFor(tier: Tier) {
  return tier === "full"
    ? { envSize: 256, clearcoat: 1, iridescence: 0.22 }
    : { envSize: 0, clearcoat: 0, iridescence: 0 };
}
