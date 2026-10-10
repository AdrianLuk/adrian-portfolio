import { diamondPanel, encore, highlightAnchor } from "@/content/site";
import { pageLayout, routeAnchors, stopAt } from "./route-anchors";
import { LIT_SITES } from "./lit-sites";

/**
 * The scroll route's reading of home: its panels and where they stand. Plain
 * DOM reads, with no GSAP, so a transit can ask where home's scroll puts the
 * camera before the scroll route itself has loaded.
 */

/**
 * Home's panels in the route's order, one per stop after the first: each
 * Lit site's, found by its Highlight id, in the Lit sites' order whatever
 * the page's, then the Diamond's; or null if any is missing, so no panel can
 * stand for the wrong stop. `find` looks a panel up by its anchor id.
 */
export function findPanels<P>(find: (id: string) => P | null): P[] | null {
  const panels: P[] = [];
  for (const id of [
    ...LIT_SITES.map((site) => highlightAnchor(site.highlight)),
    diamondPanel.id,
  ]) {
    const panel = find(id);
    if (panel === null) return null;
    panels.push(panel);
  }
  return panels;
}

/** Home's panels in the route's order, or null if any is missing. */
export function routePanels() {
  return findPanels((id) => document.getElementById(id));
}

/**
 * The scroll route's stop for home as it stands now: where its own scroll
 * (the top, an anchor, or a restored position) puts the camera. With a panel
 * missing the scroll route never starts, so the camera stays settled.
 */
export function scrolledStop() {
  const panels = routePanels();
  if (!panels) return 0;
  return stopAt(window.scrollY, routeAnchors(pageLayout(panels, routeEnd())));
}

/**
 * The furthest home's scroll route runs, in scroll pixels: the closing view,
 * the bookend at the foot of the screen, short of the Encore past it (the
 * camera's way into the Arena is the Encore's own, not the route's).
 */
export function routeEnd(
  maxScroll = document.documentElement.scrollHeight - window.innerHeight,
) {
  const stretch = document.getElementById(encore.id);
  if (!stretch) return maxScroll;
  const top = stretch.getBoundingClientRect().top + window.scrollY;
  return Math.min(maxScroll, top - window.innerHeight);
}
