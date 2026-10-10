import { describe, expect, it } from "vitest";
import { diamondPanel, highlightAnchor, highlights } from "@/content/site";
import { findPanels } from "./home-panels";

/** A stand-in panel: all the lookup needs of one is that it can be found. */
type Panel = { id: string };

/** A stand-in for the page's lookup by id, over these panels in this order. */
function pageOf(ids: readonly string[]) {
  const panels: Panel[] = ids.map((id) => ({ id }));
  return (id: string) => panels.find((p) => p.id === id) ?? null;
}

const inContentOrder = highlights.map((h) => highlightAnchor(h.id));
const all = [...inContentOrder, diamondPanel.id];

describe("the scroll route's panels on home", () => {
  it("are each Lit site's, in the Lit sites' order whatever the page's, then the Diamond's", () => {
    const find = pageOf([diamondPanel.id, ...inContentOrder].reverse());
    expect(findPanels(find)?.map((p) => p.id)).toEqual(all);
  });

  it("are nothing at all when any one is missing", () => {
    for (const missing of all) {
      const find = pageOf(all.filter((id) => id !== missing));
      expect(findPanels(find), `without ${missing}`).toBeNull();
    }
  });
});

