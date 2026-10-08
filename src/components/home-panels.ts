import { highlightAnchor } from "@/content/site";
import { routeAnchors, stopAt, type PageLayout } from "./route-anchors";
import { LIT_SITES } from "./lit-sites";

/**
 * The scroll route's reading of home: its Highlights' panels and where they
 * stand. Plain DOM reads, with no GSAP, so a transit can ask where home's
 * scroll puts the camera before the scroll route itself has loaded.
 */

/**
 * Each Lit site's panel on home, found by its Highlight id, in the Lit sites'
 * order whatever the page's; or null if any is missing, so no panel can
 * stand for the wrong site. `find` looks a panel up by its anchor id.
 */
export function sitePanels(): HTMLElement[] | null;
export function sitePanels<Panel>(
  find: (id: string) => Panel | null,
): Panel[] | null;
export function sitePanels(
  find: (id: string) => unknown = (id) => document.getElementById(id),
) {
  const panels = LIT_SITES.map((site) => find(highlightAnchor(site.highlight)));
  return panels.every((el) => el !== null) ? panels : null;
}

/**
 * The page as the scroll route measures it: the viewport, how far it
 * scrolls, and each panel's place in the flow (a panel only ever shifts
 * sideways, so its top is where the page put it).
 */
export function pageLayout(
  panels: readonly HTMLElement[],
  maxScroll = document.documentElement.scrollHeight - window.innerHeight,
): PageLayout {
  return {
    viewport: window.innerHeight,
    maxScroll: Math.max(0, maxScroll),
    panels: panels.map((el) => ({
      top: el.getBoundingClientRect().top + window.scrollY,
      height: el.offsetHeight,
    })),
  };
}

/**
 * The scroll route's stop for home as it stands now: where its own scroll
 * (the top, an anchor, or a restored position) puts the camera. With a panel
 * missing the scroll route never starts, so the camera stays settled.
 */
export function scrolledStop() {
  const panels = sitePanels();
  if (!panels) return 0;
  return stopAt(window.scrollY, routeAnchors(pageLayout(panels)));
}
