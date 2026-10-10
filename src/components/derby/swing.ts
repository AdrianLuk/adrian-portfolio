import { DIAMOND } from "../world/diamond";
import { PITCH_TIME, WINDOW, type Game, type Hit } from "./rules";

/**
 * Where the Home Run Derby's ball and bat are, frame by frame, worked out
 * from the rules' game (pure, so the bat meeting the ball is unit tested
 * without WebGL). In feet from home plate's point, as the Diamond's field
 * is laid out (see `fieldPoint`): -z out to centre field, x across it, y up.
 *
 * The rules decide a pitch's outcome the moment the visitor swings; this
 * plays that swing out. The bat comes round from over the batter's
 * shoulder, and where it meets the ball follows from the outcome: square
 * over the plate on time, out in front early (pulled), deep late (pushed).
 * The ball carries on along its pitch until the bat's sweet spot gets
 * there, then leaves from that very spot.
 */

export type Point = { x: number; y: number; z: number };

/** A bat's angle: its turn round the batter (0 square across the plate, positive on toward the mound) and its lift (radians up from level). */
export type Bat = { turn: number; lift: number };

/** The middle of home plate, at a pitch's height as it crosses (knees to chest). */
export const PLATE: Point = { x: 0, y: 2.5, z: -0.71 };
/** Where a pitch nobody hit ends up: in the catcher's mitt, behind the plate. */
const MITT: Point = { x: 0, y: 2.2, z: 3 };
/** How far a curveball breaks, across the plate, at its widest. */
const BREAK = 1.5;

/**
 * How long after its arrival (by the rules' clock) the drawn pitch crosses
 * the plate: a swing takes time to come round, so a swing on time starts as
 * the pitch nears the plate. The foul window's width, so every swing that
 * connects is started before the ball is by.
 */
const LEAD = WINDOW.foul;

/** The bat: 34 inches, its sweet spot 27 from the hands (7 from the end), where a home run meets it. */
export const BAT_LENGTH = 34 / 12;
const SWEET = 27 / 12;
/** Where each hit meets the bat, from the hands: a fly-out toward the end, a foul down by the handle, so a mis-hit looks it. */
const MEETS = { "home-run": SWEET, "fly-out": 30.5 / 12, foul: 22 / 12 } as const;

/** The ball, a little bigger than life (a real one is under 3 inches across), to read from behind the plate. */
export const BALL_RADIUS = 0.4;

/** The bat's lift through the zone: level, its barrel a touch below the hands. */
const LEVEL = (-5 * Math.PI) / 180;
/** Loaded: laid back over the shoulder, pointing up and back toward the catcher. */
const LOADED: Bat = { turn: -2, lift: (50 * Math.PI) / 180 };
/** Followed through: round past the mound's side and up over the other shoulder. */
const FOLLOWED: Bat = { turn: 2.4, lift: (55 * Math.PI) / 180 };
/** How far round the bat is lifted from level, either side of the zone. */
const ZONE = 0.8;
/** How fast a swing that misses comes round, radians a second. */
const WHIFF = 14;
/** The quickest a swing reaches the ball, from the press, in seconds. */
const QUICKEST = 0.04;
/** How far the bat's turn at contact follows the ball's angle off centre field (less than square to it, to stay over the plate). */
const TURN_PER_ANGLE = 0.6;

/** The way the bat points at `bat`, a unit vector from the hands. */
function along({ turn, lift }: Bat): Point {
  return {
    x: Math.cos(lift) * Math.cos(turn),
    y: Math.sin(lift),
    z: -Math.cos(lift) * Math.sin(turn),
  };
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const between = (a: Point, b: Point, f: number): Point => ({
  x: lerp(a.x, b.x, f),
  y: lerp(a.y, b.y, f),
  z: lerp(a.z, b.z, f),
});

/**
 * The bat's outline down its length, from the knob, as [inches from the
 * knob, radius in inches]: a knob, a thin handle tapering into a long
 * barrel, a rounded end. Oversized as the ball is, to read from behind the
 * plate.
 */
const OUTLINE: [number, number][] = [
  [0, 0], [0, 1.5], [0.45, 1.5], [1.2, 0.96], [11, 0.96],
  ...Array.from({ length: 7 }, (_, i): [number, number] => {
    const f = (i + 1) / 8;
    return [11 + 9.5 * f, lerp(0.96, 2.4, f * f * (3 - 2 * f))];
  }),
  [20.5, 2.4], [32, 2.4],
  ...Array.from({ length: 8 }, (_, i): [number, number] => {
    const a = ((i + 1) / 8) * (Math.PI / 2);
    return [32 + 2 * Math.sin(a), 2.4 * Math.cos(a)];
  }),
];

/** The bat's outline in feet, from the hands to the end: what the scene turns into the drawn bat. */
export const BAT_PROFILE = OUTLINE.map(([along, radius]) => ({
  along: along / 12,
  radius: radius / 12,
}));

/** The drawn bat's radius `along` feet from the hands (0 off either end). */
export function batRadius(along: number) {
  for (let i = 1; i < BAT_PROFILE.length; i++) {
    const a = BAT_PROFILE[i - 1];
    const b = BAT_PROFILE[i];
    if (b.along > a.along && along >= a.along && along <= b.along) {
      return lerp(a.radius, b.radius, (along - a.along) / (b.along - a.along));
    }
  }
  return 0;
}

/**
 * Where the ball's centre is, from the hands, as it meets `bat` at `distance`
 * feet along it: touching the bat there, on the pitcher's side (level, square
 * to the bat).
 */
function touching(bat: Bat, distance: number): Point {
  const d = along(bat);
  const side = Math.hypot(d.x, d.z);
  const off = batRadius(distance) + BALL_RADIUS;
  return {
    x: distance * d.x + (off * d.z) / side,
    y: distance * d.y,
    z: distance * d.z - (off * d.x) / side,
  };
}

/**
 * The batter's hands, a right-handed batter's on the plate's third-base
 * side: placed so a square, level swing's sweet spot meets a pitch over the
 * middle of the plate.
 */
export const HANDS: Point = (() => {
  const square = touching({ turn: 0, lift: LEVEL }, SWEET);
  return {
    x: PLATE.x - square.x,
    y: PLATE.y - square.y,
    z: PLATE.z - square.z,
  };
})();

/** The point `distance` feet along the bat from the hands (its sweet spot by default). */
export function barrel(bat: Bat, distance = SWEET): Point {
  const d = along(bat);
  return {
    x: HANDS.x + distance * d.x,
    y: HANDS.y + distance * d.y,
    z: HANDS.z + distance * d.z,
  };
}

/** The bat's lift as it comes round: up over the shoulder, level through the zone, up again in the follow-through. */
function liftAt(turn: number) {
  if (turn <= -ZONE) {
    return lerp(LOADED.lift, LEVEL, (turn - LOADED.turn) / (-ZONE - LOADED.turn));
  }
  if (turn <= ZONE) return LEVEL;
  return lerp(LEVEL, FOLLOWED.lift, Math.min(1, (turn - ZONE) / (FOLLOWED.turn - ZONE)));
}

/** When the drawn pitch crosses the plate, in seconds after it left Curvebot's hand. */
const crossing = (game: Game) => PITCH_TIME[game.pitch] + LEAD;

const span = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

/** How long a pitch takes on from the plate into the mitt, at the speed it came in. */
const intoMitt = (game: Game, release: Point) =>
  (span(PLATE, MITT) / span(release, PLATE)) * crossing(game);

/** How long a pitch nobody hit stays in the mitt before it's out of sight. */
const HELD = 0.15;

/** Where a pitch released at `release` is `t` seconds after it left Curvebot's hand, on into the mitt once past the plate. */
function pitchAt(game: Game, release: Point, t: number): Point {
  const cross = crossing(game);
  if (t >= cross) {
    return between(PLATE, MITT, Math.min(1, (t - cross) / intoMitt(game, release)));
  }
  const f = t / cross;
  const at = between(release, PLATE, f);
  if (game.pitch === "curveball") at.x += BREAK * Math.sin(Math.PI * f) * f;
  return at;
}

/** When the drawn pitch reaches `z` along the plate's line, in seconds after it left Curvebot's hand. */
function pitchReaches(game: Game, release: Point, z: number) {
  const cross = crossing(game);
  return z <= PLATE.z
    ? (cross * (z - release.z)) / (PLATE.z - release.z)
    : cross + (intoMitt(game, release) * (z - PLATE.z)) / (MITT.z - PLATE.z);
}

/**
 * Where, and when (seconds after the pitch left Curvebot's hand), the bat
 * meets the ball: null unless the last pitch was swung at and hit. The
 * bat's turn there follows the hit's angle, and the moment is the ball's own
 * on its pitch, never before the swing can get round.
 */
export function contactOf(
  game: Game,
  release: Point,
): { at: number; point: Point; turn: number; along: number } | null {
  const { hit } = game;
  if (game.phase !== "result" || !hit || hit.error === null) return null;
  if (hit.outcome === "strike") return null;
  const turn = -TURN_PER_ANGLE * hit.angle;
  const along = MEETS[hit.outcome];
  const offset = touching({ turn, lift: liftAt(turn) }, along);
  const point = { x: HANDS.x + offset.x, y: HANDS.y + offset.y, z: HANDS.z + offset.z };
  const at = Math.max(pitchReaches(game, release, point.z), hit.at + QUICKEST);
  return { at, point, turn, along };
}

/**
 * Each outcome's flight off the bat: how long it takes, in seconds of game
 * time, and how high it rises, in feet. A fly-out comes down at the warning
 * track, where it's caught.
 */
const FLIGHT = {
  "home-run": { time: 1.8, peak: 80 },
  "fly-out": { time: 1.6, peak: 95 },
  foul: { time: 1.2, peak: 55 },
} as const;

/**
 * How far the fence stands from home plate at `angle` off the line to
 * centre field, in feet: from the foul poles' depth at 45° to centre
 * field's at 0, drawn as a straight run between (near enough for a ball
 * landing over it).
 */
const fenceAt = (angle: number) =>
  DIAMOND.centreField -
  (DIAMOND.centreField - DIAMOND.foulLine) *
    Math.min(1, Math.abs(angle) / (Math.PI / 4));

/**
 * How far a hit carries on the field, in feet: the Diamond is a major
 * league park, so a home run carries its own distance, and always over the
 * fence (a short one to the gaps clears it by 20 at least); a fly-out is
 * caught at the warning track; a foul drops in foul ground.
 */
function drawnCarry(hit: Hit) {
  const fence = fenceAt(hit.angle);
  if (hit.outcome === "home-run") return Math.max(hit.distance, fence + 20);
  if (hit.outcome === "fly-out") return fence - 12;
  return 0.55 * DIAMOND.foulLine;
}

/** Where the ball is `t` seconds after it left the bat at `from`. */
function inFlight(hit: Hit, from: Point, t: number): Point {
  const flight = FLIGHT[hit.outcome as keyof typeof FLIGHT];
  const f = Math.min(1, t / flight.time);
  const carry = drawnCarry(hit) * f;
  return {
    x: from.x + Math.sin(hit.angle) * carry,
    y: from.y * (1 - f) + 4 * flight.peak * f * (1 - f),
    z: from.z - Math.cos(hit.angle) * carry,
  };
}

/**
 * Where the ball is now, or null while it's in Curvebot's glove, or once a
 * pitch nobody hit has settled in the mitt (right under the camera).
 */
export function ballAt(game: Game, release: Point): Point | null {
  if (game.phase === "pitch") return pitchAt(game, release, game.clock);
  const { hit } = game;
  if (game.phase !== "result" || !hit) return null;
  const t = hit.at + game.clock;
  const contact = contactOf(game, release);
  if (!contact) {
    const settled = crossing(game) + intoMitt(game, release) + HELD;
    return t < settled ? pitchAt(game, release, t) : null;
  }
  if (t >= contact.at) return inFlight(hit, contact.point, t - contact.at);
  // On from where it was as the swing began, to where the bat meets it.
  const from = pitchAt(game, release, hit.at);
  return between(from, contact.point, (t - hit.at) / (contact.at - hit.at));
}

/** The bat now: loaded until a swing, then coming round, through the ball if it meets it, to the follow-through. */
export function batAt(game: Game, release: Point): Bat {
  const { hit } = game;
  if (game.phase !== "result" || !hit || hit.error === null) return LOADED;
  const contact = contactOf(game, release);
  const speed = contact
    ? (contact.turn - LOADED.turn) / (contact.at - hit.at)
    : WHIFF;
  const turn = Math.min(FOLLOWED.turn, LOADED.turn + speed * game.clock);
  return { turn, lift: liftAt(turn) };
}
