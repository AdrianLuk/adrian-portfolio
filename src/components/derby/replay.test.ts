import { describe, expect, it } from "vitest";
import { contactAt, REPLAY_SPEED, shotAt, stillAt } from "./replay";
import { createGame, PITCH_TIME, playOfTheGame, replayLength, startGame, step, type Play } from "./rules";
import type { Point } from "./swing";

/** A home run swung `error` seconds off the first pitch's arrival, in the game seeded `seed`. */
function homeRun(error: number, seed: number): Play {
  let game = startGame(createGame({ seed }));
  while (game.phase !== "pitch") game = step(game, 1 / 60);
  game = step(game, PITCH_TIME[game.pitch] + error - game.clock, { swing: true });
  return playOfTheGame(game)!;
}

/** Pulled, square and pushed, off each kind of pitch: a curveball, a changeup and a fastball first. */
const plays = [-0.045, -0.02, 0, 0.02, 0.045].flatMap((error) =>
  [1, 2, 7].map((seed) => homeRun(error, seed)),
);

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (v: Point) => Math.hypot(v.x, v.y, v.z);

describe("the Play of the Game's camera", () => {
  it("covers every pitch kind", () => {
    expect(new Set(plays.map((p) => p.pitch)).size).toBe(3);
  });

  it("eases in front of the plate, on the bat's meeting point, without a jump", () => {
    const dt = 1 / 240;
    for (const play of plays) {
      let last = shotAt(play, 0)!;
      for (let t = dt; t < contactAt(play); t += dt) {
        const shot = shotAt(play, t)!;
        expect(shot.position.z).toBeLessThan(-10);
        expect(shot.target).toEqual(last.target);
        expect(length(sub(shot.position, last.position)) / (dt / REPLAY_SPEED)).toBeLessThan(10);
        last = shot;
      }
    }
  });

  it("hands over to the home run's wide shot as the bat meets the ball, to the end", () => {
    for (const play of plays) {
      expect(shotAt(play, contactAt(play))).toBeNull();
      expect(shotAt(play, replayLength(play))).toBeNull();
    }
  });

  it("takes its still in front of the plate, the bat on the ball", () => {
    for (const play of plays) {
      expect(contactAt(play) - stillAt(play)).toBeLessThan(0.01);
      expect(shotAt(play, stillAt(play))).not.toBeNull();
    }
  });
});
