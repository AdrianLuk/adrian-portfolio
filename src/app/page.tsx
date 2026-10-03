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

/** Skip, set on a card at the foot of the hero while the fly-in plays. */
const skipCard =
  "relative w-fit max-w-full group-data-[state=flight]:before:absolute group-data-[state=flight]:before:-inset-x-3 group-data-[state=flight]:before:-inset-y-1.5 group-data-[state=flight]:before:-z-10 group-data-[state=flight]:before:rounded-lg group-data-[state=flight]:before:bg-night/70 group-data-[state=flight]:before:backdrop-blur-sm";

/** "A portfolio by: Adrian Luk" as its role and its name, for a title card. */
function creditParts(line: string) {
  const at = line.indexOf(": ");
  return { role: line.slice(0, at), name: line.slice(at + 2) };
}

/**
 * Hero copy held back during the fly-in, landing once it settles. It hides at
 * once (a half-faded button fails contrast) and eases in only as it lands.
 */
const landsAfterFlight =
  "group-data-[state=flight]:translate-y-3 group-data-[state=flight]:opacity-0 motion-safe:group-data-[state=settled]:transition-[opacity,translate] motion-safe:group-data-[state=settled]:duration-700";

export default function Home() {
  return (
    <>
      <HeroWorld label={hero.label} className="min-h-[88svh]">
        {/* Out of the flow at the hero's foot, so hiding the credits never
          moves anything, but first in it: Skip is the hero's first stop. */}
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl px-4 pb-6 sm:px-6">
            {/* The opening credits: static captions (the accessible list, and
              the reduced-motion version). During the fly-in they give way to
              the title cards below, and they fade once it settles. The Skip
              control is the last credit and the hero's first stop. */}
            <ul
              aria-label={credits.label}
              className={`space-y-1 ${metaLine} group-data-[state=settled]:invisible group-data-[state=settled]:opacity-0 motion-safe:transition-[opacity,visibility] motion-safe:duration-700`}
            >
              {credits.lines.map((line) => (
                <li key={line} className="group-data-[state=flight]:opacity-0">
                  {line}
                </li>
              ))}
              <li data-credit-skip className={skipCard}>
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
          </div>
        </div>
        {/* The headline (and the plate standing on it) about 40% of the
          way down the screen; the foot is kept clear for the credits. */}
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-[max(4rem,calc(40svh-3.25rem))] pb-44 sm:px-6">
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
        {/* The credits as opening titles, big in the scene: the hero anchors
          each in the world, dissolves it in and out in turn, and lets it drift
          as the camera flies on. A visual echo of the list above, which is
          what assistive tech reads. */}
        <div
          aria-hidden="true"
          className="pointer-events-none invisible absolute inset-0 overflow-hidden group-data-[state=flight]:visible"
        >
          {credits.lines.map((line) => {
            const { role, name } = creditParts(line);
            return (
              <p
                key={line}
                data-credit-card
                className="absolute top-0 left-0 w-max max-w-[min(40rem,calc(100vw-2rem))] opacity-0 [text-shadow:0_0_28px_var(--color-night),0_2px_8px_var(--color-night)]"
              >
                <span className="block font-display text-sm tracking-[0.35em] text-cyan uppercase [font-stretch:75%] sm:text-base">
                  {role}
                </span>
                <span className="mt-1 block font-display text-[clamp(2rem,5vw,4.5rem)] leading-[0.95] font-extrabold text-ink uppercase [font-stretch:125%]">
                  {/* A block of its own per word: the browser times the
                    largest paint per text block, and a whole name, painted
                    seconds in, would outsize the headline and take over the
                    page's LCP. */}
                  {name.split(" ").map((word, i) => (
                    <Fragment key={word}>
                      {i > 0 && " "}
                      <span className="inline-block">{word}</span>
                    </Fragment>
                  ))}
                </span>
              </p>
            );
          })}
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
