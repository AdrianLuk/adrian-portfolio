import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as site from "../content/site";
import { contact, highlights, roles, sideProjects, siteUrl } from "../content/site";
import { llmsTxt } from "./llms-txt";
import sitemap from "./sitemap";

const text = llmsTxt();

function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(allStrings);
  }
  return [];
}

/** The text under one `## ` heading, up to the next. */
function section(heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  expect(start, `no "## ${heading}" section`).toBeGreaterThan(-1);
  const end = text.indexOf("\n## ", start + 1);
  return text.slice(start, end === -1 ? undefined : end);
}

describe("llms.txt", () => {
  it("opens with Adrian's name and the hero's lines, then its sections in order", () => {
    expect(text.startsWith("# Adrian Luk\n\n")).toBe(true);
    expect(text).toContain(
      "> Senior frontend engineer. React and TypeScript, plus the back end when it needs building.",
    );
    expect(text.match(/^## .+$/gm)).toEqual([
      "## Roles",
      "## Side projects",
      "## Selected work",
      "## How this site is built",
      "## Links",
    ]);
  });

  it("links Juice Bros, under Side projects, to its Case study and its live site", () => {
    const sideProjects = section("Side projects");
    expect(sideProjects).toContain("Juice Bros");
    expect(sideProjects).toContain("(https://adrianluk.com/work/juice-bros)");
    expect(sideProjects).toContain("(https://juicebrospickleball.com)");
  });

  it("quotes how the site is built verbatim, with its source", () => {
    const built = section("How this site is built");
    expect(built).toContain(contact.built.lead);
    for (const fact of contact.built.facts) expect(built).toContain(`- ${fact}`);
    expect(built).toContain("(https://github.com/AdrianLuk/adrian-portfolio)");
  });

  it("links the Resume page and PDF, the Case study, LinkedIn, GitHub and the repo", () => {
    const links = [...section("Links").matchAll(/\]\(([^)]+)\)/g)].map(
      (match) => match[1],
    );
    expect(links).toEqual([
      "https://adrianluk.com/resume",
      "https://adrianluk.com/Adrian-Luk-Resume-2026.pdf",
      "https://adrianluk.com/work/juice-bros",
      "https://www.linkedin.com/in/adrian-luk",
      "https://github.com/AdrianLuk",
      "https://github.com/AdrianLuk/adrian-portfolio",
    ]);
  });

  it("names every Role's title and company, as the Resume page shows them", () => {
    expect(text).toContain("Senior Software Engineer, Control D (Windscribe)");
    expect(text).toContain("Frontend Engineer, Studio");
    for (const role of roles) {
      expect(text).toContain(`${role.title}, ${role.company}`);
    }
  });

  it("gives every Highlight's key numbers with their labels", () => {
    expect(text).toContain("- 96 routes under a WCAG 2.1 AA suite");
    expect(text).toContain("- ~2,000 enrolled per contest");
    for (const { keyNumbers } of highlights) {
      for (const { value, label } of keyNumbers) {
        expect(text).toContain(`- ${value} ${label}`);
      }
    }
  });

  it("links on the site only to existing routes, Role anchors and files in public/", () => {
    const routes = sitemap().map((entry) => new URL(entry.url).pathname);
    const anchors = [...roles, ...sideProjects].map((item) => item.id);
    const sameSite = [...text.matchAll(/\]\(([^)]+)\)/g)]
      .map((match) => match[1])
      .filter((href) => href.startsWith(siteUrl))
      .map((href) => new URL(href));
    expect(sameSite.length).toBeGreaterThan(roles.length);
    for (const url of sameSite) {
      const where = url.href;
      if (url.hash) {
        expect(url.pathname, where).toBe("/resume");
        expect(anchors, where).toContain(url.hash.slice(1));
      } else if (!routes.includes(url.pathname)) {
        expect(existsSync(path.join("public", url.pathname)), where).toBe(true);
      }
    }
  });

  it("states no number the content module doesn't, and no Player tools count or usage", () => {
    const content = allStrings(site).join("\n");
    const numbers = text.replace(/\]\([^)]+\)/g, "]").match(/~?\d+(?:[.,]\d+)*/g) ?? [];
    expect(numbers).toContain("11,750");
    for (const number of numbers) {
      const exact = new RegExp(`(?<![\\d.,])${number.replace(/[.~]/g, "\\$&")}(?![\\d]|[.,]\\d)`);
      expect(content, number).toMatch(exact);
    }
    expect(text).not.toMatch(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)( free)?( web)?( player)? tools\b/i);
    expect(text).not.toMatch(/\b(users|visitors|traffic|downloads|adoption|installs)\b/i);
  });

  it("quotes every Highlight's title, byline and paragraph verbatim", () => {
    for (const highlight of highlights) {
      expect(text).toContain(`### ${highlight.title}`);
      expect(text).toContain(highlight.byline);
      const lines =
        typeof highlight.paragraph === "string"
          ? [highlight.paragraph]
          : highlight.paragraph;
      for (const line of lines) expect(text).toContain(line);
    }
  });
});
