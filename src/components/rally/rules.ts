import { COURT } from "../world/court-size";

/**
 * The Rally game's rules, as pure data and functions (no Three.js, no DOM),
 * so they're unit tested without WebGL. Singles against an AI on a
 * pickleball court, in feet: the net across z = 0, the player's half at +z
 * (their baseline at z = 22, facing the net down -z), the AI's at -z.
 *
 * `step` advances a game by a span of real time and returns a new one; what
 * happened during it (a serve, a hit, a bounce, a point) is in its `events`,
 * for the scene's flashes and the page's announcements.
 */

export type Side = "player" | "ai";

/**
 * ready: nothing moves until the player starts. serving: the server holds
 * the ball. rally: the ball is in play. point: a short beat after a point,
 * before the next serve. over: someone has won.
 */
export type Phase = "ready" | "serving" | "rally" | "point" | "over";

export type Vec = { x: number; z: number };
export type Ball = { x: number; y: number; z: number; vx: number; vy: number; vz: number };

export type Input = {
  /** Keyboard movement, each axis -1 to 1. */
  move?: Vec;
  /** Touch movement since the last step, in feet: the drag, trackpad style. */
  drag?: Vec;
  /** Serve, when it's the player's serve. */
  serve?: boolean;
  /** Held: the player's next shot is a dink, not a drive. */
  dink?: boolean;
};

export type PointReason = "out" | "net" | "double-bounce" | "fault";

/** How a shot was hit: driven deep, or dinked softly into the kitchen. */
export type Shot = "drive" | "dink";

export type GameEvent =
  | { type: "serve"; side: Side }
  | { type: "hit"; side: Side; shot: Shot; volley: boolean; x: number; z: number }
  | { type: "bounce"; side: Side; in: boolean; x: number; z: number }
  | { type: "point"; winner: Side; reason: PointReason }
  | { type: "over"; winner: Side };

export type Game = {
  phase: Phase;
  paused: boolean;
  /** Ball and AI speeds halve: the whole game runs at half speed. */
  slow: boolean;
  score: Record<Side, number>;
  server: Side;
  winner: Side | null;
  player: Vec;
  /** The part of the player's touch drag they haven't covered yet. */
  dragLeft: Vec;
  ai: Vec;
  ball: Ball;
  /** Who hit the ball last (the serve counts), and how many shots the rally has had. */
  lastHitter: Side | null;
  shots: number;
  /** Bounces since the last hit. */
  bounces: number;
  /** Game time in the current phase, in seconds. */
  clock: number;
  /** Whether the AI plays this rally at the net. */
  aiAtNet: boolean;
  /** Where the AI is heading, and how long until it reacts to the last shot. */
  aiTarget: Vec;
  aiWait: number;
  /** The AI's next shot: a dink or a drive, how deep it lands, or the miss it will be. */
  aiDink: boolean;
  aiDepth: number;
  /** Where on its paddle the AI means to meet the ball: -1 its left edge to 1 its right. */
  aiOff: number;
  aiMiss: Miss | null;
  /** The seeded generator's state, so a game replays the same. */
  seed: number;
  events: GameEvent[];
};

const HALF_W = COURT.width / 2;
const BASELINE = COURT.length / 2;
const KITCHEN = COURT.kitchen;
const NET = COURT.netHeight;

/** Gravity, in feet per second squared. */
const GRAVITY = 32;
/** How much of its fall a ball keeps when it bounces, and of its pace. */
const BOUNCE_UP = 0.62;
const BOUNCE_ALONG = 0.88;
/** How long the serve flies, and how high it clears the net. */
const SERVE_TIME = 1.25;
const NET_CLEARANCE = 1.2;
/** Where a server stands, behind the baseline, and how far off centre. */
const SERVE_X = HALF_W / 2;
const SERVE_BACK = 1;
/** The ball's height in the server's hand. */
const SERVE_HEIGHT = 2;
/** The physics' fixed step, in seconds. */
const TICK = 1 / 240;
/** The beat after a point before the next serve, and the AI's wait to serve. */
const POINT_PAUSE = 1.4;
const AI_SERVE_DELAY = 1;
/** The player's top speed, in feet per second. */
const PLAYER_SPEED = 12;
/** How far behind the baseline and outside the sidelines a player may go. */
const ROOM_BACK = 8;
const ROOM_SIDE = 5;
/**
 * The invisible wall that keeps the player out of their kitchen: half a
 * foot behind the kitchen line, so they always stand where they may volley.
 */
const PLAYER_WALL = KITCHEN + 0.5;
/** How far from a player the paddle reaches, and how high. */
export const REACH = 3;
const REACH_HIGH = 6;
/** A shot's pace along the court (feet per second), its depth past the net, and its widest line in from a sideline. */
const SHOT_SPEED = 34;
const SHOT_DEPTH = 15;
const SHOT_INSIDE = 1.5;
/** First to 7, win by 2. */
const GAME_TO = 7;
const WIN_BY = 2;

/**
 * The AI's one level, tuned so a first-time player wins about half their
 * games: how long it takes to react to a shot, its top speed (feet per
 * second), and how often its shot goes wide, long or into the net. It aims
 * for the open court, away from the player, meeting the ball off its
 * paddle's centre by a fraction of its reach between AI_ANGLE's two ends,
 * and lands it between AI_DEPTH's (feet past the net).
 */
export const AI_REACTION_MS = 260;
export const AI_MAX_SPEED = 13;
export const AI_ERROR_RATE = 0.12;
export const AI_ANGLE = [0.2, 1] as const;
export const AI_DEPTH = [10, 19] as const;
/**
 * How often the AI dinks instead of driving (playing at the net, and from
 * further back, where it's a drop), and how deep its dinks land: inside the
 * player's kitchen, feet past the net.
 */
export const AI_DINK_RATE = { net: 0.4, back: 0.1 } as const;
/** How often the AI plays a rally at the net, coming up once the rules let it volley; otherwise it stays back. */
export const AI_NET_RATE = 0.4;
export const AI_DINK_DEPTH = [2.5, 6] as const;
/** A dink's pace along the court, its clearance over the net, and its longest flight. */
const DINK_SPEED = 14;
const DINK_CLEARANCE = 0.5;
const DINK_TIME = 1.6;
/** How deep the player's dink lands past the net: mid-kitchen. */
const PLAYER_DINK_DEPTH = 4.5;
/** How long after its bounce the AI means to take the ball. */
const AI_TAKE = 0.3;
/**
 * Where the AI waits between shots: back at the baseline until the
 * two-bounce rule lets it volley, then up at the kitchen line, a step
 * outside the kitchen, where it can volley and dink.
 */
const AI_READY: Vec = { x: 0, z: -(BASELINE - 1) };
const AI_NET: Vec = { x: 0, z: -(KITCHEN + 0.6) };
/** How far behind the kitchen line the AI still volleys from where it stands. */
const AI_VOLLEY_BACK = 6;

type Miss = "wide" | "long" | "net";
const MISSES: readonly Miss[] = ["wide", "long", "net"];

/** A small seeded generator (mulberry32): returns the next value and seed. */
function random(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** +1 for the player's half, -1 for the AI's. */
const sign = (side: Side) => (side === "player" ? 1 : -1);
const other = (side: Side): Side => (side === "player" ? "ai" : "player");
const sideOf = (z: number): Side => (z >= 0 ? "player" : "ai");

/**
 * Where a side stands to serve or receive: the right-hand court when the
 * server's score is even, the left when it's odd. Facing the net, the
 * player's right is +x and the AI's is -x.
 */
function servePosition(side: Side, serverScore: number): Vec {
  const right = serverScore % 2 === 0 ? 1 : -1;
  return {
    x: sign(side) * right * SERVE_X,
    z: sign(side) * (BASELINE + SERVE_BACK),
  };
}

/** Both sides to their places for the next serve, the ball in the server's hand. */
function toServe(game: Game): Game {
  const serverScore = game.score[game.server];
  const at = {
    [game.server]: servePosition(game.server, serverScore),
    [other(game.server)]: servePosition(other(game.server), serverScore),
  } as Record<Side, Vec>;
  // Whether the AI plays this rally at the net, or from the baseline.
  const [roll, seed] = random(game.seed);
  return {
    ...game,
    seed,
    aiAtNet: roll < AI_NET_RATE,
    phase: "serving",
    clock: 0,
    player: at.player,
    dragLeft: { x: 0, z: 0 },
    ai: at.ai,
    ball: { ...held(at[game.server]), vx: 0, vy: 0, vz: 0 },
    lastHitter: null,
    shots: 0,
    bounces: 0,
    aiTarget: at.ai,
    aiWait: 0,
    aiDink: false,
    aiDepth: SHOT_DEPTH,
    aiOff: 0,
    aiMiss: null,
  };
}

const held = (at: Vec) => ({ x: at.x, y: SERVE_HEIGHT, z: at.z });

export function createGame({
  seed = 1,
  slow = false,
  score = { player: 0, ai: 0 },
  server = "player",
}: {
  seed?: number;
  slow?: boolean;
  score?: Record<Side, number>;
  server?: Side;
} = {}): Game {
  const game: Game = {
    phase: "ready",
    paused: false,
    slow,
    score: { ...score },
    server,
    winner: null,
    player: { x: 0, z: 0 },
    dragLeft: { x: 0, z: 0 },
    ai: { x: 0, z: 0 },
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
    lastHitter: null,
    shots: 0,
    bounces: 0,
    clock: 0,
    aiAtNet: false,
    aiTarget: AI_READY,
    aiWait: 0,
    aiDink: false,
    aiDepth: SHOT_DEPTH,
    aiOff: 0,
    aiMiss: null,
    seed,
    events: [],
  };
  return { ...toServe(game), phase: "ready" };
}

/** The player presses Start. */
export function startGame(game: Game): Game {
  return game.phase === "ready" ? toServe(game) : game;
}

/** Pause or resume: while paused, nothing moves and the clock stands still. */
export function setPaused(game: Game, paused: boolean): Game {
  return { ...game, paused };
}

/** Slow mode: the whole game, ball and AI alike, runs at half speed. */
export function setSlow(game: Game, slow: boolean): Game {
  return { ...game, slow };
}

/**
 * The score as it's called: the server's score first, then who serves, in
 * the words `serves` gives each side, e.g. "5–3, you serve".
 */
export function scoreCall(game: Game, serves: Record<Side, string>): string {
  const { server, score } = game;
  return `${score[server]}–${score[other(server)]}, ${serves[server]}`;
}

/** Whether the game is under way: started, and not yet over. */
export const isLive = (phase: Phase) => phase !== "ready" && phase !== "over";

/**
 * The ball's velocity to land at (tx, tz) from where it is, clearing the net
 * by `clearance` (negative to catch the net), its flight at least `time` long.
 */
function aim(ball: Ball, tx: number, tz: number, time: number, clearance: number) {
  let t = time;
  for (; t < 4; t += 0.02) {
    const vy = (-ball.y + 0.5 * GRAVITY * t * t) / t;
    // When it crosses the net, and how high it is then.
    const tn = (t * (0 - ball.z)) / (tz - ball.z);
    const y = ball.y + vy * tn - 0.5 * GRAVITY * tn * tn;
    if (clearance < 0 || y >= NET + clearance) break;
  }
  const vy = (-ball.y + 0.5 * GRAVITY * t * t) / t;
  return { vx: (tx - ball.x) / t, vy, vz: (tz - ball.z) / t };
}

/** The server puts the ball in play, into the diagonal service court. */
function serve(game: Game): Game {
  const s = sign(game.server);
  const ball = { ...game.ball };
  // Diagonal: across the centre line, into the receiver's half, midway
  // between their kitchen line and baseline.
  const tx = -ball.x;
  const tz = -s * (KITCHEN + (BASELINE - KITCHEN) / 2);
  Object.assign(ball, aim(ball, tx, tz, SERVE_TIME, NET_CLEARANCE));
  const served: Game = {
    ...game,
    phase: "rally",
    clock: 0,
    ball,
    lastHitter: game.server,
    shots: 1,
    bounces: 0,
    events: [...game.events, { type: "serve", side: game.server }],
  };
  return game.server === "player"
    ? readShot(served)
    : { ...served, aiTarget: AI_READY };
}

const inCourt = (x: number, z: number) =>
  Math.abs(x) <= HALF_W && Math.abs(z) <= BASELINE;

/**
 * Whether a serve from `server` landed in the receiver's diagonal service
 * court: past the kitchen line, on the far side of the centre line from
 * where it was served.
 */
function inServiceCourt(game: Game, x: number, z: number) {
  const s = sign(game.server);
  const from = servePosition(game.server, game.score[game.server]).x;
  return (
    inCourt(x, z) &&
    -s * z > KITCHEN &&
    Math.sign(x) !== Math.sign(from)
  );
}

/** The point goes to `winner`; the game may be over. */
function point(game: Game, winner: Side, reason: PointReason): Game {
  const score = { ...game.score, [winner]: game.score[winner] + 1 };
  const won =
    score[winner] >= GAME_TO && score[winner] - score[other(winner)] >= WIN_BY;
  const events: GameEvent[] = [
    ...game.events,
    { type: "point", winner, reason },
  ];
  if (won) events.push({ type: "over", winner });
  return {
    ...game,
    score,
    server: winner,
    winner: won ? winner : null,
    phase: won ? "over" : "point",
    clock: 0,
    events,
  };
}

/** The ball one tick on: under gravity, and off the court if it lands. */
function advance(was: Ball, dt: number): { ball: Ball; bounced: boolean } {
  const b = { ...was };
  b.vy -= GRAVITY * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  if (b.y > 0 || b.vy >= 0) return { ball: b, bounced: false };
  b.y = 0;
  b.vy = -b.vy * BOUNCE_UP;
  b.vx *= BOUNCE_ALONG;
  b.vz *= BOUNCE_ALONG;
  return { ball: b, bounced: true };
}

/**
 * Where the ball crosses depth `z` on its way down the court, before it
 * bounces and low enough for a paddle; null if it bounces first or passes
 * too high.
 */
function crossing(ball: Ball, z: number): Vec | null {
  let b = ball;
  for (let t = 0; t < 5; t += TICK) {
    const next = advance(b, TICK);
    if (next.bounced) return null;
    b = next.ball;
    if (Math.sign(b.vz) * (b.z - z) >= 0) {
      return b.y <= REACH_HIGH - 0.5 ? { x: b.x, z: b.z } : null;
    }
  }
  return null;
}

/** Where the ball will be `after` seconds past its next bounce. */
function pastBounce(ball: Ball, after: number): Vec {
  let b = ball;
  let left = Infinity;
  for (let t = 0; t < 5 && left > 0; t += TICK) {
    const next = advance(b, TICK);
    b = next.ball;
    if (next.bounced && left === Infinity) left = after;
    else left -= TICK;
  }
  return { x: b.x, z: b.z };
}

/** One fixed tick of the ball's flight, and the point it may decide. */
function fly(game: Game, dt: number): Game {
  const was = game.ball;
  const { ball: b, bounced } = advance(was, dt);
  const hitter = game.lastHitter!;

  // Into the net on its way over: the hitter's point lost.
  if (Math.sign(b.z) !== Math.sign(was.z) && b.y < NET && game.bounces === 0) {
    const stopped = { ...b, z: 0, vx: 0, vz: 0 };
    return point({ ...game, ball: stopped }, other(hitter), "net");
  }
  if (!bounced) return { ...game, ball: b };

  const side = sideOf(b.z);
  const isIn =
    game.shots === 1 ? inServiceCourt(game, b.x, b.z) : inCourt(b.x, b.z);
  game = {
    ...game,
    ball: b,
    bounces: game.bounces + 1,
    events: [
      ...game.events,
      { type: "bounce", side, in: isIn, x: b.x, z: b.z },
    ],
  };

  if (game.bounces === 1) {
    if (side === hitter) return point(game, other(hitter), "net");
    if (!isIn) {
      return point(game, other(hitter), game.shots === 1 ? "fault" : "out");
    }
    return game;
  }
  return point(game, other(side), "double-bounce");
}

/** Where the ball will next land, as it flies now. */
export function landing(ball: Ball): Vec {
  const t =
    (ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * GRAVITY * Math.max(ball.y, 0))) /
    GRAVITY;
  return { x: ball.x + ball.vx * t, z: ball.z + ball.vz * t };
}

/**
 * Whether `side`'s automatic swing hits the ball now. It waits for the
 * bounce when the rules say so: the serve and its return must each bounce
 * (the two-bounce rule), and nobody volleys from inside the kitchen. It also
 * lets go a ball that will land out.
 */
function canHit(game: Game, side: Side): boolean {
  const { ball } = game;
  const at = game[side];
  if (game.lastHitter === side || sideOf(ball.z) !== side) return false;
  if (ball.y > REACH_HIGH) return false;
  if (Math.hypot(ball.x - at.x, ball.z - at.z) > REACH) return false;
  if (game.bounces > 0) return true;
  const volleyAllowed = game.shots >= 3 && Math.abs(at.z) > KITCHEN;
  const goingOut = !inCourt(landing(ball).x, landing(ball).z);
  return volleyAllowed && !goingOut;
}

const between = ([low, high]: readonly [number, number], roll: number) =>
  low + (high - low) * roll;

/**
 * The AI reads the shot coming at it: after its reaction time, it heads for
 * where it can volley it (up the court, once the rules allow) or take it
 * just after the bounce, its paddle off centre so its return angles away
 * from the player; it lets a ball landing out go. It also picks its return
 * now: a dink, more often when it's up at the net, or a drive, and how deep
 * it lands; or the miss it will be.
 */
function readShot(game: Game): Game {
  let seed = game.seed;
  let roll: number;
  [roll, seed] = random(seed);
  // Away from the player: off the paddle's left edge when they're right.
  const open = game.player.x === 0 ? Math.sign(roll - 0.5) : -Math.sign(game.player.x);
  [roll, seed] = random(seed);
  const off = open * between(AI_ANGLE, roll);
  [roll, seed] = random(seed);
  const deep = roll;
  [roll, seed] = random(seed);
  const soft = roll;
  [roll, seed] = random(seed);
  let miss: Miss | null = null;
  if (roll < AI_ERROR_RATE) {
    [roll, seed] = random(seed);
    miss = MISSES[Math.floor(roll * MISSES.length)];
  }
  const lands = landing(game.ball);
  const take = pastBounce(game.ball, AI_TAKE);
  // Up the court, with volleys allowed: meet it in the air where it stands.
  const depth = Math.min(game.ai.z, -(KITCHEN + 0.6));
  const volley =
    game.shots >= 3 && depth > -(KITCHEN + AI_VOLLEY_BACK)
      ? crossing(game.ball, depth)
      : null;
  const aiTarget = !inCourt(lands.x, lands.z)
    ? recover(game)
    : volley
      ? clampTo("ai", { x: volley.x - off * REACH * 0.8, z: depth })
      : clampTo("ai", { x: take.x - off * REACH, z: take.z });
  const atNet = aiTarget.z > -(KITCHEN + AI_VOLLEY_BACK);
  const aiDink = soft < (atNet ? AI_DINK_RATE.net : AI_DINK_RATE.back);
  return {
    ...game,
    seed,
    aiTarget,
    aiWait: AI_REACTION_MS / 1000,
    aiDink,
    aiDepth: between(aiDink ? AI_DINK_DEPTH : AI_DEPTH, deep),
    aiOff: off,
    aiMiss: miss,
  };
}

/**
 * Where the AI goes after its shot. Back to the baseline until the ball
 * coming back may be volleyed (after its return, or its third shot when it
 * served); then up to the kitchen line if it's playing this rally at the
 * net, or if the ball has already drawn it in close. Otherwise it stays back.
 */
function recover(game: Game): Vec {
  if (game.shots < 2) return AI_READY;
  const drawnIn = game.ai.z > -(KITCHEN + AI_VOLLEY_BACK);
  return game.aiAtNet || drawnIn ? AI_NET : AI_READY;
}

/** The AI's shot, if it's one that misses: its line, and how it clears the net. */
function missed(miss: Miss | null, off: number) {
  if (miss === "wide") return { x: Math.sign(off || 1) * (HALF_W + 3) };
  if (miss === "long") return { z: BASELINE + 4 };
  // Short and flat: down on its own side of the net.
  if (miss === "net") return { z: -2, clearance: -1 };
  return {};
}

/**
 * `side` hits the ball: deep into the other half, angled by where the ball
 * meets the paddle. Off the paddle's right edge it goes right, off its
 * centre straight; the AI meets it where it planned to. A dink (the AI's
 * when it chose one, the player's while they hold it) drops softly into the
 * other kitchen instead, and the AI's planned miss, if any, goes wide, long
 * or into the net.
 */
function swing(game: Game, side: Side, playerDinks: boolean): Game {
  const at = game[side];
  const ball = { ...game.ball };
  const off =
    side === "ai"
      ? game.aiOff
      : Math.max(-1, Math.min(1, (ball.x - at.x) / REACH));
  const miss = side === "ai" ? missed(game.aiMiss, off) : {};
  const dink =
    side === "ai" ? game.aiDink && !game.aiMiss : playerDinks;
  // A dink angles less: cross-court into the kitchen, not at the sideline.
  const tx = miss.x ?? off * (HALF_W - SHOT_INSIDE) * (dink ? 0.7 : 1);
  const depth =
    side === "ai" ? game.aiDepth : dink ? PLAYER_DINK_DEPTH : SHOT_DEPTH;
  const tz = miss.z ?? -sign(side) * depth;
  const along = Math.hypot(tx - ball.x, tz - ball.z);
  Object.assign(
    ball,
    dink
      ? aim(ball, tx, tz, Math.min(along / DINK_SPEED, DINK_TIME), DINK_CLEARANCE)
      : aim(ball, tx, tz, along / SHOT_SPEED, miss.clearance ?? 1),
  );
  const volley = game.bounces === 0;
  const hit: Game = {
    ...game,
    ball,
    lastHitter: side,
    shots: game.shots + 1,
    bounces: 0,
    events: [
      ...game.events,
      { type: "hit", side, shot: dink ? "dink" : "drive", volley, x: at.x, z: at.z },
    ],
  };
  return side === "player"
    ? readShot(hit)
    : {
        ...hit,
        aiTarget: recover(hit),
        aiWait: 0,
        aiMiss: null,
      };
}

/** The AI's movement for one tick, once it has reacted. */
function moveAi(game: Game, dt: number): Game {
  if (game.aiWait > 0) return { ...game, aiWait: game.aiWait - dt };
  const dx = game.aiTarget.x - game.ai.x;
  const dz = game.aiTarget.z - game.ai.z;
  const far = Math.hypot(dx, dz);
  const reach = AI_MAX_SPEED * dt;
  if (far <= reach) return { ...game, ai: game.aiTarget };
  return {
    ...game,
    ai: { x: game.ai.x + (dx / far) * reach, z: game.ai.z + (dz / far) * reach },
  };
}

/** Keeps a player in their own half, with room round the court. */
function clampTo(side: Side, at: Vec): Vec {
  const s = sign(side);
  const near = Math.min(Math.max(s * at.z, 0.5), BASELINE + ROOM_BACK);
  const reach = HALF_W + ROOM_SIDE;
  return { x: Math.min(Math.max(at.x, -reach), reach), z: s * near };
}

/**
 * The player's movement for one tick, at top speed: along the keys, and
 * through as much of the drag still to cover as that speed allows. The
 * player slides along the wall at their kitchen line; a drag that runs into
 * the edge of the player's room, or that wall, is dropped.
 */
function movePlayer(game: Game, input: Input, dt: number): Game {
  const move = input.move ?? { x: 0, z: 0 };
  const length = Math.hypot(move.x, move.z);
  const scale = length > 1 ? 1 / length : 1;
  const { dragLeft } = game;
  const left = Math.hypot(dragLeft.x, dragLeft.z);
  const share = left > 0 ? Math.min(1, (PLAYER_SPEED * dt) / left) : 0;
  const wanted = {
    x: game.player.x + move.x * scale * PLAYER_SPEED * dt + dragLeft.x * share,
    z: game.player.z + move.z * scale * PLAYER_SPEED * dt + dragLeft.z * share,
  };
  const room = clampTo("player", wanted);
  const player = { x: room.x, z: Math.max(room.z, PLAYER_WALL) };
  const blocked = player.x !== wanted.x || player.z !== wanted.z;
  return {
    ...game,
    player,
    dragLeft: blocked
      ? { x: 0, z: 0 }
      : { x: dragLeft.x * (1 - share), z: dragLeft.z * (1 - share) },
  };
}

export function step(game: Game, dt: number, input: Input = {}): Game {
  game = { ...game, events: [] };
  if (game.paused || !isLive(game.phase)) {
    return game;
  }
  const time = dt * (game.slow ? 0.5 : 1);

  if (game.phase === "serving" && game.server === "player" && input.serve) {
    game = serve(game);
  }

  if (game.phase === "rally" && input.drag) {
    const { x, z } = game.dragLeft;
    game = { ...game, dragLeft: { x: x + input.drag.x, z: z + input.drag.z } };
  }
  for (let t = 0; t < time - 1e-9; t += TICK) {
    const tick = Math.min(TICK, time - t);
    game = { ...game, clock: game.clock + tick };
    if (game.phase === "rally") {
      game = movePlayer(game, input, tick);
      game = moveAi(game, tick);
      game = fly(game, tick);
      for (const side of ["player", "ai"] as const) {
        if (game.phase === "rally" && canHit(game, side)) {
          game = swing(game, side, !!input.dink);
        }
      }
    } else if (game.phase === "point" && game.clock >= POINT_PAUSE) {
      game = toServe(game);
    } else if (
      game.phase === "serving" &&
      game.server === "ai" &&
      game.clock >= AI_SERVE_DELAY
    ) {
      game = serve(game);
    }
  }
  return game;
}
