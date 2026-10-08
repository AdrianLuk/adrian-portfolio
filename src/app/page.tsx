import { HeroWorld } from "@/components/hero-world";
import { HighlightPanel, PanelCorners } from "@/components/highlight-panel";
import { CREDIT_CARD, CREDIT_SKIP, HERO_ACTION } from "@/components/opening";
import { PLATE_ECHO, PLATE_WORD } from "@/components/plate-measure";
import {
  contact,
  credits,
  hero,
  highlights,
  person,
  shareCards,
  work,
} from "@/content/site";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { shareMetadata } from "./share";
import { homeJsonLd, jsonLdScript } from "./structured-data";
import { metaLine, primaryAction, sectionLabel, textLink } from "./styles";
import { torontoWeather } from "./toronto-weather";

// Rebuilt at most hourly, for the weather (WEATHER_REVALIDATE): segment
// config must be a literal.
export const revalidate = 3600;

export const metadata: Metadata = shareMetadata(shareCards.home);

/** Skip, set on a card at the foot of the hero while the fly-in plays. */
const skipCard =
  "relative w-fit max-w-full mx-auto opening:before:absolute opening:before:-inset-x-3 opening:before:-inset-y-1.5 opening:before:-z-10 opening:before:rounded-lg opening:before:bg-night/70 opening:before:backdrop-blur-sm";

/** "A portfolio by: Adrian Luk" as its role and its name, for a title card. */
function creditParts(line: string) {
  const at = line.indexOf(": ");
  return { role: line.slice(0, at), name: line.slice(at + 2) };
}

/**
 * Hero copy held back during the fly-in, landing once it settles; and held
 * likewise, unseen and out of reach of focus, while a transit brings the
 * visitor home (the world's root carries data-arriving="hero", never longer
 * than TRANSIT_MAX_SECONDS), landing with it. It hides at once (a half-faded
 * button fails contrast) and eases in only as it lands.
 */
const landsAfterFlight =
  "opening:translate-y-3 opening:opacity-0 in-data-[arriving=hero]:invisible in-data-[arriving=hero]:opacity-0 motion-safe:group-data-[state=settled]:transition-[opacity,translate] motion-safe:group-data-[state=settled]:duration-700";

export default async function Home() {
  const weather = await torontoWeather();
  return (
    // Its own stacking context: once the camera flies, the world's canvas is
    // held at the back of it, behind the whole page and over the body's sky.
    <div className="relative isolate">
      <HeroWorld label={hero.label} weather={weather} className="min-h-[88svh]">
        {/* Out of the flow at the hero's foot, so hiding the credits never
          moves anything, but first in it: Skip is the hero's first stop. On
          a phone the hero grows past the screen to fit the stacked name, so
          while the opening plays (and as it fades) the credits stand at the
          foot of the screen instead, letting taps through once hidden. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 max-md:opening:fixed max-md:group-data-[state=settled]:fixed">
          <div className="mx-auto max-w-6xl px-4 pb-6 sm:px-6">
            {/* The opening credits: static captions (the accessible list, and
              the reduced-motion version). During the fly-in they give way to
              the title cards below, and they fade once it settles. The Skip
              control is the last credit and the hero's first stop. */}
            <ul
              aria-label={credits.label}
              className={`pointer-events-auto space-y-1 ${metaLine} text-center group-data-[state=settled]:invisible group-data-[state=settled]:opacity-0 motion-safe:transition-[opacity,visibility] motion-safe:duration-700`}
            >
              {credits.lines.map((line) => (
                // Hidden through the opening and after it: only Skip, the
                // one credit shown while it plays, fades as it settles.
                <li
                  key={line}
                  className="opening:opacity-0 group-data-[state=settled]:opacity-0"
                >
                  {line}
                </li>
              ))}
              <li {...CREDIT_SKIP.props} className={skipCard}>
                {/* Under reduced motion there is no flight to skip: it stays as
                  the last caption, the joke intact. */}
                <button
                  type="button"
                  className="cursor-pointer text-center uppercase underline decoration-cyan/40 underline-offset-4 hover:decoration-cyan"
                >
                  {credits.skip}
                </button>
              </li>
            </ul>
          </div>
        </div>
        {/* The headline (and the plate standing on it) about 40% of the
          way down the screen, centred; the foot is kept clear for
          the credits. */}
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 text-center pt-[max(4rem,calc(40svh-3.25rem))] pb-44 sm:px-6">
          {/* The accessible name is the H1 in the nav; this is its display echo.
            The 3D name plate stands exactly over it, word for word, and it
            fades out once the plate has rendered (or while it flies in). */}
          <p
            aria-hidden="true"
            {...PLATE_ECHO.props}
            className="font-display text-[min(14vw,6rem)] leading-[0.92] font-extrabold uppercase [font-stretch:150%] opening:opacity-0 group-data-[world=drawn]:opacity-0 motion-safe:transition-opacity motion-safe:duration-1000 md:text-[min(9vw,7rem)] md:leading-none"
          >
            {person.name.split(" ").map((word, i) => (
              <Fragment key={word}>
                {i > 0 && " "}
                <span {...PLATE_WORD.props} className="max-md:block">
                  {word}
                </span>
              </Fragment>
            ))}
          </p>
          <div className={`mx-auto max-w-2xl space-y-2 ${landsAfterFlight}`}>
            <p className="font-display text-2xl font-semibold text-cyan [font-stretch:110%]">
              {hero.titleLine}
            </p>
            <p className="text-lg text-ink/85">{hero.backendLine}</p>
          </div>
          {/* Lands last; shown at once if it takes focus mid-flight. */}
          <p
            className={`${landsAfterFlight} group-data-[state=settled]:delay-200 has-focus-visible:translate-y-0! has-focus-visible:opacity-100!`}
          >
            <a
              href={hero.primaryAction.href}
              {...HERO_ACTION.props}
              className={primaryAction}
            >
              {hero.primaryAction.label}
            </a>
          </p>
        </div>
        {/* The credits as opening titles, big in the scene: the hero anchors
          each in the world, dissolves it in and out in turn, and lets it drift
          as the camera flies on. A visual echo of the list above, which is
          what assistive tech reads. Each card is at least as wide as its
          longest word, so the hero keeps the whole card on screen. */}
        <div
          aria-hidden="true"
          className="pointer-events-none invisible absolute inset-0 overflow-hidden opening:visible"
        >
          {credits.lines.map((line) => {
            const { role, name } = creditParts(line);
            return (
              <p
                key={line}
                {...CREDIT_CARD.props}
                className="absolute top-0 left-0 w-max max-w-[min(40rem,calc(100vw-2rem))] min-w-min opacity-0 [text-shadow:0_0_28px_var(--color-night),0_2px_8px_var(--color-night)]"
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
        {/* On a phone the district stands behind the copy, so it sits on a
          panel there, as the Highlights do; wider, it has the left clear. */}
        <div className="relative mt-6 max-md:rounded-sm max-md:bg-dusk/80 max-md:p-6 max-md:shadow-2xl max-md:shadow-cyan/10">
          <PanelCorners className="border-cyan md:hidden" />
          <p className="max-w-2xl text-lg text-ink/90">{contact.lead}</p>
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
        </div>
        <p className="mt-16 font-display text-2xl font-bold [font-stretch:120%]">
          {contact.bookend}
        </p>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(homeJsonLd) }}
      />
    </div>
  );
}
