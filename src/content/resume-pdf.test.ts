import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { beforeAll, describe, expect, it } from "vitest";
import { person, resume, roles, sideProjects } from "./site";

const publicDir = path.join(process.cwd(), "public");

/**
 * Whitespace-free and straight-quoted, so PDF line wraps and the word
 * processor's curly apostrophes can't cause false misses.
 */
const squash = (s: string) => s.replace(/\s+/g, "").replace(/[’‘]/g, "'");

let pdfText: string;

beforeAll(async () => {
  const data = await readFile(path.join(publicDir, resume.pdfHref));
  const parser = new PDFParse({ data });
  pdfText = squash((await parser.getText()).text);
  await parser.destroy();
});

describe("Resume PDF", () => {
  it("is served from the public folder at the href the page links to", () => {
    expect(resume.pdfHref).toMatch(/\.pdf$/);
  });

  it("names every Role's company, title and date range, as the Resume page does", () => {
    for (const role of roles) {
      expect(pdfText, `${role.company}`).toContain(
        squash(`${role.title}, ${role.company}`),
      );
      expect(pdfText, `${role.company} dates`).toContain(
        squash(`${role.start} - ${role.end}`),
      );
    }
  });

  it("carries every Role bullet and Side project bullet from the Resume page", () => {
    for (const role of roles) {
      for (const bullet of role.bullets) {
        expect(pdfText, `${role.company}: ${bullet.slice(0, 40)}`).toContain(
          squash(bullet),
        );
      }
    }
    for (const project of sideProjects) {
      expect(pdfText).toContain(squash(project.name));
      for (const bullet of project.bullets) {
        expect(pdfText, `${project.name}: ${bullet.slice(0, 40)}`).toContain(
          squash(bullet),
        );
      }
    }
  });

  it("keeps email, Toronto, LinkedIn and GitHub in the header", () => {
    expect(pdfText).toContain(squash(person.location));
    expect(pdfText).toContain("adrianluk618@gmail.com");
    expect(pdfText).toContain("linkedin.com/in/adrian-luk");
    expect(pdfText).toContain("github.com/AdrianLuk");
  });

  it("has no phone number", () => {
    expect(pdfText).not.toMatch(/\d{3}[-.)]?\d{3}[-.]?\d{4}/);
    expect(pdfText).not.toMatch(/tel:/i);
  });

  it("spells BT Cup as the site does, never btcup", () => {
    expect(pdfText).not.toMatch(/btcup/i);
  });
});
