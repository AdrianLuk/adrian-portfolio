import { describe, expect, it } from "vitest";
import {
  createGame,
  scoreCall,
  setPaused,
  setSlow,
  startGame,
  step,
  type Game,
  type GameEvent,
  type Input,
} from "./rules";

const FRAME = 1 / 60;

/** Runs the game for `seconds` of real time, collecting every event. */
function run(
  game: Game,
  seconds: number,
  input: Input | ((g: Game) => Input) = {},
) {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += FRAME) {
    game = step(game, FRAME, typeof input === "function" ? input(game) : input);
    events.push(...game.events);
  }
  return { game, events };
}

/** Runs the game until `done` holds (at most ten minutes), collecting every event. */
function runUntil(
  game: Game,
  done: (g: Game, events: GameEvent[]) => boolean,
  input: Input | ((g: Game) => Input) = {},
) {
  const events: GameEvent[] = [];
  for (let t = 0; t < 600; t += FRAME) {
    game = step(game, FRAME, typeof input === "function" ? input(game) : input);
    events.push(...game.events);
    if (done(game, events)) return { game, events };
  }
  throw new Error(`still waiting after ten minutes, in phase ${game.phase}`);
}

describe("a new game", () => {
  it("holds still until it's started", () => {
    const before = createGame();
    const { game, events } = run(before, 3, { move: { x: 1, z: 0 } });
    expect(game.phase).toBe("ready");
    expect(game.ball).toEqual(before.ball);
    expect(game.player).toEqual(before.player);
    expect(events).toEqual([]);
  });

  it("starts with the player to serve, from the right, at 0–0", () => {
    const game = startGame(createGame());
    expect(game.phase).toBe("serving");
    expect(game.server).toBe("player");
    expect(game.score).toEqual({ player: 0, ai: 0 });
    // The player faces the net down -z, so their right is +x.
    expect(game.player.x).toBeGreaterThan(0);
  });
});

/** Holds an arrow key toward the far corner behind the baseline: never in reach. */
const runAway: Input = { move: { x: -1, z: 1 } };

describe("points", () => {
  it("goes to the server when the receiver lets the ball bounce twice", () => {
    // The AI's serve, the player out of reach of it.
    const { game, events } = run(
      startGame(createGame({ server: "ai" })),
      6,
      runAway,
    );
    expect(events).toContainEqual({
      type: "point",
      winner: "ai",
      reason: "double-bounce",
    });
    expect(game.score).toEqual({ player: 0, ai: 1 });
  });

  it("gives the next serve to the point's winner, from the left on an odd score", () => {
    const { game } = runUntil(
      startGame(createGame({ server: "ai" })),
      (g, events) =>
        g.phase === "serving" && events.some((e) => e.type === "point"),
      runAway,
    );
    expect(game.server).toBe("ai");
    // The AI faces +z, so its left is +x.
    expect(game.ai.x).toBeGreaterThan(0);
  });
});

describe("the game", () => {
  const nextPoint = (game: Game) =>
    runUntil(game, (_, events) => events.some((e) => e.type === "point"), runAway);

  it("ends when a side reaches 7 with a 2-point lead", () => {
    const { game, events } = nextPoint(
      startGame(createGame({ score: { player: 3, ai: 6 }, server: "ai" })),
    );
    expect(game.phase).toBe("over");
    expect(game.winner).toBe("ai");
    expect(events).toContainEqual({ type: "over", winner: "ai" });
  });

  it("goes on past 6–6 until someone leads by 2", () => {
    const first = nextPoint(
      startGame(createGame({ score: { player: 6, ai: 6 }, server: "ai" })),
    );
    expect(first.game.score).toEqual({ player: 6, ai: 7 });
    expect(first.game.phase).not.toBe("over");

    const second = nextPoint(first.game);
    expect(second.game.score).toEqual({ player: 6, ai: 8 });
    expect(second.game.phase).toBe("over");
  });

  it("holds still once it's over", () => {
    const over = nextPoint(
      startGame(createGame({ score: { player: 0, ai: 6 }, server: "ai" })),
    ).game;
    const { game, events } = run(over, 3, runAway);
    expect(game.ball).toEqual(over.ball);
    expect(events).toEqual([]);
  });
});

describe("the automatic swing", () => {
  const firstHit = (events: GameEvent[], side: "player" | "ai") =>
    events.findIndex((e) => e.type === "hit" && e.side === side);
  const firstBounce = (events: GameEvent[], side: "player" | "ai") =>
    events.findIndex((e) => e.type === "bounce" && e.side === side);

  it("returns a serve the player stands in front of, after it bounces", () => {
    const { events } = runUntil(
      startGame(createGame({ server: "ai" })),
      (_, events) => firstHit(events, "player") >= 0,
    );
    expect(firstBounce(events, "player")).toBeGreaterThanOrEqual(0);
    expect(firstBounce(events, "player")).toBeLessThan(firstHit(events, "player"));
  });

  it("lets the serve bounce even when the receiver stands in its flight", () => {
    // Up at the kitchen line, in the serve's path, where it's still in the air.
    const toKitchen = (g: Game): Input =>
      g.player.z > 8 ? { move: { x: 0, z: -1 } } : {};
    const { events } = runUntil(
      startGame(createGame({ server: "ai" })),
      (_, events) => events.some((e) => e.type === "point"),
      toKitchen,
    );
    const hit = firstHit(events, "player");
    if (hit >= 0) {
      expect(firstBounce(events, "player")).toBeLessThan(hit);
    }
  });
});

/**
 * A player who plays the serve and return from the baseline, then rushes the
 * net to stand in the ball's line at `depth` feet from it: inside the
 * kitchen at under 7.
 */
const rusher =
  (depth: number) =>
  (g: Game): Input => {
    if (g.phase === "serving") return { serve: true };
    const early = g.lastHitter !== "player" && g.shots <= 2;
    const dx = g.ball.x - g.player.x;
    const dz = (early ? 21 : depth) - g.player.z;
    return { move: { x: Math.sign(dx) * Math.min(1, Math.abs(dx)), z: Math.sign(dz) * Math.min(1, Math.abs(dz)) } };
  };

/** Every hit in `events`, with the number of the shot it hit (the serve is 1). */
function hitsWithShot(events: GameEvent[]) {
  let shot = 0;
  const hits: { side: string; volley: boolean; z: number; shot: number }[] = [];
  for (const e of events) {
    if (e.type === "serve") shot = 1;
    if (e.type === "hit") {
      hits.push({ side: e.side, volley: e.volley, z: e.z, shot });
      shot += 1;
    }
  }
  return hits;
}

describe("the rules the swing keeps", () => {
  const hits = [1, 2, 3, 4, 5, 6].flatMap((seed) =>
    [4, 9].flatMap((depth) =>
      hitsWithShot(
        runUntil(
          startGame(createGame({ seed })),
          (g) => g.phase === "over",
          rusher(depth),
        ).events,
      ),
    ),
  );

  it("never volleys the serve or the return of serve, for either side", () => {
    expect(hits.length).toBeGreaterThan(20);
    for (const hit of hits.filter((h) => h.shot <= 2)) {
      expect(hit.volley).toBe(false);
    }
  });

  it("never volleys from inside the kitchen, for either side", () => {
    const volleys = hits.filter((h) => h.volley);
    // The rusher standing 9 ft back does volley: the rule is exercised.
    expect(volleys.some((h) => h.side === "player")).toBe(true);
    for (const volley of volleys) {
      expect(Math.abs(volley.z)).toBeGreaterThan(7);
    }
  });
});

/**
 * A player who sees the future: it plays the game on (with itself out of
 * the way) to find where the ball will be just after it bounces on its side,
 * and stands there, the ball off its paddle's edge away from the AI, so its
 * shot goes to the open side of the court.
 */
function perfectPlayer() {
  let plan: { shots: number; at: { x: number; z: number } } | null = null;
  return (g: Game): Input => {
    if (g.phase === "serving") return { serve: true };
    if (g.phase !== "rally") return {};
    const coming = g.lastHitter !== "player";
    if (coming && plan?.shots !== g.shots) {
      let ahead: Game = { ...g, player: { x: 40, z: 40 } };
      let after = Infinity;
      while (ahead.phase === "rally" && after > 0) {
        ahead = step(ahead, FRAME);
        if (ahead.events.some((e) => e.type === "bounce")) after = 0.25;
        else after -= FRAME;
      }
      const away = g.ai.x > 0 ? -1 : 1;
      plan = {
        shots: g.shots,
        at: { x: ahead.ball.x - away * 2.6, z: ahead.ball.z },
      };
    }
    const to = coming && plan ? plan.at : { x: 0, z: 20 };
    const dx = to.x - g.player.x;
    const dz = to.z - g.player.z;
    const far = Math.hypot(dx, dz);
    // Full speed, easing in over the last foot so it doesn't overshoot.
    const pace = Math.min(1, far);
    return far < 0.05
      ? {}
      : { move: { x: (dx / far) * pace, z: (dz / far) * pace } };
  };
}

describe("the AI", () => {
  it("is beaten by a perfect player", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { game } = runUntil(
        startGame(createGame({ seed })),
        (g) => g.phase === "over",
        perfectPlayer(),
      );
      expect(game.winner, `seed ${seed}: ${JSON.stringify(game.score)}`).toBe(
        "player",
      );
    }
  });

  it("returns the player's serve", () => {
    const { events } = runUntil(
      startGame(createGame()),
      (_, events) =>
        events.some((e) => e.type === "point" || (e.type === "hit" && e.side === "ai")),
      { serve: true },
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: "hit", side: "ai", volley: false }),
    );
  });
});

describe("slow mode", () => {
  /** How far the ball and the AI move in half a second of a rally. */
  function travel(slow: boolean) {
    // The player's serve, a moment in, once the AI has reacted; the AI out
    // wide, with a run to make.
    const served = {
      ...run(setSlow(startGame(createGame()), slow), slow ? 1 : 0.5, {
        serve: true,
      }).game,
      ai: { x: 14, z: -20 },
    };
    const later = run(served, 0.5).game;
    return {
      ball: Math.hypot(later.ball.x - served.ball.x, later.ball.z - served.ball.z),
      ai: Math.hypot(later.ai.x - served.ai.x, later.ai.z - served.ai.z),
    };
  }

  it("halves the ball's and the AI's speeds", () => {
    const full = travel(false);
    const slow = travel(true);
    expect(full.ai).toBeGreaterThan(1);
    expect(slow.ball).toBeCloseTo(full.ball / 2, 1);
    expect(slow.ai).toBeCloseTo(full.ai / 2, 1);
  });
});

describe("pausing", () => {
  it("stops everything until it's resumed, at any point", () => {
    const rally = run(startGame(createGame()), 0.4, { serve: true }).game;
    const paused = setPaused(rally, true);
    const held = run(paused, 3, { move: { x: 1, z: 0 } });
    expect(held.game.ball).toEqual(rally.ball);
    expect(held.game.player).toEqual(rally.player);
    expect(held.events).toEqual([]);

    const resumed = run(setPaused(held.game, false), 0.1).game;
    expect(resumed.ball).not.toEqual(rally.ball);
  });
});

describe("the score call", () => {
  it("calls the server's score first, then who serves", () => {
    const game = createGame({ score: { player: 3, ai: 5 }, server: "ai" });
    expect(scoreCall(game, "Bot")).toBe("5–3, Bot serves");
    expect(scoreCall({ ...game, server: "player" }, "Bot")).toBe(
      "3–5, you serve",
    );
  });
});

describe("the serve", () => {
  it("lands in the receiver's diagonal service court, past the kitchen", () => {
    const { events } = run(startGame(createGame()), 2, { serve: true });
    const bounce = events.find((e) => e.type === "bounce");
    expect(bounce).toMatchObject({ type: "bounce", side: "ai", in: true });
    if (bounce?.type !== "bounce") throw new Error("no bounce");
    // Diagonal from the player's right: the AI's right, -x.
    expect(bounce.x).toBeLessThan(0);
    expect(bounce.x).toBeGreaterThanOrEqual(-10);
    expect(bounce.z).toBeLessThan(-7);
    expect(bounce.z).toBeGreaterThanOrEqual(-22);
  });
});
