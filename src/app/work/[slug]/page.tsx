import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PINNED_MEDIA } from "@/components/active-tool";
import { PlayerToolsScene } from "@/components/player-tools-scene";
import { Recording } from "@/components/recording";
import { WorldBackdrop } from "@/components/world-backdrop";
import {
  caseStudies,
  shareCards,
  type CaseStudy,
  type Image as ImageContent,
  type PlayerTool,
  type Showcase,
} from "@/content/site";
import { shareMetadata } from "../../share";

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

const eyebrowClass =
  "font-display text-sm tracking-[0.3em] text-violet uppercase [font-stretch:75%]";

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
      <Image
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        unoptimized
        className="h-auto w-full rounded-xl border border-fog"
      />
      <figcaption className="mt-2 text-sm text-ink/70">{caption}</figcaption>
    </figure>
  );
}

function Screenshots({ showcase }: { showcase: Showcase }) {
  const { desktop, phone } = showcase.screenshots;
  // A phone held sideways (Pickle Point Pal) is wider than a portrait one.
  const phoneWidth = phone.width > phone.height ? "w-96" : "w-56";
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
        className={`${phoneWidth} max-w-full`}
      />
    </div>
  );
}

/**
 * One Player tool's copy block. Its screenshots and recording stay with it for
 * assistive technology and the stacked list; with the scene pinned they are
 * out of sight, and the stage shows them instead.
 */
function Tool({ tool, label }: { tool: PlayerTool; label: string }) {
  const id = tool.name.toLowerCase().replaceAll(" ", "-");
  return (
    <li data-tool-copy className="pinned:min-h-[70vh]">
      <section aria-labelledby={`tool-${id}`} className="space-y-4">
        <h5
          id={`tool-${id}`}
          className="font-display text-2xl font-bold [font-stretch:115%]"
        >
          {tool.name}
        </h5>
        <p className="max-w-2xl text-ink/90">
          {tool.summary} <span className="text-ink/70">{tool.accessNote}</span>
        </p>
        <div className="space-y-4 pinned:sr-only">
          <Screenshots showcase={tool} />
          {tool.recording && (
            <div className="max-w-2xl">
              <Recording recording={tool.recording} hiddenWhen={PINNED_MEDIA} />
            </div>
          )}
        </div>
        <p>
          <a href={tool.url} className={linkClass}>
            {label}
          </a>
        </p>
      </section>
    </li>
  );
}

/**
 * The Player tools' device stage: each tool's desktop shot (or its recording,
 * where it has one) with its phone shot overlapping it, one tool at a time,
 * and a progress mark through the set. A visual layer only, so it is hidden
 * from assistive technology (each tool's copy block carries its own images)
 * and holds nothing focusable. Shown only where the scene pins.
 */
function Stage({ tools }: { tools: readonly PlayerTool[] }) {
  return (
    <div
      data-tool-stage
      aria-hidden="true"
      className="sticky top-24 hidden h-[calc(100vh-6rem)] items-center self-start pinned:flex"
    >
      <div className="relative aspect-[4/3] w-full max-w-[calc((100vh-8rem)*4/3)]">
        {tools.map((tool, i) => {
          const { desktop, phone } = tool.screenshots;
          const sideways = phone.width > phone.height;
          return (
            <div
              key={tool.name}
              data-stage-tool={tool.name}
              className={`absolute inset-0 ${i === 0 ? "" : "invisible opacity-0"}`}
            >
              <div className="absolute top-0 left-0 aspect-[16/10] w-[88%] overflow-hidden rounded-xl border border-fog bg-dusk">
                {tool.recording ? (
                  <video
                    muted
                    loop
                    playsInline
                    preload="none"
                    poster={tool.recording.poster}
                    aria-label={tool.recording.label}
                    width={tool.recording.width}
                    height={tool.recording.height}
                    className="h-full w-full object-contain"
                  >
                    {tool.recording.sources.map((source) => (
                      <source key={source.src} src={source.src} type={source.type} />
                    ))}
                  </video>
                ) : (
                  <Image
                    src={desktop.src}
                    alt=""
                    width={desktop.width}
                    height={desktop.height}
                    unoptimized
                    className="h-full w-full object-cover object-top"
                  />
                )}
              </div>
              <div
                className={`absolute right-0 bottom-0 overflow-hidden rounded-xl border border-fog bg-dusk shadow-[0_0_2rem_var(--color-night)] ${sideways ? "w-[55%]" : "h-[70%]"}`}
                style={{ aspectRatio: `${phone.width} / ${phone.height}` }}
              >
                <Image
                  src={phone.src}
                  alt=""
                  width={phone.width}
                  height={phone.height}
                  unoptimized
                  className="h-full w-full object-cover object-top"
                />
              </div>
            </div>
          );
        })}
        <div className="absolute bottom-1 left-0 h-1 w-1/3 overflow-hidden rounded-full bg-fog">
          <div
            data-stage-progress
            className="h-full w-full origin-left scale-x-0 bg-cyan"
          />
        </div>
      </div>
    </div>
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

  return (
    <article
      aria-labelledby="case-study-heading"
      className="relative isolate mx-auto max-w-4xl px-4 py-16 sm:px-6"
    >
      <WorldBackdrop />
      <header>
        <p className={eyebrowClass}>Case study · {study.byline}</p>
        <h2
          id="case-study-heading"
          className="mt-3 font-display text-5xl font-extrabold uppercase [font-stretch:140%]"
        >
          {study.title}
        </h2>
        <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-lg">
          {siteLinks.map((link) => (
            <li key={link.href}>
              {/* Not prefetched: the only internal one is the Rally game, whose code loads only on /play. */}
              {link.href.startsWith("/") ? (
                <Link href={link.href} prefetch={false} className={linkClass}>
                  {link.label}
                </Link>
              ) : (
                <a href={link.href} className={linkClass}>
                  {link.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </header>

      <div className="mt-12 space-y-16">
        {study.sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="space-y-4"
          >
            <h3
              id={`${section.id}-heading`}
              className="font-display text-3xl font-bold [font-stretch:120%]"
            >
              {section.heading}
            </h3>
            {section.paragraphs.map((p) => (
              <p key={p} className="max-w-2xl text-lg leading-relaxed text-ink/90">
                {p}
              </p>
            ))}
            {section.id === "what-i-did" && (
              <div className="pt-4">
                <Screenshots showcase={study.home} />
              </div>
            )}
            {section.id === "approach" && (
              // Where it pins, the scene widens past the column (to the
              // header's width at most) so the stage sits beside a readable
              // column of copy.
              <div className="space-y-4 pt-6 pinned:mx-[calc(50%-min(36rem,50vw-1.5rem))]">
                <h4 className={eyebrowClass}>Player tools</h4>
                <PlayerToolsScene className="pinned:grid pinned:grid-cols-[5fr_7fr] pinned:gap-12">
                  <ul className="space-y-14">
                    {study.tools.map((tool) => (
                      <Tool
                        key={tool.name}
                        tool={tool}
                        label={labelFor(tool.url)}
                      />
                    ))}
                  </ul>
                  <Stage tools={study.tools} />
                </PlayerToolsScene>
              </div>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}
