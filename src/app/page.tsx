import { HeroWorld } from "@/components/hero-world";
import { HighlightPanel } from "@/components/highlight-panel";
import {
  contact,
  credits,
  hero,
  highlights,
  person,
  work,
} from "@/content/site";
import Link from "next/link";
import { Fragment } from "react";
import { metaLine, primaryAction, sectionLabel, textLink } from "./styles";

export default function Home() {
  return (
    <>
      <HeroWorld
        label={hero.label}
        className="flex min-h-[88svh] flex-col justify-end"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-24 pb-16 sm:px-6">
          {/* The accessible name is the H1 in the nav; this is its display echo.
            The 3D name plate stands exactly over it, word for word, and it
            fades out once the plate has rendered. */}
          <p
            aria-hidden="true"
            data-plate-echo
            className="font-display text-[min(14vw,6rem)] leading-[0.92] font-extrabold uppercase [font-stretch:150%] group-data-[state=reduced]:opacity-0 group-data-[state=settled]:opacity-0 motion-safe:transition-opacity motion-safe:duration-1000 md:text-[min(9vw,7rem)] md:leading-none"
          >
            {person.name.split(" ").map((word, i) => (
              <Fragment key={word}>
                {i > 0 && " "}
                <span data-plate-word className="max-md:block">
                  {word}
                </span>
              </Fragment>
            ))}
          </p>
          <div className="max-w-2xl space-y-2">
            <p className="font-display text-2xl font-semibold text-cyan [font-stretch:110%]">
              {hero.titleLine}
            </p>
            <p className="text-lg text-ink/85">{hero.backendLine}</p>
          </div>
          {/* Static captions until the fly-in lands; the Skip control is the last credit. */}
          <ul aria-label={credits.label} className={`space-y-1 ${metaLine}`}>
            {credits.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>
              {/* Placeholder: it has nothing to skip until the camera lands. */}
              <button
                type="button"
                className="cursor-pointer text-left uppercase underline decoration-cyan/40 underline-offset-4 hover:decoration-cyan"
              >
                {credits.skip}
              </button>
            </li>
          </ul>
          <p>
            <a href={hero.primaryAction.href} className={primaryAction}>
              {hero.primaryAction.label}
            </a>
          </p>
        </div>
      </HeroWorld>

      <section
        id="work"
        aria-labelledby="work-heading"
        className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6"
      >
        <h2 id="work-heading" className={sectionLabel}>
          {work.heading}
        </h2>
        <div className="mt-8 space-y-16">
          {highlights.map((highlight, i) => (
            <HighlightPanel
              key={highlight.id}
              highlight={highlight}
              className={`max-w-3xl ${i % 2 === 1 ? "lg:ml-auto" : ""}`}
            />
          ))}
        </div>
      </section>

      <section
        id="contact"
        aria-labelledby="contact-heading"
        className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6"
      >
        <h2 id="contact-heading" className={sectionLabel}>
          {contact.heading}
        </h2>
        <p className="mt-6 max-w-2xl text-lg text-ink/90">{contact.lead}</p>
        <p className="mt-4 text-lg">
          <Link href={contact.resume.href} className={textLink}>
            {contact.resume.label}
          </Link>
        </p>
        <ul className="mt-6 space-y-3 text-lg">
          {contact.channels.map((channel) => (
            <li key={channel.id}>
              <span className="mr-3 font-display text-sm tracking-widest text-ink/70 uppercase [font-stretch:75%]">
                {channel.label}
              </span>
              <a href={channel.href} className={textLink}>
                {channel.text}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-16 font-display text-2xl font-bold [font-stretch:120%]">
          {contact.bookend}
        </p>
      </section>
    </>
  );
}
