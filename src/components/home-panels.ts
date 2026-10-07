import { highlightAnchor } from "@/content/site";
import { routeAnchors, stopAt, type PageLayout } from "./route-anchors";
import { SITE_PLAN } from "./world/rigs";

/**
 * The scroll route's reading of home: its Highlights' panels and where they
 * stand. Plain DOM reads, with no GSAP, so a transit can ask where home's
 * scroll puts the camera before the scroll route itself has loaded.
 */

/** Each lit site's panel on home, by its Highlight, in the sites' order. */
export function sitePanels() {
  return SITE_PLAN.map((site) =>
    document.getElementById(highlightAnchor(site.highlight)),
  ).filter((el) => el !== null);
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
 * (the top, an anchor, or a restored position) puts the camera.
 */
export function scrolledStop() {
  return stopAt(window.scrollY, routeAnchors(pageLayout(sitePanels())));
}
