import { describe, expect, it } from "vitest";
import { sitePanels } from "./home-panels";

/** A stand-in panel: all the lookup needs of one is that it can be found. */
type Panel = { id: string };

/** A stand-in for the page's lookup by id, over panels in the page's order. */
function pageOf(ids: readonly string[]) {
  const panels: Panel[] = ids.map((id) => ({ id }));
  return (id: string) => panels.find((p) => p.id === id) ?? null;
}

describe("the Highlight panels on home", () => {
  it("are found for every Lit site, in the Lit sites' order whatever the page's", () => {
    const find = pageOf([
      "highlight-bt-cup",
      "highlight-juice-bros",
      "highlight-control-d",
      "highlight-life-house",
    ]);
    expect(sitePanels(find)?.map((p) => p.id)).toEqual([
      "highlight-control-d",
      "highlight-life-house",
      "highlight-juice-bros",
      "highlight-bt-cup",
    ]);
  });

  it("are nothing at all when any one is missing", () => {
    const find = pageOf([
      "highlight-control-d",
      "highlight-juice-bros",
      "highlight-bt-cup",
    ]);
    expect(sitePanels(find)).toBeNull();
  });
});
