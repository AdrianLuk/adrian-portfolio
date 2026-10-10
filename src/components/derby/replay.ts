import { smoothstep } from "../world/noise";
import { replayAt, REPLAY_WINDUP, replayLength, SLOW_SPEED, type Play } from "./rules";
import { between, contactOf, RELEASE, type Point } from "./swing";

/**
 * The Play of the Game's own camera, in the field's feet (see ./swing):
 * pure, so its move is unit tested without WebGL. Low in front of the
 * plate on the first-base side, square to the batter, it eases in as the
 * pitch comes, until the bat meets the ball; from there the home run's own
 * wide shot, its tracer drawn along the flight (see ./scene), takes over,
 * cut as a broadcast replay cuts.
 */

/** A camera on the Diamond: where it stands, and the point it looks at. */
export type Shot = { position: Point; target: Point };

/** The Play of the Game runs in slow motion, at slow mode's speed. */
export const REPLAY_SPEED = SLOW_SPEED;

/** In front of the plate, inside the first-base line: easing in from `from` to `to`. */
const FRONT = { from: { x: 20, y: 4, z: -28 }, to: { x: 14, y: 4.5, z: -21 } };

/** When the bat meets the ball, in seconds of game time into the Play of the Game, and where. */
function contact(play: Play) {
  const hit = contactOf(replayAt(play, replayLength(play)), RELEASE)!;
  return { at: REPLAY_WINDUP + hit.at, point: hit.point };
}

/** When the bat meets the ball, in seconds of game time into the Play of the Game: the cut to the wide shot. */
export const contactAt = (play: Play) => contact(play).at;

/**
 * The camera `t` seconds of game time into the Play of the Game; null once
 * the bat has met the ball, when the home run's wide shot has it.
 */
export function shotAt(play: Play, t: number): Shot | null {
  const meet = contact(play);
  if (t >= meet.at) return null;
  return {
    position: between(FRONT.from, FRONT.to, smoothstep(0, meet.at, t)),
    target: meet.point,
  };
}

/** When the still under reduced motion is taken, in seconds of game time in: the bat on the ball, before the cut. */
export const stillAt = (play: Play) => contactAt(play) - 1e-3;
