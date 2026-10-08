import { contact, hero, person, roles, siteUrl } from "@/content/site";

const [locality, region] = person.location.split(", ");

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * A Resume date ("Mar 2024") as an ISO year and month ("2024-03"). Throws on
 * anything else, so a date that changes shape fails the build instead of
 * reaching search engines as a guess.
 */
export function isoMonth(date: string) {
  const match = /^([A-Z][a-z]{2}) (\d{4})$/.exec(date);
  const month = match ? months.indexOf(match[1]) + 1 : 0;
  if (!match || month === 0) {
    throw new Error(`Can't read "${date}" as a month and year like "Mar 2024"`);
  }
  return `${match[2]}-${String(month).padStart(2, "0")}`;
}

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

/**
 * The Resume page's structured data: the same Person as home's (one `@id`),
 * with every Role as an `OrganizationRole` under `alumniOf`. Every Role has
 * ended, so there is no `worksFor`. Titles, employers and dates only: the
 * bullets stay on the page.
 */
export const resumeJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": `${siteUrl}/#person`,
  name: person.name,
  url: siteUrl,
  alumniOf: roles.map((role) => ({
    "@type": "OrganizationRole",
    roleName: role.title,
    startDate: isoMonth(role.start),
    endDate: isoMonth(role.end),
    alumniOf: { "@type": "Organization", name: role.organization },
  })),
};

/** JSON for a `<script type="application/ld+json">`, with `<` escaped so no
 * string in it can close the script tag. */
export function jsonLdScript(data: object) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
