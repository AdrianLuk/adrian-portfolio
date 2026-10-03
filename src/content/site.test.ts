import { describe, expect, it } from "vitest";
import * as site from "./site";
import {
  caseStudies,
  highlights,
  hrefFor,
  roles,
  sideProjects,
} from "./site";
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthIndex = (label: string) => {
  const [month, year] = label.split(" ");
  return Number(year) * 12 + MONTHS.indexOf(month);
};

describe("Roles", () => {
  it("run newest first, by start date", () => {
    const starts = roles.map((r) => monthIndex(r.start));
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
  });

  it("have unique ids, which the Resume page uses as anchors", () => {
    const ids = roles.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Content accuracy", () => {
  const role = (id: string) => roles.find((r) => r.id === id)!;

  it("describes the Life House widget as primary frontend engineer, never top committer", () => {
    const lifeHouse = allStrings(role("life-house")).join(" ");
    expect(lifeHouse).toMatch(/primary frontend engineer/i);
    expect(lifeHouse).not.toMatch(/top committer/i);
  });

  it("gives BT Cup enrolment as roughly 2,000 per contest", () => {
    const btCup = allStrings(role("elite-digital")).join(" ");
    expect(btCup).toMatch(/roughly 2,000/i);
    expect(btCup).not.toMatch(/2,180/);
  });

  it("limits 'architected' to the data model, REST API and React front end", () => {
    const sentence = role("elite-digital").bullets.find((b) =>
      /architected/i.test(b),
    );
    expect(sentence).toMatch(/Architected the data model, REST API and React front end/);
    expect(sentence).not.toMatch(/SAML|SSO|admin panel|scoring/i);
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
