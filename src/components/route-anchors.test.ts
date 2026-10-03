import { describe, expect, it } from "vitest";
import { litAt, routeAnchors, stopAt } from "./route-anchors";

// A 900px viewport over a page whose four panels stand at 1000, 1700, 2400
// and 3100 (each 500 tall), scrolling to 4200 at most.
const page = {
  viewport: 900,
  maxScroll: 4200,
  panels: [1000, 1700, 2400, 3100].map((top) => ({ top, height: 500 })),
};

describe("the route's anchors", () => {
  it("starts at the top, frames each site with its panel centred, ends at the foot", () => {
    // Centred: the panel's middle (top + 250) at the viewport's (scroll + 450).
    expect(routeAnchors(page)).toEqual([0, 800, 1500, 2200, 2900, 4200]);
  });

  it("never runs backwards or past the page's ends on a short page", () => {
    const short = { ...page, maxScroll: 1600 };
    expect(routeAnchors(short)).toEqual([0, 800, 1500, 1600, 1600, 1600]);
    const first = {
      ...page,
      panels: [{ top: 100, height: 300 }, ...page.panels.slice(1)],
    };
    expect(routeAnchors(first)[1]).toBe(0);
  });
});

describe("the stop at a scroll position", () => {
  const anchors = [0, 800, 1500, 2200, 2900, 4200];

  it("is each stop exactly at its anchor", () => {
    anchors.forEach((a, i) => expect(stopAt(a, anchors)).toBe(i));
  });

  it("moves evenly between anchors, at the scroll's own pace", () => {
    expect(stopAt(400, anchors)).toBeCloseTo(0.5);
    expect(stopAt(1850, anchors)).toBeCloseTo(2.5);
    expect(stopAt(3550, anchors)).toBeCloseTo(4.5);
  });

  it("holds at either end, and skips a stop the page can't reach", () => {
    expect(stopAt(-50, anchors)).toBe(0);
    expect(stopAt(9999, anchors)).toBe(5);
    const short = [0, 800, 1500, 1600, 1600, 1600];
    expect(stopAt(1600, short)).toBe(5);
    expect(stopAt(1550, short)).toBeCloseTo(2.5);
  });
});

describe("how lit a site is", () => {
  const panel = { top: 1700, height: 500 };

  it("is dark before its panel enters the viewport", () => {
    expect(litAt(700, panel, 900)).toBe(0);
  });

  it("glows up as the panel enters, and is full by the time it is well in", () => {
    // The panel's top at the viewport's foot (scroll 800), then a third of the way up.
    expect(litAt(800, panel, 900)).toBe(0);
    expect(litAt(950, panel, 900)).toBeGreaterThan(0);
    expect(litAt(950, panel, 900)).toBeLessThan(1);
    expect(litAt(1100, panel, 900)).toBe(1);
  });

  it("stays lit once passed", () => {
    expect(litAt(4000, panel, 900)).toBe(1);
  });
});
