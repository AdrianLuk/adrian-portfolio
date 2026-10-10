/**
 * The Opening's values and timing: plain data with no Three.js in it, so the
 * hero can use it from the first paint while the world and its libraries load
 * after. The Lit sites have their own home, in ../lit-sites.
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
export const FLIGHT_TIMING = { flight: 5.25, turn: 2.5 } as const;

/**
 * The turn-in's ease: a strafe round the 20th Century Fox swing, coming in hot
 * and braking hard to rest, like a fighter jet landing. `opening` is its speed
 * at the start over its average (power2.out's slope at 0), which the flight
 * meets.
 */
export const TURN_EASE = { name: "power2.out", opening: 3 } as const;

/**
 * The longest a transit (the camera flying between home and the Resume page)
 * ever takes, in seconds, however far it flies: well under the opening
 * (FLIGHT_TIMING's flight and turn), so navigation never feels slow. Their
 * copy never waits longer.
 */
export const TRANSIT_MAX_SECONDS = 2.5;

/**
 * The Encore's timing, in seconds (plain data, for the Camera director): the
 * way into the Arena, a slow eased move at a medium-speed pan, and the
 * lightsticks filling its floor once the camera has landed.
 */
export const ENCORE_SECONDS = 4.5;
export const ENCORE_FILL_SECONDS = 3;
