/**
 * The scroll route's link to the page, as pure maths: which stop of the route
 * the camera is at for a scroll position, and how lit each site is. The page
 * scrolls natively; these only read where it has got to.
 */

/** A panel's place on the page, in document pixels. */
export type PanelBox = { top: number; height: number };

export type PageLayout = {
  /** The viewport's height. */
  viewport: number;
  /** The furthest the page scrolls. */
  maxScroll: number;
  /** The Highlights' panels, in order. */
  panels: readonly PanelBox[];
};

/**
 * The scroll position at which the camera reaches each stop: the settled view
 * at the top, each site as its panel is centred in the viewport, the Outpost
 * at the foot of the page. Clamped to the page and never decreasing, so a
 * short page simply arrives at its last stops together.
 */
export function routeAnchors({ viewport, maxScroll, panels }: PageLayout) {
  const anchors = [0];
  for (const { top, height } of panels) {
    const centred = top + height / 2 - viewport / 2;
    anchors.push(Math.min(maxScroll, Math.max(anchors.at(-1)!, centred)));
  }
  anchors.push(maxScroll);
  return anchors;
}

/** The stop (fractional between anchors) for a scroll position. */
export function stopAt(scroll: number, anchors: readonly number[]) {
  const last = anchors.length - 1;
  if (scroll <= anchors[0]) return 0;
  for (let i = last; i > 0; i--) {
    if (scroll >= anchors[i]) {
      // Anchors that coincide all count as reached: the last of them.
      return i;
    }
    if (scroll > anchors[i - 1]) {
      return i - 1 + (scroll - anchors[i - 1]) / (anchors[i] - anchors[i - 1]);
    }
  }
  return 0;
}

/** The share of the viewport a panel rises through as its site lights. */
const LIGHT_UP = 1 / 3;

/**
 * How lit a panel's site is, 0 to 1: dark until the panel enters at the foot
 * of the viewport, full once it has risen a third of the way up, and lit from
 * then on.
 */
export function litAt(scroll: number, panel: PanelBox, viewport: number) {
  const risen = (scroll + viewport - panel.top) / (viewport * LIGHT_UP);
  return Math.min(1, Math.max(0, risen));
}
