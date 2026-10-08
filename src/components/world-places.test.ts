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
    for (const other of ["/play", "/missing", "/work/another-study"]) {
      expect(placeOf(other)).toBeNull();
      expect(transitBetween("hero", other)).toBeNull();
      expect(transitBetween("outpost", other)).toBeNull();
      expect(transitBetween("court", other)).toBeNull();
    }
    for (const place of ["/", "/resume", "/work/juice-bros"]) {
      expect(transitBetween(null, place)).toBeNull();
    }
  });
});

describe("the Juice Bros Case study's place, the court", () => {
  it("is the court, however its URL is written", () => {
    for (const url of [
      "/work/juice-bros",
      "/work/juice-bros/",
      "/work/juice-bros?x=1",
      "/work/juice-bros#approach",
      "https://adrianluk.com/work/juice-bros",
    ]) {
      expect(placeOf(url)).toBe("court");
    }
  });

  it("flies between home and the court, either way", () => {
    expect(transitBetween("hero", "/work/juice-bros")).toBe("court");
    expect(transitBetween("court", "/")).toBe("hero");
    expect(transitBetween("court", "/#work")).toBe("hero");
  });

  it("flies between the court and the Outpost, either way", () => {
    expect(transitBetween("court", "/resume")).toBe("outpost");
    expect(transitBetween("outpost", "/work/juice-bros")).toBe("court");
  });

  it("never flies within the Case study", () => {
    expect(transitBetween("court", "/work/juice-bros#approach")).toBeNull();
    expect(transitBetween("court", "/work/juice-bros?weather=snow")).toBeNull();
  });
});
