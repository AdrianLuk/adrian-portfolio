import { ridgedNoise, smoothstep, valueNoise } from "./noise";

/**
 * The valley the hero looks down. The camera stands near z = 0 looking along
 * -z; the name plate stands 90 ahead. Up to PLATE_ZONE the valley runs straight
 * and level so the plate can stand anywhere across the screen; beyond it the
 * valley narrows and winds, which the flight banks through.
 */

const PLATE_ZONE = 170;

/** Lateral offset of the valley floor's centre line at depth z. */
export function valleyCentre(z: number) {
  const d = Math.max(0, -z - PLATE_ZONE);
  const ramp = smoothstep(0, 180, d);
  return ramp * (42 * Math.sin(d * 0.0085) + 15 * Math.sin(d * 0.021 + 1.3));
}

/** Half the width of the level floor at depth z. */
export function corridorHalfWidth(z: number) {
  return 88 - 52 * smoothstep(PLATE_ZONE, 480, -z);
}

/** Terrain height at (x, z). The floor sits near 0; ridges climb to ~60. */
export function valleyHeight(x: number, z: number) {
  const dx = Math.abs(x - valleyCentre(z));
  const w = corridorHalfWidth(z);

  const floor = 0.35 * (valueNoise(x * 0.05, z * 0.05) * 2 - 1);
  const wallRise = smoothstep(w, w + 70, dx);
  const ridges = 28 + 34 * ridgedNoise(x * 0.011 + 7.1, z * 0.011 - 3.4);
  // Far ranges keep climbing past the valley's walls.
  const ranges = 0.18 * Math.max(0, dx - w - 70);

  return floor + wallRise * wallRise * ridges + ranges;
}
