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

/** A credit set as a card in the world while the fly-in plays. */
const creditCard =
  "relative w-fit max-w-full group-data-[state=flight]:before:absolute group-data-[state=flight]:before:-inset-x-3 group-data-[state=flight]:before:-inset-y-1.5 group-data-[state=flight]:before:-z-10 group-data-[state=flight]:before:rounded-lg group-data-[state=flight]:before:bg-night/70 group-data-[state=flight]:before:backdrop-blur-sm";

/**
 * Hero copy held back during the fly-in, landing once it settles. It hides at
 * once (a half-faded button fails contrast) and eases in only as it lands.
 */
const landsAfterFlight =
  "group-data-[state=flight]:translate-y-3 group-data-[state=flight]:opacity-0 motion-safe:group-data-[state=settled]:transition-[opacity,translate] motion-safe:group-data-[state=settled]:duration-700";

export default function Home() {
  return (
    <>
      <HeroWorld
        label={hero.label}
        className="flex min-h-[88svh] flex-col justify-end"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-24 pb-16 sm:px-6">
          {/* The opening credits: static captions until the fly-in plays,
            then cards the hero places in the scene one at a time, fading once
            it settles. The Skip control is the last credit and the hero's
            first stop. */}
          <ul
            aria-label={credits.label}
            className={`space-y-1 ${metaLine} group-data-[state=settled]:invisible group-data-[state=settled]:opacity-0 motion-safe:transition-[opacity,visibility] motion-safe:duration-700`}
          >
            {credits.lines.map((line) => (
              <li
                key={line}
                data-credit
                className={`${creditCard} group-data-[state=flight]:opacity-0`}
              >
                {line}
              </li>
            ))}
            <li data-credit-skip className={creditCard}>
              {/* Under reduced motion there is no flight to skip: it stays as
                the last caption, the joke intact. */}
              <button
                type="button"
                className="cursor-pointer text-left uppercase underline decoration-cyan/40 underline-offset-4 hover:decoration-cyan"
              >
                {credits.skip}
              </button>
            </li>
          </ul>
          {/* The accessible name is the H1 in the nav; this is its display echo.
            The 3D name plate stands exactly over it, word for word, and it
            fades out once the plate has rendered (or while it flies in). */}
          <p
            aria-hidden="true"
            data-plate-echo
            className="font-display text-[min(14vw,6rem)] leading-[0.92] font-extrabold uppercase [font-stretch:150%] group-data-[state=flight]:opacity-0 group-data-[world=drawn]:opacity-0 motion-safe:transition-opacity motion-safe:duration-1000 md:text-[min(9vw,7rem)] md:leading-none"
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
          <div className={`max-w-2xl space-y-2 ${landsAfterFlight}`}>
            <p className="font-display text-2xl font-semibold text-cyan [font-stretch:110%]">
              {hero.titleLine}
            </p>
            <p className="text-lg text-ink/85">{hero.backendLine}</p>
          </div>
          {/* Lands last; shown at once if it takes focus mid-flight. */}
          <p
            className={`${landsAfterFlight} group-data-[state=settled]:delay-200 has-focus-visible:translate-y-0 has-focus-visible:opacity-100`}
          >
            <a
              href={hero.primaryAction.href}
              data-hero-action
              className={primaryAction}
            >
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
