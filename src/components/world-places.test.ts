import { describe, expect, it } from "vitest";
import { placeOf, transitBetween } from "./world-places";

describe("which navigations are transits", () => {
  it("flies from home down the valley to the Resume page", () => {
    expect(transitBetween("hero", "/resume")).toBe("outpost");
  });

  it("flies from the Resume page back up the valley home, to any of home's anchors", () => {
    expect(transitBetween("outpost", "/")).toBe("hero");
    expect(transitBetween("outpost", "/#work")).toBe("hero");
    expect(transitBetween("outpost", "/#contact")).toBe("hero");
  });

  it("reads full URLs (Back and Forward) and query strings as their page", () => {
    expect(transitBetween("outpost", "https://adrianluk.com/")).toBe("hero");
    expect(transitBetween("hero", "/resume?x=1")).toBe("outpost");
    expect(placeOf("/?weather=snow")).toBe("hero");
    expect(placeOf("/resume/")).toBe("outpost");
  });

  it("never flies within a page (an anchor on home is the scroll route's)", () => {
    expect(transitBetween("hero", "/#work")).toBeNull();
    expect(transitBetween("outpost", "/resume#control-d")).toBeNull();
  });

  it("never flies to or from a page with no place in the world", () => {
    for (const other of ["/work/juice-bros", "/play", "/missing"]) {
      expect(placeOf(other)).toBeNull();
      expect(transitBetween("hero", other)).toBeNull();
      expect(transitBetween("outpost", other)).toBeNull();
      expect(transitBetween(null, "/")).toBeNull();
      expect(transitBetween(null, "/resume")).toBeNull();
    }
  });
});
