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
