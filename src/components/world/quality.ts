import type { Weather } from "./weather";

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

const PRECIPITATION = {
  snow: { perPixels: 700, min: 800, max: 1800 },
  rain: { perPixels: 550, min: 1100, max: 2400 },
} as const;

/**
 * Flakes or drops falling round the camera: like the motes, scaled with the
 * canvas area between a floor and a ceiling. A clear sky draws none.
 */
export function precipitationCountFor(
  weather: Weather,
  cssWidth: number,
  cssHeight: number,
) {
  if (weather === "clear") return 0;
  const { perPixels, min, max } = PRECIPITATION[weather];
  const count = Math.round((cssWidth * cssHeight) / perPixels);
  return Math.min(max, Math.max(min, count));
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
 * The segment counts round the letters' curves (per quadratic in the outline)
 * and their chamfer: the camera ends close on the plate, where large screens
 * would see the lite counts facet.
 */
export function plateFinishFor(tier: Tier) {
  return tier === "full"
    ? {
        envSize: 256,
        clearcoat: 1,
        iridescence: 0.22,
        curveSegments: 16,
        bevelSegments: 6,
      }
    : {
        envSize: 0,
        clearcoat: 0,
        iridescence: 0,
        curveSegments: 6,
        bevelSegments: 3,
      };
}

export type PlateFinish = ReturnType<typeof plateFinishFor>;

/**
 * Renderers that draw on the CPU (no GPU, or a blocklisted one): Chrome's
 * SwiftShader, Mesa's llvmpipe and softpipe, Windows' Basic Render Driver.
 */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render driver|software/i;

/**
 * Names a browser gives in place of the GPU's, saying nothing about it:
 * Chrome's and Safari's own.
 */
const MASKED = /^(webkit webgl|apple gpu)?$/i;

/**
 * Whether the world draws in software: by the renderer's name (null if the
 * browser hides it), or, only where the name says nothing, by `caveat`:
 * whether a context that refuses a major performance caveat
 * (`failIfMajorPerformanceCaveat`) is refused.
 */
export function drawsInSoftware(
  renderer: string | null,
  caveat: () => boolean,
) {
  const name = renderer?.trim() ?? "";
  return MASKED.test(name) ? caveat() : SOFTWARE.test(name);
}

/**
 * Whether the world holds its last drawn frame instead of drawing a new one.
 * Only on a software renderer, where every frame of the world slows the whole
 * page, and then only:
 * - at the court, once the camera has landed and a frame of it landed is
 *   drawn: one still frame, as under reduced motion, so the Case study's
 *   copy and its pinned Player tools scene keep their frame rate;
 * - through a Transit, until the page it flies to is in: the page gets the
 *   main thread to render in, and its copy can arrive with the camera.
 * On a real GPU the world always draws.
 */
export function holdsFrame({
  software,
  atCourt,
  flying,
  landed,
  awaitingPage,
}: {
  software: boolean;
  atCourt: boolean;
  flying: boolean;
  /** Whether the last frame drawn was drawn with the camera landed. */
  landed: boolean;
  /** Whether a Transit under way waits for the page it flies to. */
  awaitingPage: boolean;
}) {
  if (!software) return false;
  return awaitingPage || (atCourt && !flying && landed);
}
