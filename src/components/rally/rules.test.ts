import { describe, expect, it } from "vitest";
import {
  createGame,
  landing,
  scoreCall,
  setPaused,
  setSlow,
  startGame,
  step,
  type Game,
  type GameEvent,
  type Input,
  type Side,
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

  it("ends when a side reaches 11 with a 2-point lead", () => {
    const { game, events } = nextPoint(
      startGame(createGame({ score: { player: 3, ai: 10 }, server: "ai" })),
    );
    expect(game.phase).toBe("over");
    expect(game.winner).toBe("ai");
    expect(events).toContainEqual({ type: "over", winner: "ai" });
  });

  it("goes on past 10–10 until someone leads by 2", () => {
    const first = nextPoint(
      startGame(createGame({ score: { player: 10, ai: 10 }, server: "ai" })),
    );
    expect(first.game.score).toEqual({ player: 10, ai: 11 });
    expect(first.game.phase).not.toBe("over");

    const second = nextPoint(first.game);
    expect(second.game.score).toEqual({ player: 10, ai: 12 });
    expect(second.game.phase).toBe("over");
  });

  it("holds still once it's over", () => {
    const over = nextPoint(
      startGame(createGame({ score: { player: 0, ai: 10 }, server: "ai" })),
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
 * net to stand in the ball's line at `depth` feet from it: under 7 is
 * inside the kitchen, so the wall at its line stops it there.
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

/** Where the perfect player plays from once it may volley: a step outside its kitchen. */
const PLAYER_NET = 8.5;

/**
 * A player who sees the future: it plays the game on (with itself out of
 * the way) to find where it can meet the ball, and stands there, the ball
 * off its paddle's edge away from the AI, so its shot goes to the open side
 * of the court. Like a good player, it comes up to the kitchen line once
 * the two-bounce rule lets it volley, and volleys there when the ball
 * passes low enough; otherwise it takes the ball just after the bounce.
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
      let volley: Game | null = null;
      while (ahead.phase === "rally" && after > 0) {
        ahead = step(ahead, FRAME);
        if (ahead.events.some((e) => e.type === "bounce")) after = 0.25;
        else after -= FRAME;
        const crossing = after === Infinity && ahead.ball.z >= PLAYER_NET;
        if (g.shots >= 3 && crossing && !volley && ahead.ball.y < 5) volley = ahead;
      }
      const meet = volley ?? ahead;
      const away = g.ai.x > 0 ? -1 : 1;
      plan = {
        shots: g.shots,
        at: { x: meet.ball.x - away * 2.6, z: volley ? PLAYER_NET : meet.ball.z },
      };
    }
    const ready = { x: 0, z: g.shots >= 2 ? PLAYER_NET : 20 };
    const to = coming && plan ? plan.at : ready;
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

describe("the AI's swing", () => {
  /**
   * The rally just after the player's third shot, the AI held still in that
   * shot's flight `depth` feet from the net, where it could volley it.
   */
  function aiInFlight(depth: number) {
    const third = runUntil(
      startGame(createGame({ seed: 2 })),
      (g) => g.lastHitter === "player" && g.shots >= 3,
      perfectPlayer(),
    ).game;
    // Where the ball crosses `depth`, the AI out of its way.
    let ahead: Game = { ...third, ai: { x: 40, z: -40 }, aiWait: 99 };
    while (ahead.ball.z > -depth) ahead = step(ahead, FRAME / 4);
    const spot = { x: ahead.ball.x, z: -depth };
    return { ...third, ai: spot, aiTarget: spot, aiWait: 99 };
  }
  const aiHit = (g: Game) =>
    runUntil(g, (_, events) =>
      events.some((e) => e.type === "point" || (e.type === "hit" && e.side === "ai")),
    ).events.find((e) => e.type === "hit" && e.side === "ai");

  it("volleys a third shot from outside the kitchen", () => {
    expect(aiHit(aiInFlight(9))).toMatchObject({ volley: true });
  });

  it("never volleys from inside the kitchen: it waits for the bounce", () => {
    const hit = aiHit(aiInFlight(5));
    if (hit?.type === "hit") expect(hit.volley).toBe(false);
  });
});

describe("Dinkbot at the kitchen line", () => {
  /**
   * Where Dinkbot stands `after` seconds past its hit of shot `shot`, the
   * player then standing still, out of the ball's way: once for each of 40
   * games in which that shot is in play (not one of its misses).
   */
  function afterHit(server: Side, shot: number, after: number) {
    const spots: { x: number; z: number }[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const hit = runUntil(
        startGame(createGame({ seed, server })),
        (g, events) =>
          events.some((e) => e.type === "point") ||
          (g.lastHitter === "ai" && g.shots === shot),
        perfectPlayer(),
      ).game;
      const lands = landing(hit.ball);
      if (hit.shots !== shot || lands.z < 0 || lands.z > 22 || Math.abs(lands.x) > 10) {
        continue;
      }
      spots.push(run({ ...hit, player: { x: 14, z: 29 } }, after).game.ai);
    }
    return spots;
  }
  const afterReturn = afterHit("player", 2, 1.3);
  const up = (spots: { z: number }[]) => spots.filter((s) => s.z > -9.5);

  it("comes up to the kitchen line after its return in some rallies, staying out of the kitchen", () => {
    expect(up(afterReturn).length).toBeGreaterThan(3);
    for (const spot of up(afterReturn)) expect(spot.z).toBeLessThan(-7);
  });

  it("stays back at the baseline in others", () => {
    expect(afterReturn.filter((s) => s.z < -18).length).toBeGreaterThan(3);
  });

  /** Every event of six full games against the perfect player. */
  const games = [1, 2, 3, 4, 5, 6].flatMap(
    (seed) =>
      runUntil(
        startGame(createGame({ seed })),
        (g) => g.phase === "over",
        perfectPlayer(),
      ).events,
  );

  it("volleys up the court: at the kitchen line, or on its way up to it", () => {
    const volleys = games.filter(
      (e) => e.type === "hit" && e.side === "ai" && e.volley,
    );
    expect(volleys.length).toBeGreaterThan(3);
    for (const v of volleys) {
      if (v.type !== "hit") continue;
      expect(v.z).toBeLessThan(-7);
      expect(v.z).toBeGreaterThan(-13);
    }
  });

  it("dinks: soft shots that land in the player's kitchen", () => {
    // Each of its shots: its pace off the paddle, and where it first lands
    // (if the player doesn't volley it first).
    const shots: { pace: number; lands?: { z: number; in: boolean } }[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let g = startGame(createGame({ seed }));
      const play = perfectPlayer();
      let last: (typeof shots)[number] | null = null;
      while (g.phase !== "over") {
        g = step(g, FRAME, play(g));
        for (const e of g.events) {
          if (e.type === "hit") {
            last = null;
            if (e.side === "ai") {
              last = { pace: Math.hypot(g.ball.vx, g.ball.vz) };
              shots.push(last);
            }
          }
          if (e.type === "bounce" && last && !last.lands) {
            last.lands = { z: e.z, in: e.in };
          }
        }
      }
    }
    const dinks = shots.filter(
      (s) => s.lands?.in && s.lands.z > 0 && s.lands.z < 7,
    );
    expect(dinks.length).toBeGreaterThan(5);
    for (const dink of dinks) expect(dink.pace).toBeLessThan(20);
    // And it still drives, more often than not.
    const drives = shots.filter((s) => s.pace > 25);
    expect(drives.length).toBeGreaterThan(dinks.length);
  });

  it("always stays back after its own serve, and may come up after its third shot", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const serving = startGame(createGame({ seed, server: "ai" }));
      const served = runUntil(serving, (g) => g.phase === "rally").game;
      expect(run(served, 0.8).game.ai.z).toBeLessThan(-18);
    }
    expect(up(afterHit("ai", 3, 1.3)).length).toBeGreaterThan(1);
  });
});

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

describe("a touch drag", () => {
  /** How far the player has moved, `seconds` after one 8 ft drag sideways mid-rally. */
  function dragged(slow: boolean, seconds: number) {
    const rally = run(setSlow(startGame(createGame()), slow), 0.2, {
      serve: true,
    }).game;
    let game = step(rally, FRAME, { drag: { x: -8, z: 0 } });
    game = run(game, seconds - FRAME).game;
    return rally.player.x - game.player.x;
  }

  it("moves the player as far as the finger did, no faster than the keys", () => {
    // 15 ft/s, the keys' top speed: a fifth of a second covers 3 ft, not 8.
    expect(dragged(false, 0.2)).toBeCloseTo(3, 0);
    expect(dragged(false, 1.5)).toBeCloseTo(8, 1);
  });

  it("runs at half speed in slow mode, like everything else", () => {
    expect(dragged(true, 0.2)).toBeCloseTo(1.5, 0);
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

describe("the kitchen wall", () => {
  const rally = () => run(startGame(createGame()), 0.2, { serve: true }).game;

  it("stops the player just behind their kitchen line", () => {
    const { game } = run(rally(), 3, { move: { x: 0, z: -1 } });
    expect(game.player.z).toBeGreaterThan(7);
    expect(game.player.z).toBeLessThan(8);
  });

  it("lets the player slide along it", () => {
    const at = run(rally(), 3, { move: { x: 0, z: -1 } }).game;
    const { game } = run(at, 0.25, { move: { x: -1, z: -1 } });
    expect(game.player.z).toBe(at.player.z);
    expect(game.player.x).toBeLessThan(at.player.x - 1);
  });

  it("stops a drag into the kitchen at the wall", () => {
    const dragged = step(rally(), FRAME, { drag: { x: 0, z: -30 } });
    const { game } = run(dragged, 3);
    expect(game.player.z).toBeGreaterThan(7);
  });

  it("keeps the sideways part of a drag that runs into it: the player slides along the wall", () => {
    const start = rally();
    const dragged = step(start, FRAME, { drag: { x: -6, z: -30 } });
    const { game } = run(dragged, 2);
    expect(game.phase).toBe("rally");
    expect(game.player.z).toBeGreaterThan(7);
    expect(game.player.z).toBeLessThan(8);
    expect(game.player.x).toBeCloseTo(start.player.x - 6, 1);
  });

  it("carries a drag along the wall once the player stands at it", () => {
    const at = run(rally(), 3, { move: { x: 0, z: -1 } }).game;
    const dragged = step(at, FRAME, { drag: { x: 4, z: -4 } });
    // Before the point can end: 15 ft/s for this long covers about 2.2 ft.
    const { game } = run(dragged, 0.15);
    expect(game.phase).toBe("rally");
    expect(game.player.z).toBe(at.player.z);
    expect(game.player.x - at.player.x).toBeGreaterThan(1.5);
    expect(game.dragLeft.x).toBeGreaterThan(0);
  });
});

describe("the edge of the player's room", () => {
  const rally = () => run(startGame(createGame()), 0.2, { serve: true }).game;

  it("keeps the part of a drag along it: a drag off the side still carries the player back", () => {
    const start = rally();
    const dragged = step(start, FRAME, { drag: { x: -40, z: 4 } });
    const { game } = run(dragged, 3);
    expect(game.player.x).toBeCloseTo(-15, 5);
    expect(game.player.z).toBeCloseTo(start.player.z + 4, 1);
  });
});

describe("the score call", () => {
  it("calls the server's score first, then who serves", () => {
    const serves = { player: "you serve", ai: "Bot serves" };
    const game = createGame({ score: { player: 3, ai: 5 }, server: "ai" });
    expect(scoreCall(game, serves)).toBe("5–3, Bot serves");
    expect(scoreCall({ ...game, server: "player" }, serves)).toBe(
      "3–5, you serve",
    );
  });
});

describe("the player's dink", () => {
  /** The player's return of Dinkbot's serve, holding `dink` or not: how it was hit, its pace, and where it lands. */
  function returnOfServe(dink: boolean) {
    const { game, events } = runUntil(
      startGame(createGame({ server: "ai" })),
      (g) => g.lastHitter === "player",
      { dink },
    );
    const hit = events.find((e) => e.type === "hit" && e.side === "player");
    return { hit, pace: Math.hypot(game.ball.vx, game.ball.vz), lands: landing(game.ball) };
  }

  it("held, makes the shot a dink: soft, into Dinkbot's kitchen", () => {
    const { hit, pace, lands } = returnOfServe(true);
    expect(hit).toMatchObject({ shot: "dink" });
    expect(pace).toBeLessThan(20);
    expect(lands.z).toBeLessThan(0);
    expect(lands.z).toBeGreaterThan(-7);
    expect(Math.abs(lands.x)).toBeLessThan(10);
  });

  it("not held, the shot is a drive, deep", () => {
    const { hit, pace, lands } = returnOfServe(false);
    expect(hit).toMatchObject({ shot: "drive" });
    expect(pace).toBeGreaterThan(25);
    expect(lands.z).toBeLessThan(-7);
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
