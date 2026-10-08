import {
  caseStudies,
  contact,
  displayUrl,
  footer,
  hero,
  highlights,
  hrefFor,
  linkLabelFor,
  person,
  resume,
  roles,
  sideProjects,
  siteUrl,
  type Highlight,
} from "@/content/site";

/** A same-site path as the absolute URL a reader outside the site needs. */
const absolute = (path: string) => `${siteUrl}${path}`;

const link = (label: string, href: string) =>
  `[${label}](${href.startsWith("/") ? absolute(href) : href})`;

/** A Highlight as its panel reads: title, byline, paragraph, key numbers, link. */
function highlightBlock(highlight: Highlight): string {
  const paragraphs =
    typeof highlight.paragraph === "string"
      ? [highlight.paragraph]
      : highlight.paragraph;
  return [
    `### ${highlight.title}`,
    `*${highlight.byline}*`,
    ...paragraphs,
    highlight.keyNumbers
      .map(({ value, label }) => `- ${value} ${label}`)
      .join("\n"),
    link(linkLabelFor(highlight), hrefFor(highlight.link)),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The site as Markdown for language models (llmstxt.org), served at
 * /llms.txt. Every line is the site's own copy, so it never says more than
 * the pages do.
 */
export function llmsTxt(): string {
  const sections = [
    [`# ${person.name}`, `> ${hero.titleLine}. ${hero.backendLine}`],
    [
      "## Roles",
      roles
        .map(
          (role) =>
            `- ${link(`${role.title}, ${role.company}`, hrefFor({ kind: "role", roleId: role.id }))}: ${role.start} to ${role.end}. ${role.summary}.`,
        )
        .join("\n"),
    ],
    [
      "## Side projects",
      sideProjects
        .map((project) => {
          const study = caseStudies.find((s) => s.slug === project.id);
          const links = [
            study && link("Case study", hrefFor({ kind: "case-study", slug: study.slug })),
            link(displayUrl(project.url), project.url),
          ].filter(Boolean);
          return `- ${project.name}, ${project.year}: ${links.join(", ")}`;
        })
        .join("\n"),
    ],
    ["## Selected work", ...highlights.map(highlightBlock)],
    [
      `## ${contact.built.heading}`,
      contact.built.lead,
      contact.built.facts.map((fact) => `- ${fact}`).join("\n"),
      link(contact.built.source.label, contact.built.source.href),
    ],
    [
      "## Links",
      [
        link(contact.resume.label, contact.resume.href),
        link("Resume (PDF)", resume.pdfHref),
        ...caseStudies.map((study) =>
          link(`${study.title} case study`, hrefFor({ kind: "case-study", slug: study.slug })),
        ),
        ...contact.channels
          .filter((channel) => channel.id !== "email")
          .map((channel) => link(channel.label, channel.href)),
        link(footer.source.label, footer.source.href),
      ]
        .map((item) => `- ${item}`)
        .join("\n"),
    ],
  ];
  return `${sections.map((lines) => lines.join("\n\n")).join("\n\n")}\n`;
}
