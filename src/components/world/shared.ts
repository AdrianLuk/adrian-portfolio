import type { IUniform } from "three";

/** Uniforms every material in the world reads, updated once per frame. */
export type SharedUniforms = {
  uTime: IUniform<number>;
  uPixelRatio: IUniform<number>;
  /**
   * The traffic's clock, in seconds: what streetcars, planes and ferries
   * read for their time, on the GPU or (as `.value`) the CPU. Never their
   * own animation frame.
   */
  uTraffic: IUniform<number>;
};

/** The moment the still frame shows: beams crossed, motes mid-rise. */
export const STILL_TIME = 11.5;

/**
 * The traffic's time: the world's, where it moves on a GPU; else held at the
 * still frame's, so the traffic stands as scenery. In software the world's
 * clock still runs on home and the About page (the motes drift), so the
 * traffic holds there too.
 */
export function trafficTime(
  time: number,
  { motion, software }: { motion: boolean; software: boolean },
) {
  return motion && !software ? time : STILL_TIME;
}
