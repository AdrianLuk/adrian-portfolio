/**
 * The pages that have a place in the world, and which navigations between
 * them are transits (the camera flying from one to the other). Plain data,
 * with no world in it: the root layout and the router read it before
 * anything loads.
 */

/**
 * A page's place in the world: home stands at the hero (the opening, the
 * settled view over the name plate, the scroll route), the Juice Bros Case
 * study at its court (Lit site 3's Landmark), the Resume page at the
 * Outpost.
 */
export type Place = "hero" | "court" | "outpost";

/**
 * The transition type a navigation that is a transit carries: the layout's
 * crossfade is off for it, so the camera's flight is the transition.
 */
export const TRANSIT_TRANSITION_TYPE = "world-transit";

/** A URL's page: its path, without a trailing slash, query or anchor. */
function pageOf(url: string) {
  const { pathname } = new URL(url, "http://localhost");
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

/** The place the page at `url` (a path or a full URL) has, if any. */
export function placeOf(url: string): Place | null {
  const page = pageOf(url);
  if (page === "/") return "hero";
  if (page === "/work/juice-bros") return "court";
  if (page === "/resume") return "outpost";
  return null;
}

/**
 * Where a navigation from the place `from` to `to` (a path or a URL) flies
 * the camera: between any two places, either way, and nowhere else. Moving
 * within a page never flies, nor does any page with no place in the world.
 */
export function transitBetween(from: Place | null, to: string): Place | null {
  const arriving = placeOf(to);
  return from && arriving && from !== arriving ? arriving : null;
}
