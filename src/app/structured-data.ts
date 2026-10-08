import { contact, hero, person, siteUrl } from "@/content/site";

const [locality, region] = person.location.split(", ");

/**
 * The home page's structured data for search engines: the site, named for
 * Adrian, and Adrian as a Person (who he is, where he works from and the
 * profiles that are also him). Taken from the site's own copy, so it never
 * says more than the page does.
 */
export const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: person.name,
      url: siteUrl,
      inLanguage: "en",
      about: { "@id": `${siteUrl}/#person` },
    },
    {
      "@type": "Person",
      "@id": `${siteUrl}/#person`,
      name: person.name,
      url: siteUrl,
      jobTitle: hero.titleLine,
      description: hero.backendLine,
      address: {
        "@type": "PostalAddress",
        addressLocality: locality,
        addressRegion: region,
        addressCountry: "CA",
      },
      sameAs: contact.channels
        .filter((channel) => channel.id !== "email")
        .map((channel) => channel.href),
    },
  ],
};

/** JSON for a `<script type="application/ld+json">`, with `<` escaped so no
 * string in it can close the script tag. */
export function jsonLdScript(data: object) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
