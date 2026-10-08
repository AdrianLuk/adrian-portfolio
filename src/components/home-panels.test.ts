import { describe, expect, it } from "vitest";
import { highlightAnchor, highlights, type HighlightId } from "@/content/site";
import { findPanels } from "./home-panels";

/** A stand-in panel: all the lookup needs of one is that it can be found. */
type Panel = { id: string };

/** A stand-in for the page's lookup by id, over these Highlights' panels in this order. */
function pageOf(ids: readonly HighlightId[]) {
  const panels: Panel[] = ids.map((id) => ({ id: highlightAnchor(id) }));
  return (id: string) => panels.find((p) => p.id === id) ?? null;
}

const inContentOrder = highlights.map((h) => h.id);

describe("the Highlight panels on home", () => {
  it("are found for every Lit site, in the Lit sites' order whatever the page's", () => {
    const find = pageOf([...inContentOrder].reverse());
    expect(findPanels(find)?.map((p) => p.id)).toEqual(
      inContentOrder.map(highlightAnchor),
    );
  });

  it("are nothing at all when any one is missing", () => {
    for (const missing of inContentOrder) {
      const find = pageOf(inContentOrder.filter((id) => id !== missing));
      expect(findPanels(find), `without ${missing}`).toBeNull();
    }
  });
});
