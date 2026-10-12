import {
  contact,
  hero,
  isoMonth,
  person,
  profiles,
  roles,
  siteUrl,
  type Role,
} from "@/content/site";

const [locality, region] = person.location.split(", ");

/** Adrian as a Person, one entity across every page that describes him. */
const personId = `${siteUrl}/#person`;

/**
 * The home page's structured data for search engines: the site, named for
 * Adrian, the home page as his profile page, and Adrian as a Person (who he
 * is, his photo from the contact section, where he works from and the
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
      about: { "@id": personId },
    },
    {
      "@type": "ProfilePage",
      "@id": `${siteUrl}/#profile`,
      url: siteUrl,
      isPartOf: { "@id": `${siteUrl}/#website` },
      mainEntity: { "@id": personId },
    },
    {
      "@type": "Person",
      "@id": personId,
      name: person.name,
      url: siteUrl,
      image: `${siteUrl}${contact.portrait.stills.at(-1)!.src}`,
      jobTitle: hero.titleLine,
      description: hero.backendLine,
      address: {
        "@type": "PostalAddress",
        addressLocality: locality,
        addressRegion: region,
        addressCountry: "CA",
      },
      sameAs: profiles.map((profile) => profile.href),
    },
  ],
};

/**
 * The Resume page's structured data: the same Person as home's (one `@id`),
 * with every Role as an `OrganizationRole` under `alumniOf`. Every Role has
 * ended, so there is no `worksFor`. Titles, employers and dates only: the
 * bullets stay on the page.
 */
export const resumeJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": personId,
  name: person.name,
  url: siteUrl,
  alumniOf: roles.map((role: Role) => ({
    "@type": "OrganizationRole",
    roleName: role.title,
    startDate: isoMonth(role.start),
    endDate: isoMonth(role.end),
    alumniOf: {
      "@type": "Organization",
      name: role.organization ?? role.company,
    },
  })),
};

/** JSON for a `<script type="application/ld+json">`, with `<` escaped so no
 * string in it can close the script tag. */
export function jsonLdScript(data: object) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
