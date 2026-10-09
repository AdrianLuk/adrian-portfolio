import { describe, expect, it } from "vitest";
import { caseStudies, hrefFor } from "@/content/site";
import { COURT_CASE_STUDY, placeOf, transitBetween } from "./world-places";

describe("which navigations are transits", () => {
  it("flies from home down the valley to the Resume page", () => {
    expect(transitBetween("hero", "/resume")).toBe("skyline");
  });

  it("flies from the Resume page back up the valley home, to any of home's anchors", () => {
    expect(transitBetween("skyline", "/")).toBe("hero");
    expect(transitBetween("skyline", "/#work")).toBe("hero");
    expect(transitBetween("skyline", "/#contact")).toBe("hero");
  });

  it("reads full URLs (Back and Forward) and query strings as their page", () => {
    expect(transitBetween("skyline", "https://adrianluk.com/")).toBe("hero");
    expect(transitBetween("hero", "/resume?x=1")).toBe("skyline");
    expect(placeOf("/?weather=snow")).toBe("hero");
    expect(placeOf("/resume/")).toBe("skyline");
  });

  it("never flies within a page (an anchor on home is the scroll route's)", () => {
    expect(transitBetween("hero", "/#work")).toBeNull();
    expect(transitBetween("skyline", "/resume#control-d")).toBeNull();
  });

  it("never flies to or from a page with no place in the world", () => {
    for (const other of ["/play", "/missing", "/work/another-study"]) {
      expect(placeOf(other)).toBeNull();
      expect(transitBetween("hero", other)).toBeNull();
      expect(transitBetween("skyline", other)).toBeNull();
      expect(transitBetween("court", other)).toBeNull();
    }
    for (const place of ["/", "/resume", "/work/juice-bros"]) {
      expect(transitBetween(null, place)).toBeNull();
    }
  });
});

describe("the Juice Bros Case study's place, the court", () => {
  it("is the Juice Bros Case study's, and no other Case study's", () => {
    expect(COURT_CASE_STUDY).toBe("juice-bros");
    for (const { slug } of caseStudies) {
      const page = hrefFor({ kind: "case-study", slug });
      expect(placeOf(page)).toBe(slug === "juice-bros" ? "court" : null);
    }
    expect(caseStudies.map((c) => c.slug)).toContain(COURT_CASE_STUDY);
  });

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

  it("flies between the court and the Skyline, either way", () => {
    expect(transitBetween("court", "/resume")).toBe("skyline");
    expect(transitBetween("skyline", "/work/juice-bros")).toBe("court");
  });

  it("never flies within the Case study", () => {
    expect(transitBetween("court", "/work/juice-bros#approach")).toBeNull();
    expect(transitBetween("court", "/work/juice-bros?weather=snow")).toBeNull();
  });
});
