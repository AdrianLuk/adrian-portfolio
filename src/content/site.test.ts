import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as site from "./site";
import {
  caseStudies,
  displayUrl,
  highlightAnchor,
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

  it("give Juice Bros, and only Juice Bros, a second link: to the Rally game", () => {
    const withSecond = highlights.filter((h) => "secondLink" in h);
    expect(withSecond.map((h) => h.id)).toEqual(["juice-bros"]);
    expect(withSecond[0].secondLink).toEqual({
      label: "Play a rally on the court",
      href: "/play",
    });
  });

  it("anchor each panel by its id, and 'See the work' goes to the first", () => {
    expect(highlightAnchor("control-d")).toBe("highlight-control-d");
    expect(site.hero.primaryAction.href).toBe(
      `#${highlightAnchor(highlights[0].id)}`,
    );
  });

  it("present the whole Control D role in three lines: SSO, Reports, then the a11y overhaul", () => {
    const controlD = highlights.find((h) => h.id === "control-d")!;
    const lines = [controlD.paragraph].flat();
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/single sign-on across four identity providers/i);
    expect(lines[1]).toMatch(/scheduled Reports feature end to end/i);
    expect(lines[2]).toMatch(/96 routes/);
    expect(lines[2]).toMatch(/accessibility/i);
    // Accessibility is not the headline.
    expect(lines[0]).not.toMatch(/accessib|WCAG|a11y/i);
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

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Mar 2024" -> months since year 0, so labels sort. */
function monthNumber(label: string): number {
  const [month, year] = label.split(" ");
  return Number(year) * 12 + MONTHS.indexOf(month);
}

function roleText(id: string): string {
  const role = roles.find((r) => r.id === id);
  if (!role) throw new Error(`No Role "${id}"`);
  return allStrings(role).join(" ");
}

describe("Roles and Side projects", () => {
  it("keep Juice Bros under Side projects and out of the Roles", () => {
    expect(sideProjects.map((p) => p.name)).toContain("Juice Bros");
    for (const role of roles) {
      expect(allStrings(role).join(" ")).not.toMatch(/juice bros/i);
    }
  });

  it("list Roles newest first, by start date", () => {
    const starts = roles.map((r) => monthNumber(r.start));
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
  });

  it("give each Role a unique id, which the Resume page uses as its anchor", () => {
    const ids = roles.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Content accuracy", () => {
  it("describes the Life House widget as primary frontend engineer", () => {
    expect(roleText("life-house")).toMatch(/primary frontend engineer/i);
  });

  it("gives BT Cup enrolment as roughly 2,000 per contest", () => {
    expect(roleText("elite-digital")).toMatch(/roughly 2,000/i);
  });

  it("limits 'architected' to the data model, REST API and React front end", () => {
    const sentence = roles
      .find((r) => r.id === "elite-digital")
      ?.bullets.find((b) => /architected/i.test(b));
    expect(sentence).toMatch(
      /Architected the data model, REST API and React front end/,
    );
    expect(sentence).not.toMatch(/SAML|SSO|admin panel|scoring/i);
  });
});

describe("displayUrl", () => {
  it("drops the scheme and a trailing slash", () => {
    expect(displayUrl("https://juicebrospickleball.com")).toBe(
      "juicebrospickleball.com",
    );
    expect(displayUrl("https://juicebrospickleball.com/")).toBe(
      "juicebrospickleball.com",
    );
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

  it("links to the Rally game on its court, with the Highlight's wording", () => {
    expect(study.links).toContainEqual({
      label: "Play a rally on the court",
      href: "/play",
    });
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

describe("Rally game copy", () => {
  const strings = allStrings(site.rally);

  it("never claims Juice Bros traffic, users or adoption, or counts the Player tools", () => {
    expect(strings.length).toBeGreaterThan(10);
    const claims = /\b(visitors?|users?|traffic|downloads?|adoption|monthly|subscribers?|members?|players? (use|love|play))\b/i;
    const countWords = /\b(\d+|two|three|four|five|six|several|a handful of)\s+(free\s+)?(player\s+)?tools\b/i;
    expect(strings.filter((s) => claims.test(s) || countWords.test(s))).toEqual([]);
  });

  it("links back to the Juice Bros Case study", () => {
    expect(site.rally.caseStudyLink.href).toBe(
      hrefFor({ kind: "case-study", slug: "juice-bros" }),
    );
  });
});

describe("Rejected wording", () => {
  const strings = allStrings({ ...site });

  it.each([
    ["btcup", /btcup/i],
    ["top committer", /top committer/i],
    ["~2,180", /2,180/],
    ["real backend ownership", /real backend ownership/i],
    ["Fin.", /\bFin\./],
  ])("no string contains %s", (_label, pattern) => {
    expect(strings.filter((s) => pattern.test(s))).toEqual([]);
  });
});

describe("Register", () => {
  const thirdPerson = /\b(he|him|his|himself|he'd)\b/i;

  it("keeps the hero, the credits and the contact copy in the first person", () => {
    // "Starring: Adrian Luk, as himself" is a credit's own idiom; every other
    // string in these three groups is the author speaking.
    const strings = allStrings({
      hero: site.hero,
      credits: {
        ...site.credits,
        lines: site.credits.lines.filter((line) => !line.startsWith("Starring")),
      },
      contact: site.contact,
    });
    expect(strings.length).toBeGreaterThan(5);
    expect(strings.filter((s) => thirdPerson.test(s))).toEqual([]);
  });
});
