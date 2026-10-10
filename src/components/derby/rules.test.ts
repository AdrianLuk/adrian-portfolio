import { describe, expect, it } from "vitest";
import {
  createGame,
  isLive,
  overLine,
  PITCH_TIME,
  setPaused,
  setSlow,
  startGame,
  step,
  type Game,
  type GameEvent,
  type Input,
  WINDOW,
} from "./rules";

const FRAME = 1 / 60;

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

const over = (g: Game) => g.phase === "over";
const outcomes = (events: GameEvent[]) =>
  events.flatMap((e) => (e.type === "outcome" ? [e.outcome] : []));

describe("a Derby", () => {
  it("is ten pitches, and not swinging is a strike", () => {
    const { game, events } = runUntil(startGame(createGame()), over);
    expect(events.filter((e) => e.type === "pitch")).toHaveLength(10);
    expect(outcomes(events)).toEqual(Array(10).fill("strike"));
    expect(events.at(-1)).toEqual({ type: "over", homeRuns: 0 });
    expect(game.pitches).toBe(10);
  });
});

/** The next pitch on its way, just out of Curvebot's hand. */
function nextPitch(game: Game) {
  return runUntil(game, (g) => g.phase === "pitch").game;
}

/** Swings `error` seconds off the pitch's arrival (negative: early), and returns the game after. */
function swingOff(game: Game, error: number) {
  const pitch = nextPitch(game);
  return step(pitch, PITCH_TIME[pitch.pitch] + error - pitch.clock, {
    swing: true,
  });
}

describe("a swing", () => {
  const ready = startGame(createGame());

  it.each([
    [0, "home-run"],
    [-0.04, "home-run"],
    [0.04, "home-run"],
    [-0.08, "fly-out"],
    [0.08, "fly-out"],
    [-0.14, "foul"],
    [0.14, "foul"],
    [-0.3, "strike"],
  ])("%ss off the pitch's arrival is a %s", (error, outcome) => {
    const game = swingOff(ready, error);
    expect(game.events).toContainEqual({ type: "swing" });
    expect(game.hit?.outcome).toBe(outcome);
  });

  it("too late, once the ball is by, is a strike that was never swung at", () => {
    const pitch = nextPitch(ready);
    const by = step(pitch, PITCH_TIME[pitch.pitch] + 0.3 - pitch.clock);
    expect(by.hit?.outcome).toBe("strike");
    expect(step(by, FRAME, { swing: true }).events).toEqual([]);
  });

  it("counts once a pitch: a second swing at it does nothing", () => {
    const missed = swingOff(ready, -0.3);
    expect(missed.hit?.outcome).toBe("strike");
    expect(step(missed, FRAME, { swing: true }).events).toEqual([]);
  });

  it("does nothing during the windup", () => {
    const windup = step(ready, FRAME, { swing: true });
    expect(windup.phase).toBe("windup");
    expect(windup.events).toEqual([]);
  });

  it("pulls an early one toward left field and pushes a late one toward right", () => {
    expect(swingOff(ready, -0.04).hit!.angle).toBeLessThan(0);
    expect(swingOff(ready, 0.04).hit!.angle).toBeGreaterThan(0);
    expect(swingOff(ready, 0).hit!.angle).toBeCloseTo(0);
  });

  it("hooks a foul outside the foul lines, 45° off centre field, and keeps everything fair inside them", () => {
    for (const error of [-0.14, 0.14]) {
      expect(Math.abs(swingOff(ready, error).hit!.angle)).toBeGreaterThan(
        Math.PI / 4,
      );
    }
    for (const error of [-0.08, 0.08, -0.04, 0.04]) {
      expect(Math.abs(swingOff(ready, error).hit!.angle)).toBeLessThan(
        Math.PI / 4,
      );
    }
  });
});

describe("a home run", () => {
  const ready = startGame(createGame());

  it("carries its distance, furthest off the sweet spot", () => {
    const sweet = swingOff(ready, 0);
    const edge = swingOff(ready, WINDOW.homeRun - 1e-4);
    expect(sweet.events).toContainEqual({
      type: "outcome",
      outcome: "home-run",
      distance: 460,
    });
    expect(edge.hit?.distance).toBe(360);
    expect(swingOff(ready, 0.02).hit?.distance).toBe(420);
  });

  it("counts toward the game's home runs; nothing else does", () => {
    let game = ready;
    for (const error of [0, 0.08, 0.14, -0.3, 0.01]) {
      game = swingOff(game, error);
    }
    expect(game.homeRuns).toBe(2);
  });

  it("three in a row is an event, raised once the third lands", () => {
    let game = swingOff(ready, 0);
    game = swingOff(game, 0.01);
    expect(game.streak).toBe(2);
    const third = swingOff(game, -0.01);
    expect(third.events).toContainEqual({ type: "three-in-a-row" });
    expect(swingOff(third, 0).events).not.toContainEqual({
      type: "three-in-a-row",
    });
  });

  it("a miss in between breaks the run", () => {
    let game = ready;
    const events: GameEvent[] = [];
    for (const error of [0, 0, 0.08, 0, 0]) {
      game = swingOff(game, error);
      events.push(...game.events);
    }
    expect(events).not.toContainEqual({ type: "three-in-a-row" });
    expect(game.streak).toBe(2);
  });
});

describe("Curvebot's pitches", () => {
  it("mix their speeds: never the same pitch twice running", () => {
    for (const seed of [1, 7, 42, 999]) {
      const { events } = runUntil(startGame(createGame({ seed })), over);
      const kinds = events.flatMap((e) => (e.type === "pitch" ? [e.kind] : []));
      for (let i = 1; i < kinds.length; i++) {
        expect(PITCH_TIME[kinds[i]]).not.toBe(PITCH_TIME[kinds[i - 1]]);
      }
    }
  });
});

describe("slow mode", () => {
  it("slows the pitches to half speed, so a swing on time is twice as late in real time", () => {
    const pitch = nextPitch(startGame(createGame({ slow: true })));
    const arrives = PITCH_TIME[pitch.pitch];
    const early = step(pitch, arrives - pitch.clock, { swing: true });
    expect(early.hit?.outcome).toBe("strike");
    const onTime = step(pitch, 2 * (arrives - pitch.clock), { swing: true });
    expect(onTime.hit?.outcome).toBe("home-run");
  });

  it("can be switched mid-game", () => {
    const pitch = setSlow(nextPitch(startGame(createGame())), true);
    expect(step(pitch, 1).clock - pitch.clock).toBeCloseTo(0.5);
  });
});

describe("pause", () => {
  it("stands everything still, swings included, until resumed", () => {
    const pitch = nextPitch(startGame(createGame()));
    const paused = setPaused(pitch, true);
    const later = step(paused, 5, { swing: true });
    expect(later.clock).toBe(pitch.clock);
    expect(later.events).toEqual([]);
    expect(step(setPaused(later, false), FRAME).clock).toBeGreaterThan(
      pitch.clock,
    );
  });
});

describe("a new game", () => {
  it("holds still until it's started", () => {
    const game = step(createGame(), 5, { swing: true });
    expect(game.phase).toBe("ready");
    expect(game.events).toEqual([]);
    expect(isLive(game.phase)).toBe(false);
  });
});

describe("the game-over line", () => {
  const copy = {
    count: { one: "home run", other: "home runs" },
    bands: [
      { upTo: 0, line: "None." },
      { upTo: 3, line: "Some." },
      { upTo: 6, line: "Lots." },
      { upTo: 10, line: "All." },
    ],
  };

  it.each([
    [0, "0 home runs. None."],
    [1, "1 home run. Some."],
    [3, "3 home runs. Some."],
    [4, "4 home runs. Lots."],
    [6, "6 home runs. Lots."],
    [7, "7 home runs. All."],
    [10, "10 home runs. All."],
  ])("for %i is %j", (homeRuns, line) => {
    expect(overLine(homeRuns, copy)).toBe(line);
  });
});
