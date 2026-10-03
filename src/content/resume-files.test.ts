import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { beforeAll, describe, expect, it } from "vitest";
import { readZip } from "./read-zip";
import { person, resume, roles, sideProjects } from "./site";

const publicDir = path.join(process.cwd(), "public");

/**
 * Whitespace-free and straight-quoted, so PDF line wraps and the word
 * processor's curly apostrophes can't cause false misses.
 */
const squash = (s: string) => s.replace(/\s+/g, "").replace(/[’‘]/g, "'");

const PHONE = /\d{3}[-.)]?\d{3}[-.]?\d{4}/;

type Loaded = {
  /** The visible text, squashed. */
  text: string;
  /** Everything else that could carry a phone number: link targets, rels, metadata. */
  hidden: string;
  magic: string;
};

async function loadPdf(data: Buffer): Promise<Loaded> {
  const parser = new PDFParse({ data });
  const { text } = await parser.getText();
  const info = await parser.getInfo({ parsePageInfo: true });
  await parser.destroy();
  return {
    text: squash(text),
    hidden: JSON.stringify(info.pages),
    magic: data.subarray(0, 5).toString("latin1"),
  };
}

function loadDocx(data: Buffer): Loaded {
  const entries = readZip(data);
  const document = entries.get("word/document.xml")?.toString("utf8") ?? "";
  const text = [...document.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .map((m) => m[1])
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return {
    text: squash(text),
    hidden: [...entries.values()].map((b) => b.toString("utf8")).join("\n"),
    magic: data.subarray(0, 2).toString("latin1"),
  };
}

const formats = [
  { name: "PDF", href: resume.pdfHref, ext: ".pdf", magic: "%PDF-", load: loadPdf },
  { name: "DOCX", href: resume.docxHref, ext: ".docx", magic: "PK", load: loadDocx },
];

describe.each(formats)("Resume $name", ({ href, ext, magic, load }) => {
  let file: Loaded;

  beforeAll(async () => {
    file = await load(await readFile(path.join(publicDir, href)));
  });

  it("is a real file in the public folder, at the href the page links to", () => {
    expect(href.endsWith(ext)).toBe(true);
    expect(file.magic).toBe(magic);
  });

  it("names every Role's company, title and date range, as the Resume page does", () => {
    for (const role of roles) {
      expect(file.text, role.company).toContain(
        squash(`${role.title}, ${role.company}`),
      );
      expect(file.text, `${role.company} dates`).toContain(
        squash(`${role.start} - ${role.end}`),
      );
    }
  });

  it("carries every Role bullet and Side project bullet from the Resume page", () => {
    for (const role of roles) {
      for (const bullet of role.bullets) {
        expect(file.text, `${role.company}: ${bullet.slice(0, 40)}`).toContain(
          squash(bullet),
        );
      }
    }
    for (const project of sideProjects) {
      expect(file.text).toContain(squash(project.name));
      for (const bullet of project.bullets) {
        expect(file.text, `${project.name}: ${bullet.slice(0, 40)}`).toContain(
          squash(bullet),
        );
      }
    }
  });

  it("keeps email, Toronto, LinkedIn and GitHub in the header", () => {
    expect(file.text).toContain(squash(person.location));
    expect(file.text).toContain("adrianluk618@gmail.com");
    expect(file.text).toContain("linkedin.com/in/adrian-luk");
    expect(file.text).toContain("github.com/AdrianLuk");
  });

  it("has no phone number in its text", () => {
    expect(file.text).not.toMatch(PHONE);
  });

  it("has no tel: link or phone number anywhere else in the file (link targets are not in the text)", () => {
    expect(file.hidden).toContain("mailto:adrianluk618@gmail.com");
    expect(file.hidden).not.toMatch(/tel:/i);
    expect(file.hidden).not.toMatch(PHONE);
  });

  it("spells BT Cup as the site does, never btcup", () => {
    expect(file.text).not.toMatch(/btcup/i);
  });
});
