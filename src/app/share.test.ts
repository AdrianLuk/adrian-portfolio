import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  backdrop,
  caseStudies,
  meta,
  rally,
  resume,
  shareCards,
  siteUrl,
} from "../content/site";
import { shareMetadata } from "./share";

const publicFile = (src: string) => path.join(process.cwd(), "public", src);

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(file: string) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** A WebP's width and height, from its VP8 / VP8L / VP8X header. */
function webpSize(file: string) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1,
    };
  }
  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return {
    width: bytes.readUInt16LE(26) & 0x3fff,
    height: bytes.readUInt16LE(28) & 0x3fff,
  };
}

const routes = [
  { path: "/", card: shareCards.home, title: meta.title },
  { path: "/resume", card: shareCards.resume, title: resume.metaTitle },
  { path: "/play", card: shareCards.play, title: rally.metaTitle },
  ...caseStudies.map((study) => ({
    path: `/work/${study.slug}`,
    card: shareCards[study.slug],
    title: study.metaTitle,
  })),
];

describe("link previews", () => {
  for (const { path: route, card, title } of routes) {
    describe(route, () => {
      it("carries the route's title and description to Open Graph and Twitter", () => {
        const data = shareMetadata(card);
        expect(data.title).toBe(title);
        expect(data.openGraph).toMatchObject({
          title,
          description: card.description,
          url: route,
          siteName: "Adrian Luk",
          type: "website",
        });
        expect(data.twitter).toMatchObject({
          card: "summary_large_image",
          title,
          description: card.description,
        });
      });

      it("shows a 1200 by 630 still from public/, with alt text", () => {
        const data = shareMetadata(card);
        const image = {
          url: card.image,
          width: 1200,
          height: 630,
          alt: card.imageAlt,
        };
        expect(data.openGraph?.images).toEqual([image]);
        expect(data.twitter?.images).toEqual([image]);
        expect(card.imageAlt.length).toBeGreaterThan(20);
        expect(pngSize(publicFile(card.image))).toEqual({
          width: 1200,
          height: 630,
        });
      });
    });
  }

  it("resolve against the live domain", () => {
    expect(shareMetadata(shareCards.home).metadataBase).toEqual(new URL(siteUrl));
    expect(siteUrl).toBe("https://adrianluk.com");
  });

  it("other routes caption the frame with their own title", () => {
    expect("caption" in shareCards.home).toBe(false);
    expect(shareCards.resume.caption?.title).toBe(resume.heading);
    for (const study of caseStudies) {
      expect(shareCards[study.slug].caption?.title).toBe(study.title);
    }
  });
});

describe("the night backdrop", () => {
  it("has landscape stills up to 3840 wide (2560 at 1.5x, a 4K TV at 1x) and portrait ones for phones and tablets", () => {
    for (const still of [...backdrop.landscape, ...backdrop.portrait]) {
      expect(webpSize(publicFile(still.src)).width, still.src).toBe(still.width);
    }
    const landscape = backdrop.landscape.map((s) => webpSize(publicFile(s.src)));
    expect(Math.max(...landscape.map((s) => s.width))).toBeGreaterThanOrEqual(3840);
    for (const size of landscape) {
      expect(size.width / size.height).toBeCloseTo(16 / 9, 1);
    }
    const portrait = backdrop.portrait.map((s) => webpSize(publicFile(s.src)));
    expect(Math.max(...portrait.map((s) => s.width))).toBeGreaterThanOrEqual(2048);
    for (const size of portrait) expect(size.height).toBeGreaterThan(size.width);
  });
});
