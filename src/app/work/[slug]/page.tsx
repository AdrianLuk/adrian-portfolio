import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Recording } from "@/components/recording";
import {
  caseStudies,
  type CaseStudy,
  type Image as ImageContent,
  type PlayerTool,
  type Showcase,
} from "@/content/site";

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
  return { title: study.metaTitle, description: study.metaDescription };
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

function Tool({ tool, label }: { tool: PlayerTool; label: string }) {
  const id = tool.name.toLowerCase().replaceAll(" ", "-");
  return (
    <li>
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
        <Screenshots showcase={tool} />
        {tool.recording && (
          <div className="max-w-2xl">
            <Recording recording={tool.recording} />
          </div>
        )}
        <p>
          <a href={tool.url} className={linkClass}>
            {label}
          </a>
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

  return (
    <article
      aria-labelledby="case-study-heading"
      className="mx-auto max-w-4xl px-4 py-16 sm:px-6"
    >
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
              <a href={link.href} className={linkClass}>
                {link.label}
              </a>
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
              <div className="space-y-4 pt-6">
                <h4 className={eyebrowClass}>Player tools</h4>
                <ul className="space-y-14">
                  {study.tools.map((tool) => (
                    <Tool
                      key={tool.name}
                      tool={tool}
                      label={labelFor(tool.url)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}
