import { describe, expect, it } from "vitest";
import { caseStudies, hrefFor } from "@/content/site";
import {
  COURT_CASE_STUDY,
  placeOf,
  placeOfView,
  transitBetween,
  transitTo,
  viewOf,
} from "./world-places";

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
    for (const other of ["/missing", "/work/another-study", "/playground"]) {
      expect(placeOf(other)).toBeNull();
      expect(transitBetween("hero", other)).toBeNull();
      expect(transitBetween("skyline", other)).toBeNull();
      expect(transitBetween("court", other)).toBeNull();
      expect(transitBetween("play", other)).toBeNull();
    }
    for (const place of ["/", "/resume", "/work/juice-bros", "/rally"]) {
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

describe("/rally's place, the court seen from behind the player's baseline", () => {
  it("is the court, in a view of its own, however its URL is written", () => {
    for (const url of ["/rally", "/rally/", "/rally?weather=snow", "https://adrianluk.com/rally"]) {
      expect(placeOf(url)).toBe("court");
      expect(viewOf(url)).toBe("play");
    }
    expect(viewOf("/work/juice-bros")).toBe("court");
    expect(placeOfView("play")).toBe("court");
    expect(placeOfView("court")).toBe("court");
    expect(placeOfView("skyline")).toBe("skyline");
  });

  it("flies between home or the Skyline and /rally, either way", () => {
    expect(transitBetween("hero", "/rally")).toBe("play");
    expect(transitBetween("skyline", "/rally")).toBe("play");
    expect(transitBetween("play", "/")).toBe("hero");
    expect(transitBetween("play", "/resume")).toBe("skyline");
  });

  it("flies between the court's two views, though the Place is the same", () => {
    expect(transitBetween("court", "/rally")).toBe("play");
    expect(transitBetween("play", "/work/juice-bros")).toBe("court");
  });

  it("never flies within /rally", () => {
    expect(transitBetween("play", "/rally?weather=rain")).toBeNull();
    expect(transitBetween("play", "/rally#rally")).toBeNull();
  });
});

describe("the Home Run Derby's place, the Diamond", () => {
  it("is the Derby page's, `/derby`, however its URL is written", () => {
    for (const url of [
      "/derby",
      "/derby/",
      "/derby?x=1",
      "https://adrianluk.com/derby",
    ]) {
      expect(viewOf(url)).toBe("derby");
      expect(placeOf(url)).toBe("diamond");
    }
    expect(placeOfView("derby")).toBe("diamond");
  });

  it("crossfades, flying nowhere, until its Transit lands (#102)", () => {
    for (const from of ["hero", "court", "play", "skyline"] as const) {
      expect(transitBetween(from, "/derby")).toBeNull();
    }
    for (const to of ["/", "/work/juice-bros", "/rally", "/resume"]) {
      expect(transitBetween("derby", to)).toBeNull();
    }
    expect(transitTo("/derby")).toBeNull();
    expect(transitTo("/rally")).toBe("play");
  });
});
