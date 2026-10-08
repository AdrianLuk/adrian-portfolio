import { describe, expect, it } from "vitest";
import { highlights } from "@/content/site";
import { panelLook } from "./highlight-panel";
import { litSite } from "./lit-sites";

describe("a Highlight panel's look", () => {
  for (const { id } of highlights) {
    describe(id, () => {
      const site = litSite(id);
      const look = panelLook(id);

      it("stands opposite its Lit site on a wide screen", () => {
        // Pushed right when its site stands left; left, as the page flows, when it stands right.
        expect(look.align).toBe(site.side < 0 ? "lg:ml-auto" : "");
      });

      it("burns its Lit site's light", () => {
        expect(look.bracket).toBe(`border-${site.light}`);
        expect(look.glow).toBe(
          `shadow-${site.light}/10 data-lit:shadow-${site.light}/25`,
        );
      });
    });
  }
});
