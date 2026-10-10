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
 * The world's far edge, down the valley: far enough past Hong Kong and Victoria
 * Peak that the route's last view fades into fog before it ends.
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
 * A harbour: water on the valley's floor, running down the valley from
 * `near` to `far`, from a shore `shore` right of the centre line across to a
 * beach `beach` short of the floor's left edge. With a `bay` the valley opens
 * out on its left side, that much further than the floor's usual edge at its
 * widest. Its surface lies at `level`, below the lowest the floor dips
 * anywhere else, over a basin at `basin`.
 */
export type Harbour = {
  readonly near: number;
  readonly far: number;
  readonly shore: number;
  readonly beach: number;
  readonly bay: number;
  readonly level: number;
  readonly basin: number;
};

/**
 * The Harbour: Toronto's water, in front of downtown, as Lake Ontario's is
 * in front of the city, where the valley opens out on its left side into a
 * bay, so the Skyline's camera can stand back on the far shore and look
 * across the water at the city.
 */
export const HARBOUR: Harbour = {
  near: -440,
  far: -575,
  shore: 26,
  beach: 10,
  bay: 150,
  level: -1.5,
  basin: -4,
};

/**
 * Victoria Harbour: Hong Kong's water, from just past the route's last stop
 * (Tsim Sha Tsui's shore) across the valley's whole floor to the Island's
 * front row, opening out on the left into a small bay, so on a wide screen
 * the closing view's copy, on the left, stands over water too.
 */
export const VICTORIA_HARBOUR: Harbour = {
  near: -1058,
  far: -1182,
  shore: 32,
  beach: 4,
  bay: 70,
  level: -1.5,
  basin: -4,
};

/** The world's two harbours, down the valley. */
export const HARBOURS: readonly Harbour[] = [HARBOUR, VICTORIA_HARBOUR];

/** How far along `harbour` depth z lies, 0 at its mouth to 1 at its end. */
const alongHarbour = (z: number, harbour: Harbour) =>
  (z - harbour.near) / (harbour.far - harbour.near);

/** The harbour whose stretch of the valley takes in depth z, if any. */
const harbourAt = (z: number) =>
  HARBOURS.find((h) => z <= h.near && z >= h.far);

/**
 * How much further the floor reaches on the valley's left side at depth z
 * than `corridorHalfWidth` says, for `harbour`'s bay: widest midway down the
 * harbour and closing to nothing at either end.
 */
export function bayWidth(z: number, harbour: Harbour) {
  const t = alongHarbour(z, harbour);
  return t <= 0 || t >= 1 ? 0 : harbour.bay * Math.sin(Math.PI * t) ** 0.6;
}

/**
 * How much of `harbour`'s water stands at (x, z), 0 to 1: full over the
 * basin, easing out over the last few units to each shore and at either end.
 */
export function harbourWater(x: number, z: number, harbour: Harbour) {
  const t = alongHarbour(z, harbour);
  if (t <= 0 || t >= 1) return 0;
  const off = x - valleyCentre(z);
  const left = -(corridorHalfWidth(z) + bayWidth(z, harbour) - harbour.beach);
  return (
    smoothstep(left, left + 8, off) *
    (1 - smoothstep(harbour.shore - 8, harbour.shore, off)) *
    smoothstep(0, 0.08, t) *
    (1 - smoothstep(0.92, 1, t))
  );
}

/** How much of either harbour's water stands at (x, z), 0 to 1. */
export function waterAt(x: number, z: number) {
  const harbour = harbourAt(z);
  return harbour ? harbourWater(x, z, harbour) : 0;
}

/**
 * The ground's height at (x, z), or a harbour's surface where its water
 * stands: what a camera above it stands over.
 */
export function surfaceHeight(x: number, z: number) {
  const harbour = harbourAt(z);
  return harbour && harbourWater(x, z, harbour) > 0
    ? Math.max(valleyHeight(x, z), harbour.level)
    : valleyHeight(x, z);
}

/**
 * True if (x, z) lies on the valley's floor (a bay included), clear of its
 * walls: where the camera may fly.
 */
export function onFloor(x: number, z: number) {
  const off = x - valleyCentre(z);
  const w = corridorHalfWidth(z);
  const harbour = harbourAt(z);
  return off >= 0 ? off < w : -off < w + (harbour ? bayWidth(z, harbour) : 0);
}

/**
 * Victoria Peak: a ridge across the valley's far end, behind Hong Kong, from
 * its foot (`foot`, down the valley) up to its crest (`crest`), `height`
 * above the floor and higher to the right, where the Peak itself stands.
 */
const PEAK = { foot: -1310, crest: -1405, height: 52, rightRise: 16 };

/** How far Victoria Peak lifts the ground at (x, z), given its offset `off`. */
function peakRise(x: number, z: number, off: number) {
  const rise = smoothstep(-PEAK.foot, -PEAK.crest, -z);
  if (rise === 0) return 0;
  const line =
    PEAK.height +
    PEAK.rightRise * smoothstep(-40, 60, off) +
    10 * (ridgedNoise(x * 0.035 + 2.3, 4.1) - 0.5);
  return rise * line;
}

/**
 * Where the Arena stands (./arena), seated in the valley's right wall beside
 * Victoria Harbour: its middle `fromCentreLine` right of the valley's line
 * at depth `z`, its floor at height `level`, its long axis aimed at Hong
 * Kong's middle, and its footprint an oval `wide` across and `long` down
 * that axis, either side of its middle (the horseshoe's outer tiers).
 */
export const ARENA_SITE = {
  z: -1137,
  fromCentreLine: 87.5,
  level: 20,
  wide: 47.3,
  long: 63.9,
} as const;

/** The Arena's middle, and its axis: the way to Hong Kong's middle (./hong-kong), as a unit vector. */
const ARENA_FRAME = (() => {
  const x = valleyCentre(ARENA_SITE.z) + ARENA_SITE.fromCentreLine;
  const toX = valleyCentre(-1230) - x;
  const toZ = -1230 - ARENA_SITE.z;
  const length = Math.hypot(toX, toZ);
  return { x, z: ARENA_SITE.z, ax: toX / length, az: toZ / length };
})();
export const arenaFrame = () => ARENA_FRAME;

/**
 * How far out (x, z) lies from the Arena's middle, 1 on its footprint's edge
 * (`out`), and how far along its axis, -1 at its open end toward Hong Kong
 * and 1 at its closed curve (`along`).
 */
export function arenaReach(x: number, z: number) {
  const { x: cx, z: cz, ax, az } = arenaFrame();
  const toward = (x - cx) * ax + (z - cz) * az;
  const across = -(x - cx) * az + (z - cz) * ax;
  const along = -toward / ARENA_SITE.long;
  return { out: Math.hypot(across / ARENA_SITE.wide, along), along };
}

/**
 * The ground as the Arena leaves it, given the ground before: its seat cut
 * level just under its floor inside its footprint; and from its middle to
 * past its open end, under the overhang and out toward Hong Kong, the slope
 * cleared down to near the shore's level, so its braces stand clear, the
 * wall taking over again well clear of it. Nothing it doesn't reach moves.
 */
export function arenaGround(x: number, z: number, ground: number) {
  const { out, along } = arenaReach(x, z);
  if (out > 2.6) return ground;
  let h = ground;
  const front = smoothstep(0.5, -0.05, along);
  // Never below the floor's usual dips: the harbour's water stands lower than those.
  const cap = 4 - 3 * smoothstep(0.4, 1.2, out) + 80 * smoothstep(1.6, 2.6, out);
  if (front > 0 && h > cap) h += (cap - h) * front;
  const { level } = ARENA_SITE;
  if (h <= level) return h;
  const cut = level - 0.5;
  return cut + (h - cut) * smoothstep(1, 1.05, out);
}

/** Terrain height at (x, z). The floor sits near 0; ridges climb to ~60. */
export function valleyHeight(x: number, z: number) {
  return terrainHeight(x, z, true);
}

/** Terrain height at (x, z) before the Arena's seat was cut: what it moved, for its tests. */
export function heightBeforeArena(x: number, z: number) {
  return terrainHeight(x, z, true, false);
}

/** The lowest and highest ground under a w by d footprint centred on (x, z). */
export function groundUnder(x: number, z: number, w: number, d: number) {
  const heights = [];
  for (const u of [-0.5, 0, 0.5]) {
    for (const v of [-0.5, 0, 0.5]) {
      heights.push(valleyHeight(x + u * w, z + v * d));
    }
  }
  return { low: Math.min(...heights), high: Math.max(...heights) };
}

type Point = { x: number; y: number; z: number };

/**
 * Where a line of sight from `from` along the unit `dir` first meets the
 * ground (or a harbour's surface), and how far away, within `far` units;
 * null if it never does (it looks at the sky). Marched in steps short of a facet, then narrowed down: far cheaper than
 * raycasting the terrain's triangles.
 */
export function groundHit(from: Point, dir: Point, far = 1500) {
  const below = (t: number) =>
    from.y + dir.y * t <= surfaceHeight(from.x + dir.x * t, from.z + dir.z * t);
  const STEP = 2;
  for (let t = STEP; t <= far; t += STEP) {
    if (!below(t)) continue;
    let [near, past] = [t - STEP, t];
    for (let i = 0; i < 10; i++) {
      const mid = (near + past) / 2;
      if (below(mid)) past = mid;
      else near = mid;
    }
    return { x: from.x + dir.x * past, z: from.z + dir.z * past, distance: past };
  }
  return null;
}

/**
 * Terrain height at (x, z) as the valley stands short of Hong Kong: without
 * Victoria Harbour or Victoria Peak, both lost in fog past the hero's sight.
 * The ridge the city is kept under is measured on it (./structures), so
 * Hong Kong's end of the valley moves nothing in the city.
 */
export function heightShortOfHongKong(x: number, z: number) {
  return terrainHeight(x, z, false);
}

function terrainHeight(
  x: number,
  z: number,
  hongKong: boolean,
  arena = hongKong,
) {
  const off = x - valleyCentre(z);
  const dx = Math.abs(off);
  const at = harbourAt(z);
  const harbour = hongKong || at !== VICTORIA_HARBOUR ? at : undefined;
  // On the left, a bay opens the floor out.
  const w =
    corridorHalfWidth(z) + (off < 0 && harbour ? bayWidth(z, harbour) : 0);

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
  const walls = wallRise * wallRise * ridges + ranges;
  const raw = floor + (hongKong ? Math.max(walls, peakRise(x, z, off)) : walls);
  const ground = arena ? arenaGround(x, z, raw) : raw;

  // A harbour's basin, under its water.
  const water = harbour ? harbourWater(x, z, harbour) : 0;
  return water > 0 ? ground + (harbour!.basin - ground) * water : ground;
}
