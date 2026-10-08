import { smoothstep } from "./noise";
import { fogColor, palette } from "./palette";

/**
 * The court's look, as pure maths (unit tested without WebGL): what changes
 * in the world while the camera stands at the court, Juice Bros' Lit site,
 * and how it blends in. The camera holds still there; only the rally ball
 * moves. Free of the Rally game's code, which never loads with the world.
 */

/** The court a rally plays on: its playing area, its floor and its net. */
export type RallyCourt = {
  /** The court's centre, where the net crosses its centre line. */
  x: number;
  z: number;
  /** The height of the court's floor. */
  level: number;
  /** Half its width (across the valley) and half its length (down it). */
  halfWidth: number;
  halfLength: number;
  /** The net's height at its middle, its tape's top, above the floor. */
  netHeight: number;
};

/**
 * The rally ball: small, beside the Lit site's big ball over the net; a shot
 * every `shot` seconds, struck at `hit` above the floor and rising `rise`
 * over it at the top of its arc.
 */
export const RALLY_BALL = { radius: 0.6, shot: 2.4, hit: 1.6, rise: 4.2 };

/**
 * Where each shot is struck: how deep (a share of the half court, from the
 * net) and how far across (a share of the half width, from the centre line).
 * Five shots, so the pattern and the side it's struck from line up only
 * every ten.
 */
const DEPTH = [0.78, 0.62, 0.86, 0.7, 0.56];
const ACROSS = [-0.35, 0.4, 0.1, -0.55, 0.5];

const wrap = (i: number, n: number) => ((i % n) + n) % n;

/** Where the k-th shot is struck from: the ends alternate across the net. */
function strike(court: RallyCourt, k: number) {
  const side = wrap(k, 2) === 0 ? 1 : -1;
  return {
    x: court.x + ACROSS[wrap(k, ACROSS.length)] * court.halfWidth,
    z: court.z + side * DEPTH[wrap(k, DEPTH.length)] * court.halfLength,
  };
}

/**
 * The rally ball at `time` (the world's clock, in seconds): a slow rally
 * across the net, each shot an arc from where it's struck to where the next
 * one is, so the ball never jumps.
 */
export function rallyBall(court: RallyCourt, time: number) {
  const { shot, hit, rise } = RALLY_BALL;
  const k = Math.floor(time / shot);
  const f = time / shot - k;
  const from = strike(court, k);
  const to = strike(court, k + 1);
  return {
    x: from.x + (to.x - from.x) * f,
    y: court.level + hit + 4 * rise * f * (1 - f),
    z: from.z + (to.z - from.z) * f,
  };
}

/**
 * The court's look at full: its floodlights burn this many times their
 * usual brightness, and the fog takes this share of the court's violet.
 */
const FULL = { floodlights: 2.6, fog: 0.28 };

/**
 * The court's look for the Camera director's blend (0 away from the court,
 * 1 at it): how bright the floodlights burn (a multiple of their usual), how
 * much of the court's violet the fog takes, how far in the rally ball is (it
 * grows in as the camera nears), and how much of the falling weather shows
 * (gone before the camera lands: at the court, the weather is on the ground).
 */
export function courtLook(blend: number) {
  return {
    floodlights: 1 + (FULL.floodlights - 1) * smoothstep(0, 1, blend),
    fog: FULL.fog * smoothstep(0, 1, blend),
    ball: smoothstep(0.5, 1, blend),
    falling: 1 - smoothstep(0, 0.9, blend),
  };
}

/**
 * Tints the world's shared fog (every shader's and the scene's) toward the
 * court's violet by `amount`, from the night's own; the palette's fog, which
 * the sky's horizon and the hills also take, stays as it is.
 */
export function tintFog(amount: number) {
  fogColor.copy(palette.fog).lerp(palette.violet, amount);
}
