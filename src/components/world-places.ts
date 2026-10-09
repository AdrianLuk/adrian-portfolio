/**
 * The pages that have a place in the world, and which navigations between
 * them are transits (the camera flying from one to the other). Plain data,
 * with no world in it: the root layout and the router read it before
 * anything loads.
 */

// Its type alone: the site's content stays out of the router's bundle.
import type { CaseStudySlug } from "@/content/site";

/**
 * A page's place in the world: home stands at the hero (the opening, the
 * settled view over the name plate, the scroll route), the Juice Bros Case
 * study at its court (Lit site 3's Landmark), the Resume page at the
 * Skyline (face to face with Toronto's skyline).
 */
export type Place = "hero" | "court" | "skyline";

/**
 * The Case study whose Place is the court: Juice Bros', whose Landmark it
 * is. Any other Case study has no Place, and shows a still of the world.
 */
export const COURT_CASE_STUDY = "juice-bros" satisfies CaseStudySlug;

/** The court's page (as `hrefFor` in the site's content links to it). */
const COURT_PAGE = `/work/${COURT_CASE_STUDY}`;

/**
 * The transition type every navigation that isn't a Transit carries: only a
 * commit with it crossfades. A Transit's camera flight is its transition, and
 * a commit that isn't a navigation (a page's metadata streaming in on its
 * own after it, on a slow machine) has nothing to cross.
 */
export const CROSSFADE_TRANSITION_TYPE = "crossfade";

/** A URL's page: its path, without a trailing slash, query or anchor. */
function pageOf(url: string) {
  const { pathname } = new URL(url, "http://localhost");
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

/** The place the page at `url` (a path or a full URL) has, if any. */
export function placeOf(url: string): Place | null {
  const page = pageOf(url);
  if (page === "/") return "hero";
  if (page === COURT_PAGE) return "court";
  if (page === "/resume") return "skyline";
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
