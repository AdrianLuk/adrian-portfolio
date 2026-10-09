import { smoothstep } from "./noise";

/**
 * The Skyline's look, as pure maths (unit tested without WebGL): what changes
 * in the world while the camera stands at the Skyline, where the Resume page
 * stands, and how it blends in. The camera holds still there.
 */

/** The share of the palette's magenta the fog takes at full. */
const FULL_FOG = 0.24;

/**
 * The Skyline's look for the Camera director's blend (0 away from the
 * Skyline, 1 at it): how much of the CN Tower's wash has turned magenta, how
 * much of the palette's magenta the fog takes, and how much of the falling
 * weather shows (gone before the camera lands: at the Skyline, as at the
 * court, the weather is on the ground).
 */
export function skylineLook(blend: number) {
  const k = smoothstep(0, 1, blend);
  return {
    wash: k,
    fog: FULL_FOG * k,
    falling: 1 - smoothstep(0, 0.9, blend),
  };
}
