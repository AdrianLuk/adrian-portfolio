import { describe, expect, it } from "vitest";
import {
  BOT,
  createGame,
  DAMAGE,
  FIRE_GAP,
  LONG_SHOT,
  resetGame,
  setPaused,
  setSlow,
  startGame,
  step,
  ULT,
  type Game,
  type Sight,
  type Spot,
} from "./rules";

/** One of each kind of spot, the shore's and the pad's far off. */
const SPOTS: Spot[] = [
  { kind: "rim", distance: 30 },
  { kind: "shore", distance: 90 },
  { kind: "pad", distance: 60 },
  { kind: "roof", distance: 150 },
  { kind: "tower", distance: 120 },
  { kind: "shore", distance: 40 },
];

/** Sees nothing: every shot misses, no bot is in view. */
const blind: Sight = { target: () => null, inView: () => false };

/** Aims at the first bot up (its head if `head`), and sees every bot. */
const aimAtFirst = (head = false): Sight => ({
  target: (game) => (game.bots[0] ? { bot: game.bots[0].id, head } : null),
  inView: () => true,
});

/** A game started on SPOTS, run on until `bots` bots are up. */
function withBots(bots: number, options: Parameters<typeof createGame>[0] = {}) {
  let game = startGame(createGame({ spots: SPOTS, seed: 7, ...options }));
  for (let i = 0; i < 400 && game.bots.length < bots; i++) {
    game = step(game, 0.05, {}, blind);
  }
  expect(game.bots.length).toBeGreaterThanOrEqual(bots);
  return game;
}

/** Steps `game` on by `seconds`, in frames, with no input; every event along the way. */
function run(game: Game, seconds: number, sight: Sight = blind) {
  const events: Game["events"] = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.05) {
    game = step(game, 0.05, {}, sight);
    events.push(...game.events);
  }
  return { game, events };
}

describe("the Shootout's rules", () => {
  it("moves nothing before Start", () => {
    const game = run(createGame({ spots: SPOTS }), 5).game;
    expect(game.phase).toBe("ready");
    expect(game.bots).toEqual([]);
  });

  it("pops bots up once started, never more than four at once, one to a spot, announcing each", () => {
    const { game, events } = run(startGame(createGame({ spots: SPOTS, seed: 3 })), 20);
    expect(events.some((e) => e.type === "up")).toBe(true);
    let up = 0;
    for (let g = startGame(createGame({ spots: SPOTS, seed: 3 })), i = 0; i < 400; i++) {
      g = step(g, 0.05, {}, blind);
      up = Math.max(up, g.bots.length);
      const spots = g.bots.map((b) => b.spot);
      expect(new Set(spots).size).toBe(spots.length);
    }
    expect(up).toBe(BOT.most);
    expect(game.phase).toBe("playing");
  });

  it("drops each bot after 3 to 5 seconds up, 1.2 longer on a roof or a tower", () => {
    const game = withBots(1);
    const bot = game.bots[0];
    const extra = ["roof", "tower"].includes(SPOTS[bot.spot].kind) ? BOT.lofty : 0;
    expect(bot.life).toBeGreaterThanOrEqual(BOT.life[0] + extra);
    expect(bot.life).toBeLessThanOrEqual(BOT.life[1] + extra);
    const later = run(game, bot.life + BOT.duck + 0.2).game;
    expect(later.bots.some((b) => b.id === bot.id)).toBe(false);
  });

  it("takes two body shots or one headshot to down a bot: 100 a kill, 50 more for the head", () => {
    let game = withBots(1);
    const id = game.bots[0].id;
    game = step(game, 0, { trigger: true }, aimAtFirst());
    expect(game.events).toContainEqual({ type: "hit", bot: id, head: false, damage: DAMAGE.body });
    expect(game.bots.find((b) => b.id === id)?.hp).toBe(BOT.hp - DAMAGE.body);
    game = run(game, FIRE_GAP + 0.05).game;
    game = step(game, 0, { trigger: true }, aimAtFirst());
    const kill = game.events.find((e) => e.type === "kill");
    expect(kill).toMatchObject({ bot: id, head: false });
    expect(game.score).toBe(SPOTS[kill!.type === "kill" ? kill!.spot : 0].distance > LONG_SHOT ? 150 : 100);
    expect(game.kills).toBe(1);
    expect(game.bots.some((b) => b.id === id)).toBe(false);

    let head = withBots(1);
    const target = head.bots[0];
    head = step(head, 0, { trigger: true }, aimAtFirst(true));
    expect(head.events).toContainEqual(expect.objectContaining({ type: "kill", bot: target.id, head: true }));
    expect(head.score).toBe(150 + (SPOTS[target.spot].distance > LONG_SHOT ? 50 : 0));
  });

  it("adds 50 for a long shot, past 80 m", () => {
    const far: Spot[] = [{ kind: "shore", distance: LONG_SHOT + 1 }];
    let game = startGame(createGame({ spots: far }));
    game = run(game, 3).game;
    game = step(game, 0, { trigger: true }, aimAtFirst(true));
    expect(game.score).toBe(200);
    expect(game.events).toContainEqual(expect.objectContaining({ type: "kill", long: true }));
  });

  it("fires two shots a second at most: a pull in the gap fires the moment it ends, once", () => {
    let game = withBots(1);
    game = step(game, 0, { trigger: true }, blind);
    expect(game.events).toContainEqual({ type: "shot" });
    game = step(game, 0.1, { trigger: true }, blind);
    game = step(game, 0.05, { trigger: true }, blind);
    expect(game.events.filter((e) => e.type === "shot")).toEqual([]);
    const { events } = run(game, 2);
    expect(events.filter((e) => e.type === "shot")).toHaveLength(1);
    const gap = run(game, FIRE_GAP - 0.15 - 0.06).events;
    expect(gap.filter((e) => e.type === "shot")).toEqual([]);
  });

  it("misses cost nothing but the gap", () => {
    let game = withBots(1);
    const before = game.bots[0].hp;
    game = step(game, 0, { trigger: true }, blind);
    expect(game.bots[0].hp).toBe(before);
    expect(game.score).toBe(0);
  });

  describe("the ultimate", () => {
    /** A game with the ultimate charged and three bots up. */
    function charged() {
      const game = withBots(3);
      return { ...game, charge: 1 };
    }

    it("charges from damage dealt, and says when it is ready", () => {
      let game = withBots(1);
      game = step(game, 0, { trigger: true }, aimAtFirst());
      expect(game.charge).toBeCloseTo(DAMAGE.body * ULT.perDamage);
      game = { ...game, charge: 1 - DAMAGE.body * ULT.perDamage / 2 };
      game = run(game, FIRE_GAP + 0.05).game;
      game = step(game, 0, { trigger: true }, aimAtFirst());
      expect(game.charge).toBe(1);
      expect(game.events).toContainEqual({ type: "ult-ready" });
    });

    it("can't start until charged", () => {
      const game = step(withBots(1), 0, { ultimate: true }, blind);
      expect(game.ult).toBeNull();
    });

    it("locks onto every bot in view while it runs, and a pull fires nothing", () => {
      let game = step(charged(), 0, { ultimate: true }, aimAtFirst());
      expect(game.events).toContainEqual({ type: "ult-start" });
      expect(game.charge).toBe(0);
      game = step(game, 0, { trigger: true }, aimAtFirst());
      expect(game.events).not.toContainEqual({ type: "shot" });
      game = run(game, ULT.lock / 2, aimAtFirst()).game;
      for (const bot of game.bots) expect(bot.lock).toBeGreaterThan(0.3);
    });

    it("downs each fully locked bot when fired, and three or more at once is Three for one", () => {
      let game = step(charged(), 0, { ultimate: true }, aimAtFirst());
      game = run(game, ULT.lock + 0.1, aimAtFirst()).game;
      const locked = game.bots.filter((b) => b.lock >= 1).length;
      expect(locked).toBeGreaterThanOrEqual(3);
      game = step(game, 0, { ultimate: true }, aimAtFirst());
      expect(game.ult).toBeNull();
      expect(game.events.filter((e) => e.type === "kill")).toHaveLength(locked);
      expect(game.events).toContainEqual({ type: "ult-fire", kills: locked });
      expect(game.events).toContainEqual({ type: "three-for-one" });
    });

    it("fires itself when its time runs out, and only bots in view are hit", () => {
      let game = step(charged(), 0, { ultimate: true }, blind);
      const { events } = run(game, ULT.time + 0.1);
      expect(events).toContainEqual({ type: "ult-fire", kills: 0 });
      expect(events).not.toContainEqual({ type: "three-for-one" });
      game = run(game, ULT.time + 0.1).game;
      expect(game.ult).toBeNull();
    });

    it("slows the bots while it runs, but not in slow mode", () => {
      const full = withBots(1);
      const ulting = step({ ...full, charge: 1 }, 0, { ultimate: true }, blind);
      const age = ulting.bots[0].age;
      expect(step(ulting, 1, {}, blind).bots[0].age - age).toBeCloseTo(ULT.slow);
      const slow = step({ ...setSlow(full, true), charge: 1 }, 0, { ultimate: true }, blind);
      expect(step(slow, 1, {}, blind).bots[0].age - slow.bots[0].age).toBeCloseTo(0.5);
    });
  });

  it("in slow mode pops bots up at half speed, none strafing", () => {
    const slow = withBots(4, { slow: true });
    expect(slow.bots.every((b) => b.strafe === 0)).toBe(true);
    const age = slow.bots[0].age;
    expect(step(slow, 1, {}, blind).bots[0].age - age).toBeCloseTo(0.5);
    const strafing = Array.from({ length: 8 }, (_, seed) => withBots(4, { seed })).flatMap((g) => g.bots);
    expect(strafing.some((b) => b.strafe !== 0)).toBe(true);
    // Never on the rim beside you.
    expect(strafing.filter((b) => SPOTS[b.spot].kind === "rim").every((b) => b.strafe === 0)).toBe(true);
  });

  it("stands still while paused", () => {
    const game = setPaused(withBots(2), true);
    expect(step(game, 2, { trigger: true }, aimAtFirst())).toEqual({ ...game, events: [] });
  });

  it("resets the score and the bots, keeping the best", () => {
    let game = withBots(1);
    game = step(game, 0, { trigger: true }, aimAtFirst(true));
    expect(game.best).toBe(game.score);
    expect(game.best).toBeGreaterThan(0);
    const reset = resetGame({ ...game, charge: 0.5 });
    expect(reset).toMatchObject({ score: 0, kills: 0, charge: 0, ult: null, bots: [], best: game.best, phase: "playing" });
  });

  it("starts from a best kept from an earlier visit", () => {
    expect(createGame({ spots: SPOTS, best: 900 }).best).toBe(900);
  });
});
