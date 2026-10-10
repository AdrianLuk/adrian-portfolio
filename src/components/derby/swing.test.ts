import { describe, expect, it } from "vitest";
import {
  createGame,
  PITCH_TIME,
  startGame,
  step,
  WINDOW,
  type Game,
} from "./rules";
import {
  ballAt,
  barrel,
  batAt,
  BAT_LENGTH,
  contactOf,
  HANDS,
  PLATE,
  type Point,
} from "./swing";

/** Where Curvebot lets the pitch go: the mound's top, as the Diamond draws it. */
const RELEASE: Point = { x: 0, y: 17, z: -55 };

const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** The next pitch on its way, just out of Curvebot's hand. */
function nextPitch(game: Game) {
  for (let t = 0; t < 10 && game.phase !== "pitch"; t += 1 / 60) {
    game = step(game, 1 / 60);
  }
  return game;
}

/** A pitch swung at `error` seconds off its arrival (negative: early), as the swing is decided. */
function swungAt(error: number, seed = 1) {
  const pitch = nextPitch(startGame(createGame({ seed })));
  return step(pitch, PITCH_TIME[pitch.pitch] + error - pitch.clock, {
    swing: true,
  });
}

/** Every swing that connects, early to late, on each kind of pitch. */
const connecting = [1, 2, 3].flatMap((seed) =>
  Array.from({ length: 31 }, (_, i) => -WINDOW.foul + (i * 2 * WINDOW.foul) / 30)
    .map((error) => swungAt(error, seed))
    .filter((game) => game.hit?.outcome !== "strike"),
);

/** The point on the bat nearest `p`, from the hands to its tip. */
function nearestOnBat(game: Game, p: Point) {
  let best = Infinity;
  for (let along = 0; along <= BAT_LENGTH; along += 0.05) {
    best = Math.min(best, distance(barrel(batAt(game, RELEASE), along), p));
  }
  return best;
}

describe("a swing that connects", () => {
  it("meets the ball on the bat's sweet spot, at the moment of contact", () => {
    expect(connecting.length).toBeGreaterThan(50);
    for (const game of connecting) {
      const contact = contactOf(game, RELEASE)!;
      const at = step(game, contact.at - game.hit!.at);
      const ball = ballAt(at, RELEASE)!;
      expect(distance(ball, contact.point)).toBeLessThan(0.01);
      expect(distance(barrel(batAt(at, RELEASE)), ball)).toBeLessThan(0.05);
    }
  });

  it("perfectly timed, meets it over the plate with the bat square to the pitch", () => {
    const game = swungAt(0);
    const contact = contactOf(game, RELEASE)!;
    // The plate is 17 inches across and as deep.
    expect(Math.abs(contact.point.x - PLATE.x)).toBeLessThan(17 / 24);
    expect(Math.abs(contact.point.z - PLATE.z)).toBeLessThan(17 / 24);
    const at = step(game, contact.at - game.hit!.at);
    expect(batAt(at, RELEASE).turn).toBeCloseTo(0);
  });

  it("early, meets it out in front of the plate; late, deep over it", () => {
    const early = contactOf(swungAt(-0.08), RELEASE)!.point.z;
    const square = contactOf(swungAt(0), RELEASE)!.point.z;
    const late = contactOf(swungAt(0.08), RELEASE)!.point.z;
    expect(early).toBeLessThan(square);
    expect(square).toBeLessThan(late);
  });

  it("sends the ball off from where the bat met it", () => {
    for (const game of connecting) {
      const contact = contactOf(game, RELEASE)!;
      const after = step(game, contact.at - game.hit!.at + 0.05);
      const ball = ballAt(after, RELEASE)!;
      // Away from the catcher, toward the field.
      expect(ball.z).toBeLessThan(contact.point.z);
    }
  });
});

describe("the ball", () => {
  it("never jumps, from Curvebot's hand to where it lands, swung at or not", () => {
    for (const error of [-0.3, -0.12, -0.04, 0, 0.04, 0.12, null]) {
      let game = nextPitch(startGame(createGame({ seed: 2 })));
      let last = ballAt(game, RELEASE);
      let swung = error === null;
      for (let t = 0; t < 4 && game.phase !== "windup"; t += 0.001) {
        const swing =
          !swung && game.phase === "pitch" &&
          game.clock >= PITCH_TIME[game.pitch] + (error ?? 0);
        swung ||= swing;
        game = step(game, 0.001, { swing });
        const now = ballAt(game, RELEASE);
        if (last && now) expect(distance(last, now)).toBeLessThan(0.4);
        last = now ?? last;
      }
    }
  });
});

describe("a swing and a miss", () => {
  it("never touches the ball: the bat goes through before it arrives, or after it's by", () => {
    for (const error of [-0.4, -0.25, 0.2]) {
      let game = swungAt(error);
      expect(game.hit?.outcome).toBe("strike");
      for (let t = 0; t < 0.6; t += 0.002) {
        const ball = ballAt(game, RELEASE);
        if (ball) expect(nearestOnBat(game, ball)).toBeGreaterThan(0.5);
        game = step(game, 0.002);
      }
    }
  });
});

describe("the bat", () => {
  it("stays loaded over the batter's shoulder until the swing", () => {
    let game = nextPitch(startGame(createGame()));
    const loaded = batAt(game, RELEASE);
    expect(loaded.lift).toBeGreaterThan(0.5);
    for (let t = 0; t < 0.5; t += 0.05) {
      game = step(game, 0.05);
      expect(batAt(game, RELEASE)).toEqual(loaded);
    }
    expect(distance(barrel(loaded, 0), HANDS)).toBeLessThan(1e-9);
  });
});
