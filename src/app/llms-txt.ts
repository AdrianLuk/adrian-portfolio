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
  profiles,
  resume,
  roles,
  sideProjects,
  siteUrl,
  work,
  type Highlight,
} from "@/content/site";

/**
 * A Markdown link. A same-site path becomes the absolute URL a reader outside
 * the site needs; any other href stays as the site writes it.
 */
const link = (label: string, href: string) =>
  `[${label}](${href.startsWith("/") ? new URL(href, siteUrl).href : href})`;

/**
 * A Highlight as its panel reads: title, byline, paragraph, key numbers, link.
 * The byline gives way to the employer's name where one is set (Control D's).
 */
function highlightBlock(highlight: Highlight): string {
  const paragraphs =
    typeof highlight.paragraph === "string"
      ? [highlight.paragraph]
      : highlight.paragraph;
  return [
    `### ${highlight.title}`,
    `*${highlight.organization ?? highlight.byline}*`,
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
 * /llms.txt. Its facts, headings and most link labels are the site's own
 * copy, so it never says more than the pages do; the rest are plain labels
 * ("Links", "Case study").
 */
export function llmsTxt(): string {
  const sections = [
    [`# ${person.name}`, `> ${hero.titleLine}. ${hero.backendLine}`],
    [
      `## ${resume.rolesHeading}`,
      roles
        .map(
          (role) =>
            `- ${link(`${role.title}, ${role.company}`, hrefFor({ kind: "role", roleId: role.id }))}: ${role.start} to ${role.end}. ${role.summary}.`,
        )
        .join("\n"),
    ],
    [
      `## ${resume.sideProjectsHeading}`,
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
    [`## ${work.heading}`, ...highlights.map(highlightBlock)],
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
        link(resume.download.pdf, resume.pdfHref),
        ...caseStudies.map((study) =>
          link(`${study.title} case study`, hrefFor({ kind: "case-study", slug: study.slug })),
        ),
        ...profiles.map((profile) => link(profile.label, profile.href)),
        link(footer.source.label, footer.source.href),
      ]
        .map((item) => `- ${item}`)
        .join("\n"),
    ],
  ];
  return `${sections.map((lines) => lines.join("\n\n")).join("\n\n")}\n`;
}
