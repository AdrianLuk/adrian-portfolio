import { highlights, type HighlightId } from "@/content/site";

/**
 * The Lit sites: one per Highlight, in the Highlights' content order, the
 * only list of them. Plain data with no Three.js, GSAP or client-only code,
 * so the server-rendered page, the Highlight panel and the world all read it.
 */

/**
 * A Lit site: the Highlight it stands for, its depth down the valley, which
 * side it stands (+1 = right, +x), and the light it burns (its panel's
 * accent, and its Landmark's).
 */
export type LitSite = {
  highlight: HighlightId;
  z: number;
  side: 1 | -1;
  light: "cyan" | "violet";
};

/** The first site's depth, and how much further down the valley each next one stands. */
const FIRST_DEPTH = -420;
const SPACING = 180;

/** Cyan is the world's light; Juice Bros, the Side project, burns violet. */
const LIGHTS: Partial<Record<HighlightId, LitSite["light"]>> = {
  "juice-bros": "violet",
};

/**
 * The Lit sites down the valley, alternating sides, the first on the right:
 * on a wide screen each panel stands opposite its site, so the site stands
 * clear. The first is the light on the horizon once the camera settles.
 */
export const LIT_SITES: readonly LitSite[] = highlights.map(({ id }, i) => ({
  highlight: id,
  z: FIRST_DEPTH - SPACING * i,
  side: i % 2 === 0 ? 1 : -1,
  light: LIGHTS[id] ?? "cyan",
}));

/** The Lit site that stands for a Highlight. */
export function litSite(id: HighlightId): LitSite {
  const site = LIT_SITES.find((s) => s.highlight === id);
  if (!site) throw new Error(`No Lit site for Highlight ${id}`);
  return site;
}
