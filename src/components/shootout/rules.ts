/**
 * The Shootout's rules, as pure data and functions (no Three.js, no DOM),
 * so they're unit tested without WebGL, as the Derby's are. Training bots
 * pop up on spots round the Arena's stage roof; the visitor shoots them,
 * and charges an ultimate that locks onto every bot in view. No ammo, no
 * reload, no timer: it runs until Reset.
 *
 * `step` advances a game by a span of real time and returns a new one; what
 * happened during it is in its `events`. What a shot hits, and which bots
 * are in view, is the scene's to say (`Sight`), asked the moment a shot
 * fires or the ultimate locks on.
 */

/** ready: nothing moves until the visitor starts. playing: from Start on, until the page goes. */
export type Phase = "ready" | "playing";

/** Where a bot can pop up: the Arena's rim, the shore, a pad on the harbour, a Hong Kong roof, a light tower at the Diamond. */
export type SpotKind = "rim" | "shore" | "pad" | "roof" | "tower";

/** A spot a bot can pop up on, and how far it stands from the visitor, in metres. */
export type Spot = { kind: SpotKind; distance: number };

export type Bot = {
  id: number;
  /** Its spot, by index into the game's spots. */
  spot: number;
  hp: number;
  /** Seconds since it popped up, in its own (slowed) time. */
  age: number;
  /** How long it stays up before ducking, in its own time. */
  life: number;
  /** How far it strafes each way, in metres: 0 stands still. */
  strafe: number;
  /** Where in its strafe it started, radians. */
  strafeFrom: number;
  /** The ultimate's lock on it, 0 to 1. */
  lock: number;
};

/** What a shot hit: a bot, in the head or the body. */
export type Target = { bot: number; head: boolean };

/** The scene's say on what the camera sees. */
export type Sight = {
  /** What a shot fired now hits, if anything. */
  target(game: Game): Target | null;
  /** Whether bot `id` is in view now. */
  inView(id: number): boolean;
};

export type Input = {
  /** A shot: a lifted thumb, a click, Space. */
  trigger?: boolean;
  /** The ultimate: its ring, or Q. Starts it, or fires it while it runs. */
  ultimate?: boolean;
};

export type GameEvent =
  | { type: "up"; bot: number; spot: number }
  | { type: "shot" }
  | { type: "hit"; bot: number; head: boolean; damage: number }
  | {
      type: "kill";
      bot: number;
      spot: number;
      head: boolean;
      long: boolean;
      points: number;
      by: "shot" | "ultimate";
    }
  | { type: "ult-ready" }
  | { type: "ult-start" }
  | { type: "ult-fire"; kills: number }
  | { type: "three-for-one" };

export type Game = {
  phase: Phase;
  paused: boolean;
  /** Pop-ups at half speed, no strafing, no slow motion in the ultimate. */
  slow: boolean;
  spots: readonly Spot[];
  bots: Bot[];
  score: number;
  /** The best score, this visit's or an earlier one's. */
  best: number;
  kills: number;
  /** Seconds until the next shot can fire. */
  cooldown: number;
  /** A shot pulled in the gap, fired as it ends. */
  queued: boolean;
  /** The ultimate's charge, 0 to 1. */
  charge: number;
  /** The ultimate while it runs: how long it has run, in seconds. */
  ult: { time: number } | null;
  /** Seconds until the next bot may pop up, in the bots' time. */
  spawnIn: number;
  nextId: number;
  /** The seeded generator's state. */
  seed: number;
  events: GameEvent[];
};

/** The most shots a second: one every FIRE_GAP seconds. */
export const FIRE_GAP = 0.5;

/** A shot's damage: a bot has 140, so two to the body or one to the head. */
export const DAMAGE = { body: 70, head: 140 } as const;

/**
 * The training bots: `hp` each, `most` up at once, each up `life` seconds
 * (`lofty` more on a roof or a tower, far off), rising and ducking over
 * `rise` and `duck`, the next one `gap` seconds after; about half strafe,
 * `strafe` metres each way, never on the rim beside the visitor.
 */
export const BOT = {
  hp: 140,
  most: 4,
  life: [3, 5],
  lofty: 1.2,
  rise: 0.22,
  duck: 0.2,
  gap: [0.35, 0.9],
  strafe: 2.5,
} as const;

/** A kill's points, and what a headshot and a long shot add. */
export const POINTS = { kill: 100, head: 50, long: 50 } as const;

/** A long shot: past this many metres. */
export const LONG_SHOT = 120;

/**
 * The ultimate: charged a share `perDamage` per point of damage dealt,
 * running `time` seconds, locking fully onto a bot in view over `lock`
 * seconds, the bots at `slow` speed while it runs; three kills at once earn
 * Three for one.
 */
export const ULT = { perDamage: 1 / 1600, time: 6, lock: 1.3, slow: 0.35, three: 3 } as const;

/** Slow mode's speed for the bots, as a share of full. */
export const SLOW_SPEED = 0.5;

/** How often a bot pops up on each kind of spot, against the others. */
const WEIGHT: Record<SpotKind, number> = { rim: 2, shore: 3, pad: 3, roof: 2, tower: 1 };

/** A small seeded generator (mulberry32): returns the next value and seed. */
function random(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export function createGame({
  spots,
  seed = 1,
  slow = false,
  best = 0,
}: {
  spots: readonly Spot[];
  seed?: number;
  slow?: boolean;
  best?: number;
}): Game {
  return {
    phase: "ready",
    paused: false,
    slow,
    spots,
    bots: [],
    score: 0,
    best,
    kills: 0,
    cooldown: 0,
    queued: false,
    charge: 0,
    ult: null,
    spawnIn: 0.6,
    nextId: 1,
    seed,
    events: [],
  };
}

export const startGame = (game: Game): Game => ({ ...resetGame(game), phase: "playing" });

/** Clears the score, the bots and the ultimate; the best stays. */
export const resetGame = (game: Game): Game => ({
  ...game,
  bots: [],
  score: 0,
  kills: 0,
  cooldown: 0,
  queued: false,
  charge: 0,
  ult: null,
  spawnIn: 0.4,
  events: [],
});

export const setPaused = (game: Game, paused: boolean): Game => ({ ...game, paused });

export const setSlow = (game: Game, slow: boolean): Game => ({ ...game, slow });

/** The bots' own speed now: half in slow mode; slowed while the ultimate runs, but for slow mode. */
const botSpeed = (game: Game) =>
  game.slow ? SLOW_SPEED : game.ult ? ULT.slow : 1;

/** Deals `damage` to bot `id`: its hit, and its kill if it goes down. */
function damageBot(
  game: Game,
  id: number,
  damage: number,
  head: boolean,
  by: "shot" | "ultimate",
): Game {
  const bot = game.bots.find((b) => b.id === id);
  if (!bot) return game;
  const dealt = Math.min(bot.hp, damage);
  const events: GameEvent[] = [...game.events, { type: "hit", bot: id, head, damage }];
  // The ultimate charges from damage dealt by shots, not by itself.
  const charge = game.ult || by === "ultimate" ? game.charge : Math.min(1, game.charge + dealt * ULT.perDamage);
  if (charge >= 1 && game.charge < 1) events.push({ type: "ult-ready" });
  const hp = bot.hp - damage;
  if (hp > 0) {
    return {
      ...game,
      charge,
      events,
      bots: game.bots.map((b) => (b.id === id ? { ...b, hp } : b)),
    };
  }
  const long = by === "shot" && game.spots[bot.spot].distance > LONG_SHOT;
  const points = POINTS.kill + (head ? POINTS.head : 0) + (long ? POINTS.long : 0);
  const score = game.score + points;
  events.push({ type: "kill", bot: id, spot: bot.spot, head, long, points, by });
  return {
    ...game,
    charge,
    events,
    score,
    best: Math.max(game.best, score),
    kills: game.kills + 1,
    bots: game.bots.filter((b) => b.id !== id),
  };
}

/** Fires a shot now, at what the scene says it hits. */
function fire(game: Game, sight: Sight): Game {
  let next: Game = {
    ...game,
    cooldown: FIRE_GAP,
    queued: false,
    events: [...game.events, { type: "shot" }],
  };
  const target = sight.target(next);
  if (target) {
    next = damageBot(next, target.bot, target.head ? DAMAGE.head : DAMAGE.body, target.head, "shot");
  }
  return next;
}

/** Fires the ultimate: each locked bot takes its lock's share of a kill. */
function fireUltimate(game: Game): Game {
  let next: Game = { ...game, ult: null, cooldown: FIRE_GAP };
  let kills = 0;
  for (const bot of game.bots) {
    if (bot.lock <= 0) continue;
    const before = next.kills;
    next = damageBot(next, bot.id, bot.lock >= 1 ? BOT.hp : Math.round(bot.lock * BOT.hp), false, "ultimate");
    kills += next.kills - before;
  }
  next.bots = next.bots.map((b) => ({ ...b, lock: 0 }));
  next.events = [...next.events, { type: "ult-fire", kills }];
  if (kills >= ULT.three) next.events.push({ type: "three-for-one" });
  return next;
}

/** Pops a bot up on a free spot, chosen by weight. */
function spawn(game: Game): Game {
  const taken = new Set(game.bots.map((b) => b.spot));
  const free = game.spots.map((s, i) => ({ s, i })).filter(({ i }) => !taken.has(i));
  if (!free.length) return game;
  let seed = game.seed;
  const next = () => {
    const [value, s] = random(seed);
    seed = s;
    return value;
  };
  const total = free.reduce((sum, { s }) => sum + WEIGHT[s.kind], 0);
  let pick = next() * total;
  let chosen = free[free.length - 1];
  for (const f of free) {
    pick -= WEIGHT[f.s.kind];
    if (pick <= 0) {
      chosen = f;
      break;
    }
  }
  const lofty = chosen.s.kind === "roof" || chosen.s.kind === "tower";
  const life = BOT.life[0] + next() * (BOT.life[1] - BOT.life[0]) + (lofty ? BOT.lofty : 0);
  const strafes = !game.slow && chosen.s.kind !== "rim" && next() < 0.5;
  const bot: Bot = {
    id: game.nextId,
    spot: chosen.i,
    hp: BOT.hp,
    age: 0,
    life,
    strafe: strafes ? BOT.strafe : 0,
    strafeFrom: next() * Math.PI * 2,
    lock: 0,
  };
  const gap = BOT.gap[0] + next() * (BOT.gap[1] - BOT.gap[0]);
  return {
    ...game,
    seed,
    nextId: game.nextId + 1,
    spawnIn: gap,
    bots: [...game.bots, bot],
    events: [...game.events, { type: "up", bot: bot.id, spot: bot.spot }],
  };
}

/**
 * Advances `game` by `dt` seconds of real time, after taking `input`. Paused
 * or before Start, nothing happens.
 */
export function step(game: Game, dt: number, input: Input, sight: Sight): Game {
  let next: Game = { ...game, events: [] };
  if (next.phase !== "playing" || next.paused) return next;

  // The input, at the start of the step.
  if (input.ultimate) {
    if (next.ult) next = fireUltimate(next);
    else if (next.charge >= 1) {
      next = {
        ...next,
        charge: 0,
        queued: false,
        ult: { time: 0 },
        bots: next.bots.map((b) => ({ ...b, lock: 0 })),
        events: [...next.events, { type: "ult-start" }],
      };
    }
  }
  if (input.trigger && !next.ult) {
    if (next.cooldown <= 0) next = fire(next, sight);
    else next = { ...next, queued: true };
  }

  // The gap between shots; a shot pulled in it fires as it ends.
  const cooldown = next.cooldown - dt;
  next = { ...next, cooldown: Math.max(0, cooldown) };
  if (next.queued && cooldown <= 0 && !next.ult) next = fire(next, sight);

  // The bots: up, then ducking, then gone; the ultimate locks onto those in view.
  const botDt = dt * botSpeed(next);
  next.bots = next.bots
    .map((b) => ({
      ...b,
      age: b.age + botDt,
      lock: next.ult && sight.inView(b.id) ? Math.min(1, b.lock + dt / ULT.lock) : b.lock,
    }))
    .filter((b) => b.age < b.life + BOT.duck);

  // The ultimate runs out: it fires itself.
  if (next.ult) {
    const time = next.ult.time + dt;
    next = { ...next, ult: { time } };
    if (time >= ULT.time) next = fireUltimate(next);
  }

  // The next bot, while there's room (none pop up while the ultimate runs).
  next.spawnIn -= botDt;
  if (!next.ult && next.spawnIn <= 0 && next.bots.length < BOT.most) next = spawn(next);
  return next;
}
