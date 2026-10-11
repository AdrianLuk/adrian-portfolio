import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { EarnOnReach } from "@/components/earn-on-reach";
import { HobbyScroll } from "@/components/hobby-scroll";
import {
  accents,
  holoPanel,
  PanelCorners,
  PlayButton,
} from "@/components/highlight-panel";
import { PlaceWorld } from "@/components/place-world";
import { Recording } from "@/components/recording";
import { TicketWall } from "@/components/ticket-wall";
import { StopStill, WorldStill } from "@/components/world-backdrop";
import { about, shareCards, type StillName } from "@/content/site";
import { shareMetadata } from "../share";
import {
  arrivesAtHobby,
  clipsStopAfterGap,
  overPlace,
  textLink,
} from "../styles";
import { torontoWeather } from "../toronto-weather";

// Rebuilt at most hourly, for the weather (WEATHER_REVALIDATE): segment
// config must be a literal.
export const revalidate = 3600;

export const metadata: Metadata = shareMetadata(shareCards.about);

/**
 * One section's panel on the Hobby route, in its stop's light, its lines as
 * bullets; under reduced motion, where the camera holds the route's first
 * stop, `still` (the stop as the camera frames it) stands behind it.
 */
function HobbyPanel({
  section,
  light,
  still,
  children,
  ...rest
}: {
  section: { id: string; heading: string; lines: readonly string[] };
  light: keyof typeof accents;
  still: StillName;
  children?: ReactNode;
  "data-wall"?: true;
}) {
  const { id, heading, lines } = section;
  const { bracket, glow } = accents[light];
  return (
    <div className={clipsStopAfterGap}>
      <StopStill name={still} />
      <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={`${holoPanel} ${glow}`}
      {...rest}
    >
      <PanelCorners className={bracket} />
      <h3
        id={`${id}-heading`}
        className="font-display text-3xl font-bold [font-stretch:120%]"
      >
        {heading}
      </h3>
      <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-ink/90 marker:text-cyan">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {children}
      </section>
    </div>
  );
}

/**
 * The About page: Adrian outside work, along the Hobby route. Roots first,
 * over the court's approach; then, as the page scrolls, the camera moves to
 * the court beside pickleball's panel, the Diamond beside baseball's, and
 * into the Arena beside K-pop's, the gaming line last. The panels are plain
 * server-rendered copy; the world and its scroll route are the client's.
 */
export default async function AboutPage() {
  const { pickleball, baseball, kpop, gaming } = about;
  return (
    <article
      aria-labelledby="about-heading"
      className="relative isolate mx-auto max-w-6xl px-4 py-12 sm:px-6"
    >
      {/* shortcut: the court's still stands in for the route's first stop
        (the court from up the valley); draw an About still of its own with
        scripts/share-stills.mjs if the difference shows. */}
      <PlaceWorld claim={{ kind: "hobby", weather: await torontoWeather() }}>
        <WorldStill name="court" />
      </PlaceWorld>
      <HobbyScroll />
      {/* The gaps are the camera's, to fly between stops: under reduced motion
        it holds still, each panel's stop stands behind it as a still, and
        they close up. */}
      <div
        className={`space-y-[60svh] pb-[40svh] motion-reduce:space-y-16 motion-reduce:pb-0 ${arrivesAtHobby}`}
      >
        <header className={`max-w-3xl ${overPlace.court}`}>
          <PanelCorners className="border-violet" />
          <p className="font-display text-sm tracking-[0.3em] text-cyan uppercase [font-stretch:75%]">
            {about.eyebrow}
          </p>
          <h2
            id="about-heading"
            className="mt-3 font-display text-4xl font-extrabold uppercase [font-stretch:140%] sm:text-5xl"
          >
            {about.heading}
          </h2>
          <p className="mt-4 text-lg text-ink/90">{about.roots}</p>
        </header>

        <HobbyPanel
          section={pickleball}
          light="violet"
          // The Hobby route frames the court and the Diamond as home's does.
          still="route-juice-bros"
        >
          <p className="mt-6">
            <PlayButton link={pickleball.play} light="violet" />
          </p>
          <p className="mt-4">
            <Link href={pickleball.caseStudy.href} className={textLink}>
              {pickleball.caseStudy.label}
            </Link>
          </p>
        </HobbyPanel>

        <HobbyPanel section={baseball} light="cyan" still="route-diamond">
          <div className="mt-6">
            <Recording recording={baseball.clip} />
          </div>
          <p className="mt-4">
            <PlayButton link={baseball.play} light="cyan" />
          </p>
        </HobbyPanel>

        {/* The Arena's inside view, its show on. Reaching it earns Encore!. */}
        <HobbyPanel section={kpop} light="violet" still="arena" data-wall>
          <p className="mt-6 text-ink/90">{kpop.wallLead}</p>
          {/* One column on a phone: the panel's padding leaves two too narrow for the longest names. */}
          <TicketWall className="mt-3 max-sm:grid-cols-1" />
          <EarnOnReach target={kpop.id} achievement="encore" />
        </HobbyPanel>

        <HobbyPanel section={gaming} light="cyan" still="arena" />
      </div>
    </article>
  );
}
