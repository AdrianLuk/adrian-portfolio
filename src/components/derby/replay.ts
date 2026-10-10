import { smoothstep } from "../world/noise";
import type { FieldShot } from "../world/scene";
import { replayAt, REPLAY_WINDUP, replayLength, SLOW_SPEED, type Play } from "./rules";
import { ballAt, between, contactOf, RELEASE } from "./swing";

/**
 * The Play of the Game's camera, in the field's feet (see ./swing): pure, so
 * its pans are unit tested without WebGL. Two shots, cut as a broadcast
 * replay cuts: low in front of the plate on the first-base side, square to
 * the batter, easing in as the pitch comes and the bat meets it; then high
 * and wide behind the plate, rising as the ball carries, its eye on the
 * ball, the whole flight in frame.
 */

/** The Play of the Game runs in slow motion, at slow mode's speed. */
export const REPLAY_SPEED = SLOW_SPEED;

/** In front of the plate, inside the first-base line: easing in from `from` to `to`. */
const FRONT = { from: { x: 20, y: 4, z: -28 }, to: { x: 14, y: 4.5, z: -21 } };
/** High behind the plate, on its third-base side: rising from `from` to `to`. */
const BEHIND = { from: { x: -25, y: 30, z: 40 }, to: { x: -30, y: 45, z: 55 } };
/** When the camera cuts behind the plate, in seconds of game time after contact: the bat through the ball first. */
const CUT = 0.15;
/** How long the camera takes to rise behind the plate, in seconds of game time from the cut. */
const RISE = 1.6;

const ease = (f: number) => smoothstep(0, 1, f);

/** When the bat meets the ball, in seconds of game time into the Play of the Game, and where. */
function contact(play: Play) {
  const hit = contactOf(replayAt(play, replayLength(play)), RELEASE)!;
  return { at: REPLAY_WINDUP + hit.at, point: hit.point };
}

/** When the camera cuts behind the plate, in seconds of game time into the Play of the Game. */
export const cutAt = (play: Play) => contact(play).at + CUT;

/** The camera `t` seconds of game time into the Play of the Game. */
export function shotAt(play: Play, t: number): FieldShot {
  const meet = contact(play);
  const cut = cutAt(play);
  if (t < cut) {
    return { position: between(FRONT.from, FRONT.to, ease(t / cut)), target: meet.point };
  }
  return {
    position: between(BEHIND.from, BEHIND.to, ease((t - cut) / RISE)),
    target: ballAt(replayAt(play, t), RELEASE) ?? meet.point,
  };
}

/** When the still under reduced motion is taken, in seconds of game time in: the bat on the ball. */
export const stillAt = (play: Play) => contact(play).at;
