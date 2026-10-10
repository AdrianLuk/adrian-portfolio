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

/** The bat: 34 inches, its sweet spot about 29 from the hands. */
export const BAT_LENGTH = 34 / 12;
const SWEET = 29 / 12;

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

/**
 * The batter's hands, a right-handed batter's on the plate's third-base
 * side: placed so a square, level swing's sweet spot meets a pitch over the
 * middle of the plate.
 */
export const HANDS: Point = (() => {
  const square = along({ turn: 0, lift: LEVEL });
  return {
    x: PLATE.x - SWEET * square.x,
    y: PLATE.y - SWEET * square.y,
    z: PLATE.z - SWEET * square.z,
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

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const between = (a: Point, b: Point, f: number): Point => ({
  x: lerp(a.x, b.x, f),
  y: lerp(a.y, b.y, f),
  z: lerp(a.z, b.z, f),
});

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
): { at: number; point: Point; turn: number } | null {
  const { hit } = game;
  if (game.phase !== "result" || !hit || hit.error === null) return null;
  if (hit.outcome === "strike") return null;
  const turn = -TURN_PER_ANGLE * hit.angle;
  const point = barrel({ turn, lift: liftAt(turn) });
  const at = Math.max(pitchReaches(game, release, point.z), hit.at + QUICKEST);
  return { at, point, turn };
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
 * How far a hit carries on the drawn field, in feet: the Diamond is about
 * half a real park, so a home run's real distance lands it in the outfield's
 * seats, its share past the fence as a real one's past a 330-foot fence; a
 * fly-out is caught at the warning track; a foul drops in foul ground.
 */
function drawnCarry(hit: Hit) {
  const fence = fenceAt(hit.angle);
  if (hit.outcome === "home-run") return (fence * hit.distance) / 330;
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
