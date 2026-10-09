import { highlightAnchor } from "@/content/site";
import { pageLayout, routeAnchors, stopAt } from "./route-anchors";
import { LIT_SITES } from "./lit-sites";

/**
 * The scroll route's reading of home: its Highlights' panels and where they
 * stand. Plain DOM reads, with no GSAP, so a transit can ask where home's
 * scroll puts the camera before the scroll route itself has loaded.
 */

/**
 * Each Lit site's panel, found by its Highlight id, in the Lit sites' order
 * whatever the page's; or null if any is missing, so no panel can stand for
 * the wrong site. `find` looks a panel up by its anchor id.
 */
export function findPanels<P>(find: (id: string) => P | null): P[] | null {
  const panels: P[] = [];
  for (const site of LIT_SITES) {
    const panel = find(highlightAnchor(site.highlight));
    if (panel === null) return null;
    panels.push(panel);
  }
  return panels;
}

/** Each Lit site's panel on home, in the Lit sites' order, or null if any is missing. */
export function sitePanels() {
  return findPanels((id) => document.getElementById(id));
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
