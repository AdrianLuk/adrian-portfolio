import { describe, expect, it } from "vitest";
import { cutAt, REPLAY_SPEED, shotAt, stillAt } from "./replay";
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

  it("pans at a medium speed, under 150° a second as it's watched, and never jumps but at its one cut", () => {
    const dt = 1 / 240;
    for (const play of plays) {
      let last = shotAt(play, 0);
      for (let t = dt; t <= replayLength(play); t += dt) {
        const shot = shotAt(play, t);
        if (t >= cutAt(play) && t - dt < cutAt(play)) {
          last = shot;
          continue;
        }
        const a = sub(last.target, last.position);
        const b = sub(shot.target, shot.position);
        const cos = (a.x * b.x + a.y * b.y + a.z * b.z) / (length(a) * length(b));
        const degrees = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
        expect(degrees / (dt / REPLAY_SPEED)).toBeLessThan(150);
        expect(length(sub(shot.position, last.position)) / (dt / REPLAY_SPEED)).toBeLessThan(40);
        last = shot;
      }
    }
  });

  it("cuts from in front of the plate, once the bat is through the ball, to behind it, ending with its eye on the ball out over the fence", () => {
    for (const play of plays) {
      expect(shotAt(play, cutAt(play) - 0.01).position.z).toBeLessThan(-10);
      const { position, target } = shotAt(play, replayLength(play));
      expect(position.z).toBeGreaterThan(10);
      expect(target.z).toBeLessThan(-350);
    }
  });

  it("takes its still in front of the plate, the bat on the ball", () => {
    for (const play of plays) {
      expect(stillAt(play)).toBeLessThan(cutAt(play));
      expect(shotAt(play, stillAt(play)).position.z).toBeLessThan(-10);
    }
  });
});
