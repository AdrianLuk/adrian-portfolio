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
 * study and the Rally game at its court (Lit site 3's Landmark), the Resume
 * page at the Skyline (face to face with Toronto's skyline).
 */
export type Place = "hero" | "court" | "skyline";

/**
 * A page's view of its Place, where the camera stands there: each Place's
 * own, but the court has one per page, courtside for the Juice Bros Case
 * study ("court") and behind the player's baseline for /play ("play"). A
 * navigation between two views of one Place is a Transit too.
 */
export type PlaceView = Place | "play";

/** The Place a view is of. */
export const placeOfView = (view: PlaceView): Place =>
  view === "play" ? "court" : view;

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

/** The view of its place the page at `url` (a path or a full URL) has, if any. */
export function viewOf(url: string): PlaceView | null {
  const page = pageOf(url);
  if (page === "/") return "hero";
  if (page === COURT_PAGE) return "court";
  if (page === "/play") return "play";
  if (page === "/resume") return "skyline";
  return null;
}

/** The place the page at `url` (a path or a full URL) has, if any. */
export function placeOf(url: string): Place | null {
  const view = viewOf(url);
  return view && placeOfView(view);
}

/**
 * Where a navigation from the view `from` to `to` (a path or a URL) flies
 * the camera: between any two views, either way (the court's two
 * included), and nowhere else. Moving within a page never flies, nor does
 * any page with no place in the world.
 */
export function transitBetween(
  from: PlaceView | null,
  to: string,
): PlaceView | null {
  const arriving = viewOf(to);
  return from && arriving && from !== arriving ? arriving : null;
}
