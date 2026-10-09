import { ridgedNoise, smoothstep, valueNoise } from "./noise";

/** Where the plate stands (it must match CAMERA.plateDepth in pose.ts). */
const PLATE_LINE = -90;

/**
 * The valley the hero looks down. The camera stands near z = 0 looking along
 * -z; the name plate stands 90 ahead. Up to PLATE_ZONE the valley runs straight
 * and level so the plate can stand anywhere across the screen; beyond it the
 * valley narrows and winds into the distance.
 *
 * Behind the camera (+z, never seen once settled) lies the canyon the opening
 * flight comes down: narrow and winding, opening out into the plate's valley
 * past FLIGHT_ZONE.
 */

const PLATE_ZONE = 170;
const FLIGHT_ZONE = 120;

/** The world's edge behind the camera: the far end of the flight's canyon. */
export const WORLD_BACK = 700;

/**
 * The world's far edge, down the valley: far enough past the Outpost that the
 * route's last view fades into fog before it ends.
 */
export const WORLD_FRONT = -1700;

/** Lateral offset of the valley floor's centre line at depth z. */
export function valleyCentre(z: number) {
  if (z > FLIGHT_ZONE) {
    // Off to the left of the plate's line, so the flight sees the plate at
    // an angle and runs straight into the turn-in, with one gentle S-bend.
    const d = z - FLIGHT_ZONE;
    return -80 * smoothstep(0, 50, d) + 10 * Math.sin(d * 0.025);
  }
  const d = Math.max(0, -z - PLATE_ZONE);
  const ramp = smoothstep(0, 180, d);
  return ramp * (42 * Math.sin(d * 0.0085) + 15 * Math.sin(d * 0.021 + 1.3));
}

/** Half the width of the level floor at depth z. */
export function corridorHalfWidth(z: number) {
  if (z > 0) return 88 - 50 * smoothstep(FLIGHT_ZONE, 330, z);
  return 88 - 52 * smoothstep(PLATE_ZONE, 480, -z);
}

/**
 * The harbour: water on the valley's floor in front of downtown, as Lake
 * Ontario's is in front of Toronto's, where the valley opens out on its left
 * side into a bay, so the Skyline's camera can stand back on the far shore
 * and look across the water at the city. It runs down the valley from `near`
 * to `far`, from downtown's shore (`shore` right of the centre line) across
 * to a beach `beach` short of the bay's wall, which stands `bay` further out
 * than the floor's usual edge at its widest. Its surface lies at `level`,
 * below the lowest the floor dips anywhere else, over a basin at `basin`.
 */
export const HARBOUR = {
  near: -440,
  far: -575,
  shore: 26,
  beach: 10,
  bay: 150,
  level: -1.5,
  basin: -4,
} as const;

/** How far along the harbour depth z lies, 0 at its mouth to 1 at its end. */
const alongHarbour = (z: number) =>
  (z - HARBOUR.near) / (HARBOUR.far - HARBOUR.near);

/**
 * How much further the floor reaches on the valley's left side at depth z
 * than `corridorHalfWidth` says: the bay, widest midway down the harbour and
 * closing to nothing at either end.
 */
export function bayWidth(z: number) {
  const t = alongHarbour(z);
  return t <= 0 || t >= 1 ? 0 : HARBOUR.bay * Math.sin(Math.PI * t) ** 0.6;
}

/**
 * How much of the harbour's water stands at (x, z), 0 to 1: full over the
 * basin, easing out over the last few units to each shore and at either end.
 */
export function harbourWater(x: number, z: number) {
  const t = alongHarbour(z);
  if (t <= 0 || t >= 1) return 0;
  const off = x - valleyCentre(z);
  const left = -(corridorHalfWidth(z) + bayWidth(z) - HARBOUR.beach);
  return (
    smoothstep(left, left + 8, off) *
    (1 - smoothstep(HARBOUR.shore - 8, HARBOUR.shore, off)) *
    smoothstep(0, 0.08, t) *
    (1 - smoothstep(0.92, 1, t))
  );
}

/**
 * The ground's height at (x, z), or the harbour's surface where its water
 * stands: what a camera above it stands over.
 */
export function surfaceHeight(x: number, z: number) {
  return harbourWater(x, z) > 0
    ? Math.max(valleyHeight(x, z), HARBOUR.level)
    : valleyHeight(x, z);
}

/**
 * True if (x, z) lies on the valley's floor (the bay included), clear of its
 * walls: where the camera may fly.
 */
export function onFloor(x: number, z: number) {
  const off = x - valleyCentre(z);
  const w = corridorHalfWidth(z);
  return off >= 0 ? off < w : -off < w + bayWidth(z);
}

/** Terrain height at (x, z). The floor sits near 0; ridges climb to ~60. */
export function valleyHeight(x: number, z: number) {
  const off = x - valleyCentre(z);
  const dx = Math.abs(off);
  // On the left, the bay opens the floor out.
  const w = corridorHalfWidth(z) + (off < 0 ? bayWidth(z) : 0);

  // Broad swells on the floor, so the moon picks out facets, flattened along
  // the line where the plate stands so its baseline meets the ground.
  const swell = 0.35 + 0.85 * smoothstep(12, 30, Math.abs(z - PLATE_LINE));
  const floor =
    swell * (valueNoise(x * 0.02 + 3.7, z * 0.02) * 2 - 1) +
    0.2 * (valueNoise(x * 0.07, z * 0.07) * 2 - 1);
  const wallRise = smoothstep(w, w + 70, dx);
  const ridges = 28 + 34 * ridgedNoise(x * 0.011 + 7.1, z * 0.011 - 3.4);
  // Far ranges keep climbing past the valley's walls.
  const ranges = 0.18 * Math.max(0, dx - w - 70);
  const ground = floor + wallRise * wallRise * ridges + ranges;

  // The harbour's basin, under its water.
  const water = harbourWater(x, z);
  return water > 0 ? ground + (HARBOUR.basin - ground) * water : ground;
}
