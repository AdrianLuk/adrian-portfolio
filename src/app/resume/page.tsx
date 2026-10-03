import type { Metadata } from "next";
import { resume, roles, sideProjects } from "@/content/site";

export const metadata: Metadata = {
  title: resume.metaTitle,
  description: resume.metaDescription,
};

const sectionHeading =
  "font-display text-sm tracking-[0.3em] text-violet uppercase [font-stretch:75%]";
const itemTitle = "font-display text-2xl font-bold [font-stretch:115%]";
const meta =
  "font-display text-sm tracking-widest text-cyan uppercase [font-stretch:75%]";
const externalLink =
  "font-semibold text-cyan underline decoration-cyan/40 underline-offset-4 hover:decoration-cyan";

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-4 list-disc space-y-3 pl-5 leading-relaxed text-ink/90 marker:text-cyan">
      {items.map((bullet) => (
        <li key={bullet}>{bullet}</li>
      ))}
    </ul>
  );
}

export default function ResumePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <header className="flex max-w-3xl flex-col items-start gap-4">
        <h2 className="font-display text-5xl font-extrabold uppercase [font-stretch:140%]">
          {resume.heading}
        </h2>
        <p className="text-lg text-ink/85">{resume.intro}</p>
        <p>
          <a
            href={resume.pdfHref}
            download
            className="inline-block rounded-full bg-ember px-6 py-3 font-display font-bold tracking-wide text-night uppercase [font-stretch:110%]"
          >
            {resume.download.label}
            <span className="sr-only"> ({resume.download.detail})</span>
          </a>
        </p>
      </header>

      <section
        aria-labelledby="experience-heading"
        className="mt-16 max-w-3xl"
      >
        <h3 id="experience-heading" className={sectionHeading}>
          {resume.rolesHeading}
        </h3>
        <ol className="mt-8 space-y-12 border-l border-fog pl-6 sm:pl-8">
          {roles.map((role) => (
            <li key={role.id} id={role.id} className="relative scroll-mt-24">
              <span
                aria-hidden="true"
                className="absolute top-2 -left-[calc(1.5rem+4.5px)] size-2 rounded-full bg-cyan sm:-left-[calc(2rem+4.5px)]"
              />
              <h4 className={itemTitle}>
                {role.title}, {role.company}
              </h4>
              <p className={`mt-1 ${meta}`}>
                {role.start} to {role.end}
              </p>
              <p className="mt-3 text-ink/80 italic">{role.summary}</p>
              <Bullets items={role.bullets} />
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="side-projects-heading"
        className="mt-20 max-w-3xl"
      >
        <h3 id="side-projects-heading" className={sectionHeading}>
          {resume.sideProjectsHeading}
        </h3>
        <ul className="mt-8 space-y-10">
          {sideProjects.map((project) => (
            <li
              key={project.id}
              id={project.id}
              className="scroll-mt-24 rounded-2xl bg-dusk/70 p-6 sm:p-8"
            >
              <h4 className={itemTitle}>{project.name}</h4>
              <p className={`mt-1 ${meta}`}>{project.year}</p>
              <Bullets items={project.bullets} />
              <p className="mt-6">
                <a href={project.url} className={externalLink}>
                  {project.url.replace(/^https:\/\//, "")}
                </a>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
