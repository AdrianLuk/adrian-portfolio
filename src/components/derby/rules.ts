/**
 * The Home Run Derby's rules, as pure data and functions (no Three.js, no
 * DOM), so they're unit tested without WebGL, as the Rally game's are. The
 * visitor bats against Curvebot: ten pitches, one swing each at most, and
 * the swing's timing against the pitch's arrival at the plate decides the
 * outcome.
 *
 * `step` advances a game by a span of real time and returns a new one; what
 * happened during it (a pitch, a swing, an outcome, three home runs in a
 * row, the game's end) is in its `events`, for the scene and the page's
 * announcements.
 */

/**
 * ready: nothing moves until the visitor starts. windup: Curvebot winds up.
 * pitch: the ball is on its way to the plate. result: a beat to watch where
 * it went, before the next windup. over: ten pitches are done.
 */
export type Phase = "ready" | "windup" | "pitch" | "result" | "over";

export type Outcome = "home-run" | "fly-out" | "foul" | "strike";

/** Curvebot's pitches, each its own speed. */
export type PitchKind = "fastball" | "curveball" | "changeup";

export type Input = {
  /** The one input: Space, or a tap on the field. */
  swing?: boolean;
};

/** Where a pitch went: how its swing was timed, and how far and which way it was hit. */
export type Hit = {
  outcome: Outcome;
  /**
   * The swing's timing against the pitch's arrival, in seconds of game time:
   * negative early, positive late. Null when the visitor never swung.
   */
  error: number | null;
  /** How far the ball carried, in feet (0 for a strike). */
  distance: number;
  /** Which way it went, in radians off the line to centre field: negative to left field. */
  angle: number;
  /** When it was decided, in seconds of game time since the pitch left Curvebot's hand. */
  at: number;
};

/** A home run, as the Play of the Game shows it again: the pitch Curvebot threw, and where it went. */
export type Play = { pitch: PitchKind; hit: Hit };

export type GameEvent =
  | { type: "pitch"; kind: PitchKind; number: number }
  | { type: "swing" }
  | { type: "outcome"; outcome: Outcome; distance: number }
  | { type: "three-in-a-row" }
  | { type: "over"; homeRuns: number };

export type Game = {
  phase: Phase;
  paused: boolean;
  /** Everything runs at half speed: the windup, the pitches, the beats between. */
  slow: boolean;
  /** Pitches thrown so far, the one in flight included. */
  pitches: number;
  homeRuns: number;
  /** Every home run so far, in order. */
  plays: Play[];
  /** Home runs in a row, up to the last pitch. */
  streak: number;
  /** The pitch thrown now, or last. */
  pitch: PitchKind;
  /** The last pitch's outcome, once decided. */
  hit: Hit | null;
  /** Game time in the current phase, in seconds. */
  clock: number;
  /** The seeded generator's state, so a game replays the same. */
  seed: number;
  events: GameEvent[];
};

export const PITCHES = 10;

/**
 * How long each pitch takes from Curvebot's hand to the plate, in seconds:
 * slower than life, so the timing is a game, not a reflex test.
 */
export const PITCH_TIME: Record<PitchKind, number> = {
  fastball: 0.75,
  curveball: 0.95,
  changeup: 1.15,
};
const KINDS = Object.keys(PITCH_TIME) as PitchKind[];

/**
 * How far off the pitch's arrival a swing may be, either way, in seconds,
 * for each outcome: inside `homeRun` it's gone, inside `flyOut` it's caught
 * at the warning track, inside `foul` it's foul; any further, or no swing,
 * and it's a strike.
 */
export const WINDOW = { homeRun: 0.05, flyOut: 0.1, foul: 0.16 } as const;

/** Slow mode's speed, as a share of full speed. */
export const SLOW_SPEED = 0.5;

/** The windup before each pitch, and the beat after it. */
export const WINDUP = 1.1;
const RESULT = 2.2;

/** A small seeded generator (mulberry32): returns the next value and seed. */
function random(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export function createGame({
  seed = 1,
  slow = false,
}: { seed?: number; slow?: boolean } = {}): Game {
  return {
    phase: "ready",
    paused: false,
    slow,
    pitches: 0,
    homeRuns: 0,
    plays: [],
    streak: 0,
    pitch: "fastball",
    hit: null,
    clock: 0,
    seed,
    events: [],
  };
}

/** The visitor presses Start: Curvebot winds up. */
export function startGame(game: Game): Game {
  return game.phase === "ready" ? { ...game, phase: "windup", clock: 0 } : game;
}

/** Pause or resume: while paused, nothing moves and the clock stands still. */
export function setPaused(game: Game, paused: boolean): Game {
  return { ...game, paused };
}

/** Slow mode: the whole game runs at half speed. */
export function setSlow(game: Game, slow: boolean): Game {
  return { ...game, slow };
}

/** Whether the game is under way: started, and not yet over. */
export const isLive = (phase: Phase) => phase !== "ready" && phase !== "over";

/**
 * Curvebot's line at the game's end, by the home-run count: the count, in
 * the words `copy.count` gives it, then the line of the first band (in
 * order) whose `upTo` reaches it, e.g. "1 home run. Solid."
 */
export function overLine(
  homeRuns: number,
  copy: {
    count: { one: string; other: string };
    bands: readonly { upTo: number; line: string }[];
  },
): string {
  const band = copy.bands.find((b) => homeRuns <= b.upTo) ?? copy.bands.at(-1);
  const count = homeRuns === 1 ? copy.count.one : copy.count.other;
  return `${homeRuns} ${count}. ${band?.line ?? ""}`.trim();
}

/** Curvebot throws: never the same pitch twice running, so the speeds mix. */
function throwPitch(game: Game): Game {
  const [r, seed] = random(game.seed);
  const choices =
    game.pitches === 0 ? KINDS : KINDS.filter((k) => k !== game.pitch);
  const pitch = choices[Math.floor(r * choices.length)];
  const number = game.pitches + 1;
  return {
    ...game,
    phase: "pitch",
    clock: 0,
    seed,
    pitch,
    pitches: number,
    hit: null,
    events: [...game.events, { type: "pitch", kind: pitch, number }],
  };
}

/**
 * How far a ball carries, in feet: a home run from `homeRun.far` on the
 * sweet spot down to `homeRun.near` at the window's edge; a fly-out to the
 * warning track; a foul into the seats down the line.
 */
export const CARRY = {
  homeRun: { far: 460, near: 360 },
  flyOut: { far: 320, near: 280 },
  foul: 200,
} as const;

/** How far off centre field a fair ball goes at most, and a foul at least and most, in radians. */
const FAIR_ANGLE = (40 * Math.PI) / 180;
const FOUL_ANGLE = [(50 * Math.PI) / 180, (70 * Math.PI) / 180] as const;

/** Where a swing `error` seconds off the pitch's arrival sends the ball, decided `at`. */
function hitFor(error: number, at: number): Hit {
  const off = Math.abs(error);
  const way = Math.sign(error);
  /** How far through the band from `a` to `b` the swing's error is, 0 to 1. */
  const through = (a: number, b: number) => (off - a) / (b - a);
  if (off <= WINDOW.homeRun) {
    const { far, near } = CARRY.homeRun;
    return {
      outcome: "home-run",
      error,
      distance: Math.round(far - (far - near) * through(0, WINDOW.homeRun)),
      angle: way * FAIR_ANGLE * through(0, WINDOW.flyOut),
      at,
    };
  }
  if (off <= WINDOW.flyOut) {
    const { far, near } = CARRY.flyOut;
    return {
      outcome: "fly-out",
      error,
      distance: Math.round(
        far - (far - near) * through(WINDOW.homeRun, WINDOW.flyOut),
      ),
      angle: way * FAIR_ANGLE * through(0, WINDOW.flyOut),
      at,
    };
  }
  if (off <= WINDOW.foul) {
    const [a, b] = FOUL_ANGLE;
    return {
      outcome: "foul",
      error,
      distance: CARRY.foul,
      angle: way * (a + (b - a) * through(WINDOW.flyOut, WINDOW.foul)),
      at,
    };
  }
  return { outcome: "strike", error, distance: 0, angle: 0, at };
}

/** The pitch's outcome is decided: counted, and the beat to watch it begins. */
function decide(game: Game, hit: Hit): Game {
  const homeRun = hit.outcome === "home-run";
  const streak = homeRun ? game.streak + 1 : 0;
  const events: GameEvent[] = [
    ...game.events,
    { type: "outcome", outcome: hit.outcome, distance: hit.distance },
  ];
  if (streak === 3) events.push({ type: "three-in-a-row" });
  return {
    ...game,
    phase: "result",
    clock: 0,
    hit,
    homeRuns: game.homeRuns + (homeRun ? 1 : 0),
    plays: homeRun ? [...game.plays, { pitch: game.pitch, hit }] : game.plays,
    streak,
    events,
  };
}

export function step(game: Game, dt: number, input: Input = {}): Game {
  game = { ...game, events: [] };
  if (game.paused || !isLive(game.phase)) return game;
  const time = dt * (game.slow ? SLOW_SPEED : 1);
  game = { ...game, clock: game.clock + time };

  if (game.phase === "windup" && game.clock >= WINDUP) {
    game = throwPitch(game);
  } else if (game.phase === "pitch") {
    const arrives = PITCH_TIME[game.pitch];
    if (input.swing) {
      game = { ...game, events: [...game.events, { type: "swing" }] };
      game = decide(game, hitFor(game.clock - arrives, game.clock));
    } else if (game.clock >= arrives + WINDOW.foul) {
      game = decide(game, {
        outcome: "strike",
        error: null,
        distance: 0,
        angle: 0,
        at: game.clock,
      });
    }
  } else if (game.phase === "result" && game.clock >= RESULT) {
    if (game.pitches >= PITCHES) {
      game = {
        ...game,
        phase: "over",
        events: [...game.events, { type: "over", homeRuns: game.homeRuns }],
      };
    } else {
      game = { ...game, phase: "windup", clock: 0 };
    }
  }
  return game;
}

/** The longest home run (the first, of two as long), or null after a game with none. */
export function playOfTheGame(game: Game): Play | null {
  return game.plays.reduce<Play | null>(
    (best, play) => (!best || play.hit.distance > best.hit.distance ? play : best),
    null,
  );
}

/** How much of the windup the Play of the Game shows before the pitch, in seconds of game time. */
export const REPLAY_WINDUP = 0.6;

/**
 * How long the Play of the Game runs, in seconds of game time: the windup's
 * end, the pitch, and the beat to watch it go.
 */
export const replayLength = (play: Play) => REPLAY_WINDUP + play.hit.at + RESULT;

/**
 * The Play of the Game `t` seconds of game time in, as the game stood then
 * (in slow mode, so the figures move as slowly as it's played); its events
 * are what happened since `from` seconds in.
 */
export function replayAt(play: Play, t: number, from = t): Game {
  const swing = REPLAY_WINDUP + play.hit.at;
  const events: GameEvent[] =
    from < swing && t >= swing
      ? [
          { type: "swing" },
          { type: "outcome", outcome: "home-run", distance: play.hit.distance },
        ]
      : [];
  const game = { ...createGame({ slow: true }), pitch: play.pitch, events };
  if (t < REPLAY_WINDUP) {
    return { ...game, phase: "windup", clock: WINDUP - REPLAY_WINDUP + t };
  }
  if (t < swing) return { ...game, phase: "pitch", pitches: 1, clock: t - REPLAY_WINDUP };
  return {
    ...game,
    phase: "result",
    pitches: 1,
    homeRuns: 1,
    hit: play.hit,
    clock: t - swing,
  };
}
