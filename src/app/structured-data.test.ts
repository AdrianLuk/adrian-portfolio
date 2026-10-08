import { describe, expect, it } from "vitest";
import { caseStudies, contact, siteUrl } from "../content/site";
import robots from "./robots";
import sitemap from "./sitemap";
import { homeJsonLd, jsonLdScript } from "./structured-data";

const [website, personJsonLd] = homeJsonLd["@graph"];

describe("sitemap", () => {
  it("lists every public route, absolute", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      `${siteUrl}/`,
      `${siteUrl}/resume`,
      ...caseStudies.map((study) => `${siteUrl}/work/${study.slug}`),
      `${siteUrl}/play`,
    ]);
  });
});

describe("robots", () => {
  it("lets every crawler in and points at the sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: `${siteUrl}/sitemap.xml`,
    });
  });
});

describe("home structured data", () => {
  it("names the site for Adrian and says it is about him", () => {
    expect(website).toMatchObject({
      "@type": "WebSite",
      name: "Adrian Luk",
      url: siteUrl,
      about: { "@id": personJsonLd["@id"] },
    });
  });

  it("names Adrian, the site and his title", () => {
    expect(personJsonLd).toMatchObject({
      "@type": "Person",
      name: "Adrian Luk",
      url: siteUrl,
      jobTitle: "Senior frontend engineer",
    });
  });

  it("places him in Toronto, Ontario", () => {
    expect("address" in personJsonLd && personJsonLd.address).toMatchObject({
      addressLocality: "Toronto",
      addressRegion: "Ontario",
      addressCountry: "CA",
    });
  });

  it("links the same profiles as the contact section, but not the email", () => {
    expect("sameAs" in personJsonLd && personJsonLd.sameAs).toEqual([
      "https://www.linkedin.com/in/adrian-luk",
      "https://github.com/AdrianLuk",
    ]);
    expect(contact.channels.map((channel) => channel.id)).toContain("email");
  });

  it("can't close its script tag", () => {
    const json = jsonLdScript({ text: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({
      text: "</script><script>alert(1)</script>",
    });
  });
});
