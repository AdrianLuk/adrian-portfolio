import { Vector3 } from "three";
import { palette } from "../world/palette";
import { ARENA, arenaAxes, onOval, STAGE, STRETCH, tierEdge, tierTop, TIERS_SPAN } from "../world/arena";
import { DIAMOND_AT, diamondFootprint, layoutDiamond } from "../world/diamond";
import { layoutHongKong } from "../world/hong-kong";
import { seededRandom } from "../world/noise";
import {
  arenaReach,
  groundUnder,
  surfaceHeight,
  valleyCentre,
  VICTORIA_HARBOUR,
  waterAt,
} from "../world/terrain";
import type { Spot } from "./rules";

/** A spot where a bot can pop up, and where it stands in the world. */
export type PlacedSpot = Spot & { position: Vector3 };

/** Whether nothing of the world stands between `from` and `to`, short of `margin` before it. */
export type Sees = (from: Vector3, to: Vector3, margin?: number) => boolean;

/**
 * How far over its feet the visitor's sight of a bot is checked (about its
 * chest, drawn 1.6 times life size), and how close to it the sight may meet
 * the world: its own spot's edge, say.
 */
const CHEST = 2.5;
const SIGHT_MARGIN = 3;

/** No two spots closer than this, so two bots never stand in each other. */
const APART = 14;

/**
 * The rim: the top tier's front edge, `count` places round the horseshoe,
 * no nearer the visitor than `near` and no further than `far`; `most` of
 * them used.
 */
const RIM = { count: 11, near: 14, far: 95, most: 4 };

/**
 * The shore: dry land round the Arena, below the visitor's eye by `below`,
 * `near` to `far` away, sampled every `every` (jittered), clear of the
 * Arena; `most` of them used.
 */
const SHORE = { near: 24, far: 95, every: 8, below: 6, most: 8 };

/**
 * The lit pads on Victoria Harbour, the Shootout's own: `count` of them on open water,
 * `near` to `far` from the stage's front and out ahead of it, spread as far
 * apart as they go, the first `first` ahead of the stage.
 */
const PADS = { count: 5, near: 28, far: 120, first: 50, every: 3 };

/**
 * Each of Hong Kong's Landmarks' flat roof, over its foot, under any crown,
 * spire or mast; a bot stands `edge` in from its edge nearest the visitor.
 */
const ROOFS: Record<string, number> = {
  "Central Plaza": 50.3,
  "Bank of China Tower": 54.7,
  "IFC 2": 64.35,
  "The Center": 50.7,
  ICC: 84,
};
const ROOF_EDGE = 2.5;

/** The pads on Victoria Harbour, in front of the Arena's stage, numbered left to right as seen from it. */
export function harbourPads(): Vector3[] {
  const arena = arenaAxes();
  const front = -ARENA.floor * STRETCH + STAGE.front;
  const [px, pz] = arena.toWorld(0, front);
  const [ax, az] = arena.facing(0, -1);
  const wet: Vector3[] = [];
  for (let x = px - 160; x <= px + 40; x += PADS.every) {
    for (let z = pz - 120; z <= pz + 80; z += PADS.every) {
      const d = Math.hypot(x - px, z - pz);
      const ahead = ((x - px) * ax + (z - pz) * az) / d;
      if (waterAt(x, z) > 0.98 && d > PADS.near && d < PADS.far && ahead > 0.2) {
        wet.push(new Vector3(x, VICTORIA_HARBOUR.level, z));
      }
    }
  }
  const first = new Vector3(px + ax * PADS.first, VICTORIA_HARBOUR.level, pz + az * PADS.first);
  const nearest = (to: Vector3) => wet.reduce((a, b) => (a.distanceTo(to) <= b.distanceTo(to) ? a : b));
  const pads = [nearest(first)];
  const gap = (p: Vector3) => Math.min(...pads.map((q) => q.distanceTo(p)));
  while (pads.length < PADS.count) pads.push(wet.reduce((a, b) => (gap(a) >= gap(b) ? a : b)));
  // Left to right, facing Hong Kong from the stage: left is (az, -ax) in plan.
  const left = (p: Vector3) => (p.x - px) * az - (p.z - pz) * ax;
  return pads.sort((a, b) => left(b) - left(a));
}

/** The Diamond's light towers' lamp banks, where a bot stands on top. */
function lightTowers(): Vector3[] {
  const { scale, z } = DIAMOND_AT;
  const x = valleyCentre(z) + DIAMOND_AT.fromCentreLine;
  const foot = diamondFootprint(scale);
  const level = groundUnder(x, z, foot.w, foot.d).high + 0.3;
  const side = Math.sign(DIAMOND_AT.fromCentreLine) as 1 | -1;
  const { stands } = layoutDiamond({ x, z, side, level, scale, color: palette.cyan });
  return stands.lamps.map((lamp) => new Vector3(lamp.x, lamp.y + lamp.h / 2, lamp.z));
}

/**
 * Every spot a bot can pop up on that the visitor, at `eye`, can see (by
 * `sees`): the Arena's rim, the shore, the harbour's pads, Hong Kong's
 * Landmarks' roofs and the Diamond's light towers.
 */
export function shootoutSpots(eye: Vector3, sees: Sees): PlacedSpot[] {
  const spots: PlacedSpot[] = [];
  const seen = (position: Vector3) =>
    sees(eye, position.clone().setY(position.y + CHEST), SIGHT_MARGIN);
  const add = (kind: Spot["kind"], position: Vector3) =>
    spots.push({ kind, position, distance: position.distanceTo(eye) });
  const clear = (p: Vector3) => spots.every((s) => s.position.distanceTo(p) >= APART);
  const flat = (p: Vector3) => Math.hypot(p.x - eye.x, p.z - eye.z);

  // The rim: the top tier's front edge, round the horseshoe.
  const arena = arenaAxes();
  const top = ARENA.tiers - 1;
  const rim: Vector3[] = [];
  for (let i = 0; i < RIM.count; i++) {
    const a = TIERS_SPAN.from + ((TIERS_SPAN.to - TIERS_SPAN.from) * (i + 0.5)) / RIM.count;
    const [x, z] = arena.toWorld(...onOval(a, tierEdge(top) + 0.6));
    const p = new Vector3(x, arena.level + tierTop(top), z);
    if (flat(p) > RIM.near && flat(p) < RIM.far && seen(p)) rim.push(p);
  }
  // Spread round it: every other one, as far as there are.
  const step = Math.max(1, Math.floor(rim.length / RIM.most));
  for (let i = 0; i < rim.length && spots.length < RIM.most; i += step) add("rim", rim[i]);

  // The shore: dry land round the Arena, below the eye, sampled at random.
  const random = seededRandom(0x5407);
  const land: Vector3[] = [];
  for (let dx = -SHORE.far; dx <= SHORE.far; dx += SHORE.every) {
    for (let dz = -SHORE.far; dz <= SHORE.far; dz += SHORE.every) {
      const x = eye.x + dx + (random() - 0.5) * 4;
      const z = eye.z + dz + (random() - 0.5) * 4;
      const p = new Vector3(x, surfaceHeight(x, z), z);
      const d = flat(p);
      if (d < SHORE.near || d > SHORE.far || waterAt(x, z) > 0) continue;
      if (p.y <= 0 || p.y > eye.y - SHORE.below || arenaReach(x, z).out < 1.15) continue;
      land.push(p);
    }
  }
  let shore = 0;
  for (const p of land.sort(() => random() - 0.5)) {
    if (shore >= SHORE.most) break;
    if (!clear(p) || !seen(p)) continue;
    add("shore", p);
    shore++;
  }

  for (const pad of harbourPads()) if (seen(pad)) add("pad", pad);

  // Hong Kong's Landmarks' roofs, a bot at the edge nearest the visitor.
  for (const landmark of layoutHongKong().landmarks) {
    const over = ROOFS[landmark.name];
    if (over === undefined) continue;
    const p = new Vector3(landmark.x, landmark.foot + over, landmark.z);
    const toward = new Vector3(eye.x - p.x, 0, eye.z - p.z).setLength(ROOF_EDGE);
    p.add(toward);
    if (seen(p)) add("roof", p);
  }

  for (const tower of lightTowers()) if (seen(tower)) add("tower", tower);
  return spots;
}
