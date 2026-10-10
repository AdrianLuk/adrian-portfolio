import { describe, expect, it } from "vitest";
import { caseStudies, contact, roles, siteUrl } from "../content/site";
import robots from "./robots";
import sitemap from "./sitemap";
import { homeJsonLd, jsonLdScript, resumeJsonLd } from "./structured-data";

const [website, personJsonLd] = homeJsonLd["@graph"];

describe("sitemap", () => {
  it("lists every public route, absolute", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      `${siteUrl}/`,
      `${siteUrl}/resume`,
      ...caseStudies.map((study) => `${siteUrl}/work/${study.slug}`),
      `${siteUrl}/play`,
      `${siteUrl}/play/derby`,
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

describe("Resume page structured data", () => {
  it("is the same Person as home's", () => {
    expect(resumeJsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Person",
      "@id": `${siteUrl}/#person`,
      name: "Adrian Luk",
    });
    expect(resumeJsonLd["@id"]).toBe(personJsonLd["@id"]);
  });

  it("lists every Role under alumniOf, with ISO dates and its employer", () => {
    const role = (
      roleName: string,
      startDate: string,
      endDate: string,
      organization: string,
    ) => ({
      "@type": "OrganizationRole",
      roleName,
      startDate,
      endDate,
      alumniOf: { "@type": "Organization", name: organization },
    });
    expect(resumeJsonLd.alumniOf).toEqual([
      role("Senior Software Engineer", "2024-03", "2026-04", "Control D"),
      role("Full Stack Developer", "2022-10", "2024-02", "Life House"),
      role("Frontend Engineer", "2022-03", "2022-08", "Studio"),
      role("Full Stack Web Developer", "2020-03", "2022-03", "Brandish Agency"),
      role("Full Stack Developer", "2018-05", "2020-03", "Elite Digital Agency"),
    ]);
  });

  it("says he works nowhere now, since every Role has ended", () => {
    expect(resumeJsonLd).not.toHaveProperty("worksFor");
  });

  it("names Control D, not Windscribe, and leaves the bullets out", () => {
    const json = jsonLdScript(resumeJsonLd);
    expect(json).not.toContain("Windscribe");
    for (const bullet of roles.flatMap((r) => r.bullets)) {
      expect(json).not.toContain(JSON.stringify(bullet).slice(1, -1));
    }
  });
});
