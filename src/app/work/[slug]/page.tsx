import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { stageToggle, toolCopy } from "@/components/player-tools-markup";
import { EARLY_PIN_SCRIPT } from "@/components/player-tools-pinning";
import { PlayerToolsScene } from "@/components/player-tools-scene";
import { Recording } from "@/components/recording";
import { isSideways, Screenshot } from "@/components/screenshot";
import { ToolStage } from "@/components/tool-stage";
import { CourtStill } from "@/components/court-still";
import { PanelCorners, PlayButton } from "@/components/highlight-panel";
import { PlaceWorld } from "@/components/place-world";
import { WorldBackdrop } from "@/components/world-backdrop";
import { placeOf } from "@/components/world-places";
import {
  caseStudies,
  hrefFor,
  shareCards,
  type CaseStudy,
  type Image as ImageContent,
  type PlayerTool,
  type Showcase,
} from "@/content/site";
import { shareMetadata } from "../../share";
import { arrivesAtCourt, overPlace, pillButton } from "../../styles";
import { torontoWeather } from "../../toronto-weather";

// Rebuilt at most hourly, for the court's weather (WEATHER_REVALIDATE):
// segment config must be a literal.
export const revalidate = 3600;

export function generateStaticParams() {
  return caseStudies.map((c) => ({ slug: c.slug }));
}

function find(slug: string): CaseStudy | undefined {
  return caseStudies.find((c) => c.slug === slug);
}

export async function generateMetadata({
  params,
}: PageProps<"/work/[slug]">): Promise<Metadata> {
  const study = find((await params).slug);
  if (!study) return {};
  return shareMetadata(shareCards[study.slug]);
}

const linkClass =
  "font-semibold text-cyan underline decoration-cyan/40 underline-offset-4 hover:decoration-cyan";

/**
 * Violet lifted toward ink and shadowed in the night, as the section labels
 * are: plain violet fell under 4.5:1 over the court's lit ridges and fog.
 */
const eyebrowClass =
  "font-display text-sm tracking-[0.3em] text-[color-mix(in_srgb,var(--color-violet)_60%,var(--color-ink))] uppercase [font-stretch:75%] [text-shadow:0_0_12px_var(--color-night),0_1px_3px_var(--color-night)]";

function Shot({
  image,
  caption,
  className,
}: {
  image: ImageContent;
  caption: string;
  className: string;
}) {
  return (
    <figure className={className}>
      <Screenshot
        image={image}
        className="h-auto w-full rounded-xl border border-fog"
      />
      <figcaption className="mt-2 text-sm text-ink/70">{caption}</figcaption>
    </figure>
  );
}

function Screenshots({ showcase }: { showcase: Showcase }) {
  const { desktop, phone } = showcase.screenshots;
  return (
    <div className="flex flex-wrap items-end gap-6">
      <Shot
        image={desktop}
        caption="Desktop width"
        className="max-w-2xl min-w-0 flex-[3_1_20rem]"
      />
      <Shot
        image={phone}
        caption="Phone width"
        className={`${isSideways(phone) ? "w-96" : "w-56"} max-w-full`}
      />
    </div>
  );
}

/**
 * One Player tool's copy block. Its screenshots and recording stay with it for
 * assistive technology and the stacked list; with the scene pinned they are
 * out of sight, and the stage shows them instead, its recording paused and
 * played by the button beside the link.
 */
function Tool({ tool, label }: { tool: PlayerTool; label: string }) {
  const id = tool.name.toLowerCase().replaceAll(" ", "-");
  return (
    <li {...toolCopy} className="pinned:min-h-[70vh]">
      <section
        aria-labelledby={`tool-${id}`}
        className={`flex flex-col gap-4 ${overPlace.court}`}
      >
        <PanelCorners className="border-violet" />
        <h4
          id={`tool-${id}`}
          className="font-display text-2xl font-bold [font-stretch:115%]"
        >
          {tool.name}
        </h4>
        <p className="max-w-2xl text-ink/90">
          {tool.summary} <span className="text-ink/70">{tool.accessNote}</span>
        </p>
        <div className="space-y-4 pinned:sr-only">
          <Screenshots showcase={tool} />
          {tool.recording && (
            <div className="max-w-2xl">
              <Recording recording={tool.recording} />
            </div>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <a href={tool.url} className={linkClass}>
            {label}
          </a>
          {tool.recording && (
            <button
              type="button"
              {...stageToggle}
              className="group hidden rounded-full border border-fog px-3 py-1 font-display text-sm tracking-widest text-ink/85 uppercase transition-colors [font-stretch:75%] hover:border-cyan hover:text-cyan pinned:inline-block"
            >
              <span className="group-data-paused:hidden">Pause</span>
              <span className="hidden group-data-paused:inline">Play</span>{" "}
              recording<span className="sr-only"> of {tool.name}</span>
            </button>
          )}
        </p>
      </section>
    </li>
  );
}

export default async function CaseStudyPage({
  params,
}: PageProps<"/work/[slug]">) {
  const study = find((await params).slug);
  if (!study) notFound();

  const labelFor = (href: string) =>
    study.links.find((l) => l.href === href)!.label;
  const toolUrls = new Set(study.tools.map((t) => t.url));
  const siteLinks = study.links.filter((l) => !toolUrls.has(l.href));
  // Juice Bros' Place in the world is its court, held behind the copy (in
  // Toronto's weather); a Case study without a Place stands on the still of
  // the valley.
  const atCourt =
    placeOf(hrefFor({ kind: "case-study", slug: study.slug })) === "court";
  const world = atCourt ? (
    <PlaceWorld claim={{ kind: "court", weather: await torontoWeather() }}>
      <CourtStill />
    </PlaceWorld>
  ) : (
    <WorldBackdrop />
  );

  return (
    <article
      aria-labelledby="case-study-heading"
      className="relative isolate mx-auto max-w-4xl px-4 py-16 sm:px-6"
    >
      {world}
      <header className={`${overPlace.court} ${arrivesAtCourt}`}>
        <PanelCorners className="border-violet" />
        <p className={eyebrowClass}>Case study · {study.byline}</p>
        <h1
          id="case-study-heading"
          className="mt-3 font-display text-5xl font-extrabold uppercase [font-stretch:140%]"
        >
          {study.title}
        </h1>
        <ul className="mt-6 flex flex-wrap gap-3">
          {siteLinks.map((link) => (
            <li key={link.href}>
              {/* The only internal one is the Rally game. */}
              {link.href.startsWith("/") ? (
                <PlayButton link={link} light="violet" />
              ) : (
                <a href={link.href} className={pillButton.violet}>
                  {link.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </header>

      <div className={`mt-12 space-y-16 ${arrivesAtCourt}`}>
        {study.sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="space-y-4"
          >
            <div className={`flex flex-col gap-4 ${overPlace.court}`}>
              <PanelCorners className="border-violet" />
              <h2
                id={`${section.id}-heading`}
                className="font-display text-3xl font-bold [font-stretch:120%]"
              >
                {section.heading}
              </h2>
              {section.paragraphs.map((p) => (
                <p key={p} className="max-w-2xl text-lg leading-relaxed text-ink/90">
                  {p}
                </p>
              ))}
            </div>
            {section.id === "what-i-did" && (
              <div className="pt-4">
                <Screenshots showcase={study.home} />
              </div>
            )}
            {section.id === "approach" && (
              // Where it pins, the scene widens past the column (to the
              // header's width at most) so the stage sits beside a readable
              // column of copy.
              <PlayerToolsScene className="space-y-4 pt-6 pinned:mx-[calc(50%-min(36rem,50vw-1.5rem))]">
                <h3 className={eyebrowClass}>Player tools</h3>
                <div className="pinned:grid pinned:grid-cols-[5fr_7fr] pinned:gap-12">
                  <ul className="space-y-14">
                    {study.tools.map((tool) => (
                      <Tool
                        key={tool.name}
                        tool={tool}
                        label={labelFor(tool.url)}
                      />
                    ))}
                  </ul>
                  <ToolStage tools={study.tools} />
                </div>
                {/* Last, once the copy above is parsed: pins the layout before the first paint. */}
                <script dangerouslySetInnerHTML={{ __html: EARLY_PIN_SCRIPT }} />
              </PlayerToolsScene>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}
