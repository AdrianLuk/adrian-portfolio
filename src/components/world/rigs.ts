import type { HighlightId } from "@/content/site";

/**
 * The world's state the page drives, and the plan of its lit sites: plain
 * data with no Three.js in it, so the hero can hold it from the first paint
 * while the world and its libraries load after.
 */

/**
 * What the timeline animates. flight runs 0 to 1 through the flight's time
 * (the path sets its pace: steady through the pan, gathering through the
 * swoop), turn 0 to 1 round the turn-in arc (easing out to rest), settle 0 to
 * 1 from the plate-centred view to the settled framing. beams, sweep and
 * beacon light the arrival: the beams' brightness (1 at rest), the angle their
 * sweep is offset by, and the first lit site's glow at the horizon.
 */
export type FlightRig = {
  flight: number;
  turn: number;
  settle: number;
  beams: number;
  sweep: number;
  beacon: number;
};

/** Where the flight starts: far down the canyon, beams low, the site dark. */
export const FLIGHT_START_RIG: Readonly<FlightRig> = {
  flight: 0,
  turn: 0,
  settle: 0,
  beams: 0.45,
  sweep: 1,
  beacon: 0,
};

export const SETTLED_RIG: Readonly<FlightRig> = {
  flight: 1,
  turn: 1,
  settle: 1,
  beams: 1,
  sweep: 0,
  beacon: 1,
};

/** Seconds; the timeline's flight runs linearly, its turn eases (TURN_EASE). */
export const FLIGHT_TIMING = { flight: 6.5, turn: 4 } as const;

/**
 * The turn-in's ease: a long, gentle glide round to rest, like the camera
 * swinging round to the 20th Century Fox logo. `opening` is its speed at the
 * start over its average (sine.out's slope at 0), which the flight meets.
 */
export const TURN_EASE = { name: "sine.out", opening: Math.PI / 2 } as const;

/**
 * A lit site's plan: the Highlight it stands for, its depth down the valley,
 * which side it stands (+1 = right, +x), and the light it burns (its panel's
 * accent).
 */
export type SitePlan = {
  highlight: HighlightId;
  z: number;
  side: 1 | -1;
  light: "cyan" | "violet";
};

/**
 * The four lit sites, in the Highlights' order, alternating sides of the
 * valley: on a wide screen the panels alternate left and right, so each site
 * stands on the side its panel leaves clear. The first is the light on the
 * horizon once the camera settles.
 */
export const SITE_PLAN: readonly SitePlan[] = [
  { highlight: "control-d", z: -420, side: 1, light: "cyan" },
  { highlight: "life-house", z: -600, side: -1, light: "cyan" },
  { highlight: "juice-bros", z: -780, side: 1, light: "violet" },
  { highlight: "bt-cup", z: -960, side: -1, light: "cyan" },
];

/**
 * What the scroll drives. at: the stop the camera is at (0, the settled view,
 * until the visitor scrolls); lit: how lit each site is, 0 to 1.
 */
export type RouteRig = { at: number; lit: number[] };

export const routeRig = (): RouteRig => ({
  at: 0,
  lit: SITE_PLAN.map(() => 0),
});

/**
 * The longest a camera flight between home and the Resume page (a transit)
 * ever takes, in seconds, however far it flies: well under the opening's
 * 10.5s, so navigation never feels slow.
 */
export const TRANSIT_MAX_SECONDS = 2.5;
