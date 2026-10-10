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
  BALL_RADIUS,
  barrel,
  batAt,
  BAT_LENGTH,
  batRadius,
  contactOf,
  HANDS,
  homeRunFlight,
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

/** The gap between the ball, its centre at `ball`, and the drawn bat's surface, from the hands to its end (negative: overlapping). */
function clearance(game: Game, ball: Point) {
  const bat = batAt(game, RELEASE);
  let gap = Infinity;
  for (let fromHands = 0; fromHands <= BAT_LENGTH; fromHands += 0.02) {
    gap = Math.min(
      gap,
      distance(barrel(bat, fromHands), ball) - batRadius(fromHands) - BALL_RADIUS,
    );
  }
  return gap;
}

describe("a swing that connects", () => {
  it("meets the ball at the moment of contact: touching the bat on the mound's side, never inside it", () => {
    expect(connecting.length).toBeGreaterThan(50);
    for (const game of connecting) {
      const contact = contactOf(game, RELEASE)!;
      const at = step(game, contact.at - game.hit!.at);
      const ball = ballAt(at, RELEASE)!;
      expect(distance(ball, contact.point)).toBeLessThan(0.01);
      const axis = barrel(batAt(at, RELEASE), contact.fromHands);
      expect(distance(axis, contact.point)).toBeCloseTo(
        batRadius(contact.fromHands) + BALL_RADIUS,
        6,
      );
      expect(ball.z).toBeLessThan(axis.z);
      expect(clearance(at, ball)).toBeGreaterThan(-0.03);
    }
  });

  it("on a home run, meets it on the barrel's sweet spot, 27 inches from the hands, the whole ball short of the end", () => {
    const homeRuns = connecting.filter((game) => game.hit!.outcome === "home-run");
    expect(homeRuns.length).toBeGreaterThan(5);
    for (const game of homeRuns) {
      const { fromHands } = contactOf(game, RELEASE)!;
      expect(fromHands * 12).toBeCloseTo(27);
      expect((BAT_LENGTH - fromHands - BALL_RADIUS) * 12).toBeGreaterThanOrEqual(2);
    }
  });

  it("on a mis-hit, meets it off the sweet spot: a fly-out toward the end, a foul toward the hands", () => {
    const contactInches = (outcome: string) =>
      connecting
        .filter((game) => game.hit!.outcome === outcome)
        .map((game) => contactOf(game, RELEASE)!.fromHands * 12);
    const flyOuts = contactInches("fly-out");
    const fouls = contactInches("foul");
    expect(flyOuts.length).toBeGreaterThan(5);
    expect(fouls.length).toBeGreaterThan(5);
    for (const at of flyOuts) {
      expect(at).toBeGreaterThanOrEqual(30);
      expect(at).toBeLessThanOrEqual(31);
    }
    for (const at of fouls) {
      expect(at).toBeGreaterThanOrEqual(21);
      expect(at).toBeLessThanOrEqual(23);
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
        if (ball) expect(clearance(game, ball)).toBeGreaterThan(0);
        game = step(game, 0.002);
      }
    }
  });
});

describe("the bat", () => {
  it("is shaped like a bat: a knob, a thin handle, a long barrel and a rounded end", () => {
    const radiusAt = (inches: number) => batRadius(inches / 12) * 12;
    const handle = radiusAt(6);
    expect(handle).toBeLessThan(1.2);
    expect(radiusAt(0.2)).toBeGreaterThan(handle);
    // The barrel: over twice the handle's width, from the sweet spot to near the end.
    for (const at of [22, 27, 31]) expect(radiusAt(at)).toBeGreaterThan(2 * handle);
    // Rounded: narrowing over its last inch, to nothing at the end.
    expect(radiusAt(33.5)).toBeGreaterThan(0);
    expect(radiusAt(33.5)).toBeLessThan(radiusAt(31));
    expect(batRadius(BAT_LENGTH)).toBeCloseTo(0);
    expect(batRadius(BAT_LENGTH + 0.1)).toBe(0);
  });

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

describe("a home run's flight, as its tracer draws it", () => {
  const homeRuns = connecting.filter(
    (game) => game.hit!.outcome === "home-run",
  );
  /** Where along `points` a share `drawn` of the way through them is, counting each step between two points alike. */
  function along(points: Point[], drawn: number): Point {
    const at = drawn * (points.length - 1);
    const i = Math.min(points.length - 2, Math.floor(at));
    const f = at - i;
    const [a, b] = [points[i], points[i + 1]];
    return {
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      z: a.z + (b.z - a.z) * f,
    };
  }

  it("runs from where the bat meets the ball down to the ground where it lands, out past the fence", () => {
    expect(homeRuns.length).toBeGreaterThan(5);
    for (const game of homeRuns) {
      const { points } = homeRunFlight(game, RELEASE)!;
      expect(distance(points[0], contactOf(game, RELEASE)!.point)).toBeLessThan(
        1e-9,
      );
      const landing = points.at(-1)!;
      expect(landing.y).toBeCloseTo(0, 6);
      // Over a 400-foot centre-field fence at least.
      expect(Math.hypot(landing.x, landing.z)).toBeGreaterThan(330);
    }
  });

  it("is drawn as far as the ball has flown, its head on the ball all the way", () => {
    for (const game of homeRuns) {
      const contact = contactOf(game, RELEASE)!;
      expect(homeRunFlight(game, RELEASE)!.drawn).toBe(0);
      for (let t = 0; t <= 2.2; t += 0.1) {
        const at = step(game, contact.at - game.hit!.at + t);
        if (at.phase !== "result") break;
        const { points, drawn } = homeRunFlight(at, RELEASE)!;
        expect(
          distance(along(points, drawn), ballAt(at, RELEASE)!),
        ).toBeLessThan(0.5);
      }
    }
  });

  it("isn't there for a fly-out, a foul or a strike", () => {
    const others = [
      ...connecting.filter((game) => game.hit!.outcome !== "home-run"),
      swungAt(0.5),
    ];
    expect(others.map((game) => game.hit!.outcome)).toEqual(
      expect.arrayContaining(["fly-out", "foul", "strike"]),
    );
    for (const game of others) expect(homeRunFlight(game, RELEASE)).toBeNull();
  });
});
