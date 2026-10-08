import { describe, expect, it } from "vitest";
import { highlights, type HighlightId } from "@/content/site";
import { panelLook } from "./highlight-panel";

/**
 * Each panel's look as it stands today: opposite its Lit site on a wide
 * screen (pushed right when the site stands left), in its site's light.
 */
const expected: Record<HighlightId, { align: string; light: string }> = {
  "control-d": { align: "", light: "cyan" },
  "life-house": { align: "lg:ml-auto", light: "cyan" },
  "juice-bros": { align: "", light: "violet" },
  "bt-cup": { align: "lg:ml-auto", light: "cyan" },
};

describe("a Highlight panel's look", () => {
  for (const { id } of highlights) {
    describe(id, () => {
      const look = panelLook(id);
      const { align, light } = expected[id];

      it("stands opposite its Lit site on a wide screen", () => {
        expect(look.align).toBe(align);
      });

      it("burns its Lit site's light", () => {
        expect(look.bracket).toBe(`border-${light}`);
        expect(look.glow).toBe(
          `shadow-${light}/10 data-lit:shadow-${light}/25`,
        );
      });
    });
  }
});
