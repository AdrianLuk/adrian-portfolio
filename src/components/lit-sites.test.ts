import { describe, expect, it } from "vitest";
import { highlights } from "@/content/site";
import { LIT_SITES, litSite } from "./lit-sites";

describe("the Lit sites", () => {
  it("are one per Highlight, in the Highlights' content order", () => {
    expect(LIT_SITES.map((s) => s.highlight)).toEqual(
      highlights.map((h) => h.id),
    );
  });

  it("stand where they stand today: 180 apart down the valley, first on the right, alternating", () => {
    expect(LIT_SITES.map(({ z, side }) => ({ z, side }))).toEqual([
      { z: -420, side: 1 },
      { z: -600, side: -1 },
      { z: -780, side: 1 },
      { z: -960, side: -1 },
    ]);
  });

  it("burn cyan, except Juice Bros, which burns violet", () => {
    expect(
      Object.fromEntries(LIT_SITES.map((s) => [s.highlight, s.light])),
    ).toEqual({
      "control-d": "cyan",
      "life-house": "cyan",
      "juice-bros": "violet",
      "bt-cup": "cyan",
    });
  });

  it("are found by Highlight id, as the list has them", () => {
    for (const site of LIT_SITES) {
      expect(litSite(site.highlight)).toBe(site);
    }
  });
});
