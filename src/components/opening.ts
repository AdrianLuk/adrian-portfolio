import type { CameraDirector } from "./camera-director";
import { mark } from "./marks";
import { FLIGHT_START_RIG, type FlightRig } from "./world/rigs";
import type { CreditPlacement } from "./world/scene";

/** The title cards the credits appear on in the scene, as the page marks them. */
export const CREDIT_CARD = mark("data-credit-card");
/** The credit holding the Skip control. */
export const CREDIT_SKIP = mark("data-credit-skip");
/** The hero's action, which Skip hands focus on to. */
export const HERO_ACTION = mark("data-hero-action");

/**
 * Where the Opening is (the hero's data-state):
 * loading: server HTML, before any script, until the fly-in's timeline has
 *   loaded. With motion allowed it already looks like the flight's start (the
 *   `opening` variant), so the settled frame never shows first; without
 *   scripts it is the still hero, headline and captions.
 * flight: the fly-in is playing; the credits appear in the scene in turn.
 * settled: the fly-in finished, or was skipped; or home was reached by client
 *   navigation with the world already live, which never replays the opening.
 * reduced: prefers-reduced-motion. It never flies: the settled frame, with
 *   the credits as static captions.
 */
export type OpeningPhase = "loading" | "flight" | "settled" | "reduced";

/** What a flight timeline animates, and how it reports. */
export type Flight = {
  /** The Opening's values: the camera's way down the canyon, and its lights. */
  rig: FlightRig;
  /** Each title card's opacity. */
  credits: readonly { opacity: number }[];
  /** Called after each step, the values moved on. */
  onUpdate(): void;
  /** Called once, when it runs out or is finished. */
  onComplete(): void;
};

/** A flight timeline, playing. */
export type FlightTimeline = {
  /** Jumps to the end: one last update, then completion. */
  finish(): void;
  /** Stops for good, reporting nothing more. */
  stop(): void;
};

/** Starts a flight timeline playing. */
export type PlayFlight = (flight: Flight) => FlightTimeline;

/** A box laid out on the hero, from its top left, in CSS pixels. */
type Box = { left: number; top: number; width: number; height: number };

/** The hero as it stands, in CSS pixels. */
export type StageLayout = {
  width: number;
  height: number;
  /** Where Skip's top stands, from the hero's top; null while it has no size. */
  skipTop: number | null;
  /** Each title card's laid-out box, untouched by its transform. */
  cards: readonly Box[];
};

/** Where a title card moves to, by transform only, and the side it sets flush to. */
export type CardPlacement = {
  dx: number;
  dy: number;
  scale: number;
  align: "left" | "right" | "center";
};

/** The page the Opening plays on: what it measures, and what it writes. */
export type OpeningStage = {
  /** How many title cards there are. */
  cards: number;
  measure(): StageLayout;
  /**
   * Where the world places card `index`, seen at `spot` (normalised device
   * coordinates); null without a world, or until it can.
   */
  project(
    index: number,
    spot: { x: number; y: number },
  ): CreditPlacement | null;
  /** Writes card `index`'s opacity and, while it shows, where it stands. */
  show(index: number, opacity: number, at?: CardPlacement): void;
  /** Hands every card back to the page's own styles: the static captions. */
  clear(): void;
  /** Focuses the hero's action. */
  focusAction(): void;
};

/** Room kept between a credit card and the hero's edges, in CSS pixels. */
const EDGE = 24;

/**
 * Where title card `index` stands, in normalised device coordinates: round
 * the frame, clear of the plate flying in dead centre (corner to corner on a
 * wide screen, above and below it on a narrow one).
 */
function creditSpot(index: number, aspect: number) {
  if (aspect < 0.9) return { x: 0, y: index % 2 === 0 ? 0.5 : -0.5 };
  const spots = [
    { x: -0.42, y: -0.42 },
    { x: 0.42, y: 0.42 },
    { x: -0.42, y: 0.42 },
    { x: 0.42, y: -0.42 },
  ];
  return spots[index % spots.length];
}

/**
 * Moves a card to a point: never larger than fits across the hero, kept
 * clear of its sides and top, its foot no lower than `floor`.
 */
function placeCard(
  card: Box,
  at: CreditPlacement,
  width: number,
  floor: number,
) {
  const scale = Math.min(at.scale, (width - 2 * EDGE) / card.width);
  const w = card.width * scale;
  const h = card.height * scale;
  const x = Math.min(Math.max(at.x, w / 2 + EDGE), width - w / 2 - EDGE);
  const y = Math.min(Math.max(at.y, h / 2 + EDGE), floor - h / 2);
  return {
    dx: x - (card.left + card.width / 2),
    dy: y - (card.top + card.height / 2),
    scale,
  };
}

export type Opening = ReturnType<typeof createOpening>;

/**
 * The Opening, from start to landing: the flight down the canyon (played by
 * a timeline it loads only when it flies), the credits shown one at a time
 * in the scene, Skip, and every way it can end: run out, skipped, called off
 * by reduced motion, a timeline that fails to load, or no world to fly
 * through. Home joining a live world has already landed: it never replays.
 * It tells the director the camera's way along the flight, and reports its
 * phase; once it has settled, the scroll route takes the camera on.
 */
export function createOpening({
  rejoined,
  reduced,
  director,
  load,
}: {
  /** True when home arrived by client navigation into a live world. */
  rejoined: boolean;
  /** The reduced-motion preference, as the hero first renders. */
  reduced: boolean;
  director: Pick<
    CameraDirector,
    "openingStarts" | "openingAt" | "openingLands"
  >;
  /** Loads the flight's timeline; rejects if it can't. */
  load: () => Promise<PlayFlight>;
}) {
  let motionReduced = reduced;
  /** True once it has landed, for good: the flight never replays. */
  let landed = rejoined;
  /** True once the flight's timeline is playing. */
  let started = false;
  let flying = false;
  let stage: OpeningStage | null = null;
  let timeline: FlightTimeline | null = null;
  let credits: { opacity: number }[] = [];
  /** Each card's opacity as last written. */
  let written: number[] = [];
  /** Counts each flight begun or called off: a timeline loading for one that's over is dropped. */
  let run = 0;
  const listeners = new Set<() => void>();

  const phaseNow = (): OpeningPhase =>
    motionReduced
      ? "reduced"
      : landed
        ? "settled"
        : started
          ? "flight"
          : "loading";
  let phase = phaseNow();

  function changed() {
    const next = phaseNow();
    if (next === phase) return;
    phase = next;
    for (const listener of listeners) listener();
  }

  /** Lands on the settled pose, whether the flight ran out or was called off. */
  function land() {
    landed = true;
    flying = false;
    timeline = null;
    director.openingLands();
    changed();
  }

  /** Writes each card: its opacity, and where it stands while it shows. */
  function place() {
    if (!flying || !stage) return;
    let layout: StageLayout | null = null;
    for (const [i, { opacity }] of credits.entries()) {
      if (!(opacity > 0)) {
        if (written[i] !== 0) stage.show(i, 0);
        written[i] = 0;
        continue;
      }
      layout ??= stage.measure();
      const { width, height } = layout;
      const spot = creditSpot(i, width / Math.max(1, height));
      const at = stage.project(i, spot) ?? {
        x: ((spot.x + 1) / 2) * width,
        y: ((1 - spot.y) / 2) * height,
        scale: 1,
      };
      // Every card stands clear above Skip, at the foot of the screen.
      const floor = (layout.skipTop ?? height) - EDGE;
      stage.show(i, opacity, {
        ...placeCard(layout.cards[i], at, width, floor),
        // Set flush to the side of the frame it stands on.
        align: spot.x < 0 ? "left" : spot.x > 0 ? "right" : "center",
      });
      written[i] = opacity;
    }
  }

  /** Ends the flight now. */
  function end() {
    if (!flying) return;
    if (timeline) timeline.finish();
    else land();
  }

  /** Calls off any flight, leaving it unlanded: it can fly again. */
  function stop() {
    run++;
    flying = false;
    timeline?.stop();
    timeline = null;
  }

  return {
    phase: () => phase,

    /** Calls `listener` whenever the phase changes; returns the unsubscribe. */
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /**
     * Puts the camera where the Opening starts, or, with no flight to play,
     * where it lands: before the world first draws for the hero.
     */
    prepare() {
      if (landed || motionReduced) director.openingLands();
      else director.openingStarts();
    },

    /**
     * Loads the flight's timeline and plays it on `on`. Never once it has
     * landed, or under reduced motion; without a timeline, it lands.
     */
    async fly(on: OpeningStage) {
      if (flying || landed || motionReduced) return;
      flying = true;
      stage = on;
      const flight = ++run;
      let play: PlayFlight;
      try {
        play = await load();
      } catch {
        // A stale chunk after a deploy, say: land without the flight.
        if (flight === run && flying) land();
        return;
      }
      // Called off, or ended, meanwhile.
      if (flight !== run || !flying) return;
      credits = Array.from({ length: on.cards }, () => ({ opacity: 0 }));
      written = [];
      const rig = { ...FLIGHT_START_RIG };
      timeline = play({
        rig,
        credits,
        onUpdate() {
          director.openingAt(rig);
          place();
        },
        onComplete: land,
      });
      // The opening starts with its timeline, not before it has loaded.
      started = true;
      changed();
      place();
    },

    /** Re-places the cards, after the hero has resized. */
    place,

    /** Skip: the control fades with the credits, so focus moves on to the action. */
    skip() {
      if (!flying) return;
      stage?.focusAction();
      end();
    },

    /** Ends the flight: there's no world to fly through. */
    end,

    /**
     * Any change of preference calls the flight off for good: reducing motion
     * mid-flight lands at once, back to static captions, and allowing it
     * again settles rather than replaying the opening.
     */
    reducedMotion(next: boolean) {
      if (next === motionReduced) return;
      motionReduced = next;
      stop();
      stage?.clear();
      land();
    },

    /** The hero is leaving: calls off any flight. */
    stop,
  };
}
