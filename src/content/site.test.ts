import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as site from "./site";
import {
  caseStudies,
  highlights,
  hrefFor,
  roles,
  sideProjects,
} from "./site";
import type { CaseStudy } from "./site";
import { verifiedNumbers } from "./verified-numbers";

function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(allStrings);
  }
  return [];
}

describe("Highlights", () => {
  it("are in the order Control D, Life House, Juice Bros, BT Cup", () => {
    expect(highlights.map((h) => h.title)).toEqual([
      "Control D",
      "Life House",
      "Juice Bros",
      "BT Cup",
    ]);
  });

  it("link to a defined Case study route or an existing Role", () => {
    const roleIds = roles.map((r) => r.id);
    const slugs = caseStudies.map((c) => c.slug);
    for (const { link } of highlights) {
      if (link.kind === "role") expect(roleIds).toContain(link.roleId);
      else expect(slugs).toContain(link.slug);
    }
  });

  it("resolve to Resume page anchors and Case study routes", () => {
    expect(hrefFor({ kind: "role", roleId: "control-d" })).toBe(
      "/resume#control-d",
    );
    expect(hrefFor({ kind: "case-study", slug: "juice-bros" })).toBe(
      "/work/juice-bros",
    );
  });

  it("carry exactly two key numbers from the verified allowlist, except Juice Bros, which has none", () => {
    for (const highlight of highlights) {
      expect(highlight.keyNumbers).toHaveLength(
        highlight.id === "juice-bros" ? 0 : 2,
      );
      const allowed = verifiedNumbers[highlight.id];
      for (const n of highlight.keyNumbers) {
        expect(allowed).toContainEqual(
          expect.objectContaining({ value: n.value, label: n.label }),
        );
      }
    }
  });
});

describe("Roles and Side projects", () => {
  it("keep Juice Bros under Side projects and out of the Roles", () => {
    expect(sideProjects.map((p) => p.name)).toContain("Juice Bros");
    for (const role of roles) {
      expect(allStrings(role).join(" ")).not.toMatch(/juice bros/i);
    }
  });
});

describe("Juice Bros Case study", () => {
  const study: CaseStudy = caseStudies.find((c) => c.slug === "juice-bros")!;
  const prose = allStrings([study.sections, study.tools.map((t) => t.summary)]);

  it("has the four sections, each with text", () => {
    expect(study.sections.map((s) => s.id)).toEqual([
      "problem",
      "what-i-did",
      "approach",
      "outcome",
    ]);
    for (const s of study.sections) {
      expect(s.heading).not.toBe("");
      expect(s.paragraphs.length).toBeGreaterThan(0);
    }
  });

  it("links out to the live site, each Player tool and the public repo", () => {
    const hrefs = study.links.map((l) => l.href);
    expect(hrefs).toContain("https://juicebrospickleball.com");
    expect(hrefs).toContain("https://github.com/AdrianLuk/juice-bros");
    for (const tool of study.tools) expect(hrefs).toContain(tool.url);
    expect(new Set(study.links.map((l) => l.label)).size).toBe(
      study.links.length,
    );
  });

  it("covers the current Player tools without counting them", () => {
    expect(study.tools.map((t) => t.name)).toEqual([
      "Booking Buddy",
      "Pickle Point Pal",
      "Match Mixer",
      "Drum Roll",
    ]);
    const countWords = /\b(\d+|two|three|four|five|six|several|a handful of)\s+(free\s+)?(player\s+)?tools\b/i;
    expect(prose.filter((s) => countWords.test(s))).toEqual([]);
  });

  it("never claims traffic, users or adoption, or that every tool is no-login", () => {
    const claims = /\b(visitors?|users?|traffic|downloads?|adoption|monthly|subscribers?|listeners?)\b|no[- ]login|no[- ]sign[- ]?up for (all|every)/i;
    expect(prose.filter((s) => claims.test(s))).toEqual([]);
    const booking = study.tools.find((t) => t.name === "Booking Buddy")!;
    expect(booking.access).toBe("account");
  });

  it("states the verified outcome only", () => {
    const outcome = allStrings(
      study.sections.find((s) => s.id === "outcome"),
    ).join(" ");
    expect(outcome).toMatch(/live/i);
    expect(outcome).toMatch(/I built it, I run it/i);
    expect(outcome).toMatch(/only engineer|sole engineer/i);
    expect(outcome).toMatch(/my own play/i);
    expect(outcome).not.toMatch(/\d/);
  });

  it("has screenshots at both widths for the home page and every tool, with alt text", () => {
    const shots = [study.home, ...study.tools].flatMap((s) => [
      s.screenshots.desktop,
      s.screenshots.phone,
    ]);
    expect(shots).toHaveLength(2 * (1 + study.tools.length));
    for (const shot of shots) {
      expect(shot.alt.length).toBeGreaterThan(20);
      expect(shot.width).toBeGreaterThan(0);
      expect(shot.height).toBeGreaterThan(0);
    }
  });

  it("ships every media file it references, and gives each recording a poster", () => {
    const files = [study.home, ...study.tools].flatMap((s) => [
      s.screenshots.desktop.src,
      s.screenshots.phone.src,
      ...("recording" in s && s.recording
        ? [s.recording.poster, ...s.recording.sources.map((x) => x.src)]
        : []),
    ]);
    for (const src of files) {
      expect(existsSync(path.join("public", src)), src).toBe(true);
    }
    const recordings = study.tools.filter((t) => t.recording);
    expect(recordings.length).toBeGreaterThanOrEqual(1);
    expect(recordings.length).toBeLessThanOrEqual(2);
  });

  it("sets page metadata", () => {
    expect(study.metaTitle).toMatch(/Juice Bros/);
    expect(study.metaDescription.length).toBeGreaterThan(40);
  });
});

describe("Rejected wording", () => {
  const strings = allStrings({ ...site });

  it.each([
    ["btcup", /btcup/i],
    ["real backend ownership", /real backend ownership/i],
    ["Fin.", /\bFin\./],
  ])("no string contains %s", (_label, pattern) => {
    expect(strings.filter((s) => pattern.test(s))).toEqual([]);
  });
});
