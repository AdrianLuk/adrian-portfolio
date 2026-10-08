import type { Metadata } from "next";
import { PanelCorners } from "@/components/highlight-panel";
import { PlaceWorld } from "@/components/place-world";
import { WorldBackdrop } from "@/components/world-backdrop";
import {
  displayUrl,
  resume,
  roles,
  shareCards,
  sideProjects,
} from "@/content/site";
import { shareMetadata } from "../share";
import { jsonLdScript, resumeJsonLd } from "../structured-data";
import {
  arrivesAtOutpost,
  entryTitle,
  metaLine,
  panel,
  primaryAction,
  sectionLabel,
  textLink,
} from "../styles";

export const metadata: Metadata = shareMetadata(shareCards.resume);

/**
 * The panel the copy stands on over the Outpost: its lit towers stand behind
 * the copy column at every width.
 */
const overOutpost =
  "relative rounded-sm bg-dusk/80 p-6 shadow-2xl shadow-cyan/10 sm:p-8";

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
    // Its own stacking context, for the world and its backdrop at the back of
    // it: the Outpost, live, over the still that paints first.
    <div className="relative isolate mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <PlaceWorld claim={{ kind: "outpost" }}>
        <WorldBackdrop />
      </PlaceWorld>
      <header
        className={`flex max-w-3xl flex-col items-start gap-4 ${overOutpost} ${arrivesAtOutpost}`}
      >
        <PanelCorners className="border-cyan" />
        <h2 className="font-display text-5xl font-extrabold uppercase [font-stretch:140%]">
          {resume.heading}
        </h2>
        <p className="text-lg text-ink/85">{resume.intro}</p>
        <p className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <a href={resume.pdfHref} download className={primaryAction}>
            {resume.download.pdf}
          </a>
          <a href={resume.docxHref} download className={textLink}>
            {resume.download.docx}
          </a>
        </p>
      </header>

      <section
        aria-labelledby="experience-heading"
        className={`mt-16 max-w-3xl ${arrivesAtOutpost}`}
      >
        <h3 id="experience-heading" className={sectionLabel}>
          {resume.rolesHeading}
        </h3>
        <ol className="mt-8 space-y-12 border-l border-fog pl-6 sm:pl-8">
          {roles.map((role) => (
            <li
              key={role.id}
              id={role.id}
              className={`scroll-mt-24 ${overOutpost}`}
            >
              <PanelCorners className="border-cyan" />
              {/* On the timeline, level with the title. */}
              <span
                aria-hidden="true"
                className="absolute top-8 -left-[calc(1.5rem+4.5px)] size-2 rounded-full bg-cyan sm:top-10 sm:-left-[calc(2rem+4.5px)]"
              />
              <h4 className={entryTitle}>
                {role.title}, {role.company}
              </h4>
              <p className={`mt-1 ${metaLine}`}>
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
        className={`mt-20 max-w-3xl ${arrivesAtOutpost}`}
      >
        <h3 id="side-projects-heading" className={sectionLabel}>
          {resume.sideProjectsHeading}
        </h3>
        <ul className="mt-8 space-y-10">
          {sideProjects.map((project) => (
            <li key={project.id} id={project.id} className={`scroll-mt-24 ${panel}`}>
              <h4 className={entryTitle}>{project.name}</h4>
              <p className={`mt-1 ${metaLine}`}>{project.year}</p>
              <Bullets items={project.bullets} />
              <p className="mt-6">
                <a href={project.url} className={textLink}>
                  {displayUrl(project.url)}
                </a>
              </p>
            </li>
          ))}
        </ul>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(resumeJsonLd) }}
      />
    </div>
  );
}
