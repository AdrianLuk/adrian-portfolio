import type { Color } from "three";
import type { Glow } from "./glow-points";
import type { Pool } from "./ground-pools";
import type { Reflected } from "./harbour";
import { seededRandom } from "./noise";
import { palette } from "./palette";
import type { Box, Outline, Ring, Solid, Stroke } from "./skyline";
import { valleyCentre, valleyHeight } from "./terrain";

/**
 * Hong Kong, at the far end of home's world where the scroll route ends, as
 * pure data (unit tested without WebGL): the Island's skyline seen from Tsim
 * Sha Tsui across Victoria Harbour, as home's closing view. Its landmarks,
 * left to right: Central Plaza's pyramid and mast, the Bank of China Tower's
 * stacked prisms with its X-braced lattice in lines of light, IFC 2's
 * stepped crown and The Center's ringed crown, with ICC, the tallest, at the
 * back among them (being in the frame beats being true to the map), and a
 * few towers round them so it reads as a city; Victoria Peak's ridge behind
 * (./terrain) carries a scatter of lights. Scaled like a postcard, as
 * Toronto is (the CN Tower's 553 m is 96 units, so about 5.8 m a unit), and
 * built from light: the world's cyan, with Hong Kong's neon red at its
 * landmarks' tips.
 */

/** Where the route's last stop stands: Tsim Sha Tsui's shore, on the valley's centre line. */
export const HONG_KONG_SHORE = { x: valleyCentre(-1050), z: -1050 } as const;

/** The middle of Hong Kong, on the valley's floor, which the closing view centres. */
export const HONG_KONG_CENTRE = { x: valleyCentre(-1230), z: -1230 } as const;

/**
 * The closing view's own frame, in plan: a point `dist` from the shore
 * towards the city's middle and `across` to the right of that line.
 */
const toCentre = Math.hypot(
  HONG_KONG_CENTRE.x - HONG_KONG_SHORE.x,
  HONG_KONG_CENTRE.z - HONG_KONG_SHORE.z,
);
const AHEAD = [
  (HONG_KONG_CENTRE.x - HONG_KONG_SHORE.x) / toCentre,
  (HONG_KONG_CENTRE.z - HONG_KONG_SHORE.z) / toCentre,
] as const;
const RIGHT = [-AHEAD[1], AHEAD[0]] as const;
function inView(dist: number, across: number) {
  const x = HONG_KONG_SHORE.x + AHEAD[0] * dist + RIGHT[0] * across;
  const z = HONG_KONG_SHORE.z + AHEAD[1] * dist + RIGHT[1] * across;
  return { x, z };
}

/** The lowest ground under a w by d footprint at (x, z). */
function groundUnder(x: number, z: number, w: number, d = w) {
  return Math.min(
    valleyHeight(x, z),
    valleyHeight(x - w / 2, z - d / 2),
    valleyHeight(x + w / 2, z - d / 2),
    valleyHeight(x - w / 2, z + d / 2),
    valleyHeight(x + w / 2, z + d / 2),
  );
}

/** An outline turned to face the shore, square on to the closing view. */
function facingShore(outline: Outline): Outline {
  // Local +x is the view's right, local -z its way ahead.
  return outline.map(
    ([u, v]) =>
      [RIGHT[0] * u - AHEAD[0] * v, RIGHT[1] * u - AHEAD[1] * v] as const,
  );
}

/** A square `size` across with its corners cut back by `cut`, facing the shore. */
function chamfered(size: number, cut: number): Outline {
  const h = size / 2;
  const c = Math.min(cut, h);
  return facingShore([
    [h - c, h],
    [-(h - c), h],
    [-h, h - c],
    [-h, -(h - c)],
    [-(h - c), -h],
    [h - c, -h],
    [h, -(h - c)],
    [h, h - c],
  ]);
}

/** An outline scaled about its axis. */
const scaled = (outline: Outline, k: number): Outline =>
  outline.map(([x, z]) => [x * k, z * k] as const);

/** One of Hong Kong's landmarks: where it stands, its foot and its tip. */
export type HongKongLandmark = {
  name: string;
  x: number;
  z: number;
  foot: number;
  tip: number;
};

export function layoutHongKong() {
  const random = seededRandom(0x4b);
  const solids: Solid[] = [];
  const rings: Ring[] = [];
  const strokes: Stroke[] = [];
  const towers: Box[] = [];
  const darkTowers: Box[] = [];
  const glows: Glow[] = [];
  const pools: Pool[] = [];
  const reflected: Reflected[] = [];
  /** Every structure's bounding box, for keeping the camera and the water clear of them. */
  const bounds: Box[] = [];
  const landmarks: HongKongLandmark[] = [];
  const { cyan, neonRed: red } = palette;

  /** A loft through outlines at heights over `ground`, at (x, z). */
  const loft = (
    x: number,
    z: number,
    ground: number,
    sections: { h: number; outline: Outline }[],
    extra: Partial<Solid> = {},
  ): Solid => ({
    shape: "loft",
    x,
    y: ground - 1,
    z,
    rTop: 0,
    rBottom: 0,
    h: sections.at(-1)!.h + 1,
    segments: sections[0].outline.length,
    color: cyan,
    windows: true,
    // From a unit below the ground, so no gap shows at its foot.
    sections: sections.map((s) => ({ ...s, h: s.h === 0 ? 0 : s.h + 1 })),
    ...extra,
  });

  /** A thin mast from `y` to `top` at (x, z). */
  const mast = (x: number, z: number, y: number, top: number): Solid => ({
    shape: "frustum",
    x,
    y,
    z,
    rBottom: 0.35,
    rTop: 0.12,
    h: top - y,
    segments: 6,
    color: palette.ink,
    wash: 0.5,
  });

  /**
   * Marks a landmark as Hong Kong's: neon red at its tip, burning in the
   * harbour below, and its footprint and height kept.
   */
  function landmark(
    name: string,
    x: number,
    z: number,
    foot: number,
    tip: number,
    size: number,
  ) {
    landmarks.push({ name, x, z, foot, tip });
    glows.push({ x, y: tip + 0.6, z, color: red, size: 5, seed: random() });
    reflected.push({ x, y: tip, z, color: red, power: 1.3, relit: false });
    reflected.push({
      x,
      y: foot + (tip - foot) * 0.6,
      z,
      color: cyan,
      power: 0.16,
      relit: false,
    });
    bounds.push({
      x,
      y: foot - 1 + (tip - foot + 1) / 2,
      z,
      w: size,
      h: tip - foot + 1,
      d: size,
      color: cyan,
    });
    pools.push({ x, y: foot, z, width: 22, depth: 36, color: cyan });
  }

  // Central Plaza (374 m): a triangle in plan, its corners cut, under a
  // glass pyramid and its mast, its crown ringed in light.
  {
    const H = 65;
    const { x, z } = inView(168, -17);
    const ground = groundUnder(x, z, 11);
    const tri: Outline = facingShore(
      [0, 1, 2].flatMap((i) => {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
        return [-0.32, 0.32].map(
          (da) => [Math.cos(a + da) * 6.4, Math.sin(a + da) * 6.4] as const,
        );
      }),
    );
    const shaft = H * 0.74;
    const roof = shaft + H * 0.1;
    solids.push(
      loft(x, z, ground, [
        { h: 0, outline: tri },
        { h: shaft, outline: scaled(tri, 0.94) },
      ]),
      loft(
        x,
        z,
        ground,
        [
          { h: shaft, outline: scaled(tri, 0.94) },
          { h: roof, outline: scaled(tri, 0.22) },
        ],
        { windows: false, wash: 0.5 },
      ),
      mast(x, z, ground + roof - 0.5, ground + H),
    );
    for (const k of [0.6, 0.66, 0.72]) {
      rings.push({
        x,
        y: ground + H * k,
        z,
        r: 0,
        h: 0.3,
        color: cyan,
        outline: scaled(tri, 0.96),
      });
    }
    rings.push({
      x,
      y: ground + shaft + 0.2,
      z,
      r: 0,
      h: 0.4,
      color: red,
      outline: scaled(tri, 0.95),
    });
    landmark("Central Plaza", x, z, ground, ground + H, 12);
  }

  // The Bank of China Tower (367 m with its masts): a square in plan cut by
  // its diagonals into four triangular prisms, each ending higher than the
  // last in a sloping glass roof that rises to the core; its faces' X-braced
  // lattice in lines of light; twin masts on the highest.
  {
    const H = 64;
    const body = 54;
    const S = 10;
    const { x, z } = inView(180, -5);
    const ground = groundUnder(x, z, S * 1.4);
    const h = S / 2;
    /** Each prism by the side it faces (local), and where its roof begins. */
    const prisms = [
      { side: [0, 1], top: body * 0.46 },
      { side: [-1, 0], top: body * 0.64 },
      { side: [1, 0], top: body * 0.82 },
      { side: [0, -1], top: body },
    ] as const;
    const slope = h;
    for (const { side, top } of prisms) {
      const [sx, sz] = side;
      // The prism's outer side, corner to corner, and the core.
      const a = [sx * h - sz * h, sz * h + sx * h] as const;
      const b = [sx * h + sz * h, sz * h - sx * h] as const;
      const tri = facingShore([[0, 0], b, a]);
      const core = facingShore([
        [0, 0],
        [0, 0],
        [0, 0],
      ]);
      solids.push(
        loft(x, z, ground, [
          { h: 0, outline: tri },
          { h: top - slope, outline: tri },
          { h: top, outline: core },
        ]),
      );
      // The lattice on its outer face: an X a storey-block high, from the
      // ground to the foot of its roof, and the roof's edges.
      const [[ax, az], [bx, bz]] = [tri[2], tri[1]];
      const facing = facingShore([[sx, sz]])[0];
      const n = Math.hypot(facing[0], facing[1]);
      const normal = [facing[0] / n, facing[1] / n] as const;
      const wall = top - slope;
      const blocks = Math.max(1, Math.round(wall / S));
      const P = (u: number, y: number) =>
        [x + ax + (bx - ax) * u, ground + y, z + az + (bz - az) * u] as const;
      const line = (
        from: readonly [number, number, number],
        to: readonly [number, number, number],
      ) => strokes.push({ from, to, width: 0.22, facing: normal, color: cyan });
      for (let k = 0; k < blocks; k++) {
        const y0 = (wall * k) / blocks;
        const y1 = (wall * (k + 1)) / blocks;
        line(P(0, y0), P(1, y1));
        line(P(1, y0), P(0, y1));
        line(P(0, y1), P(1, y1));
      }
      line(P(0, 0), P(0, wall));
      line(P(1, 0), P(1, wall));
      // The roof's sloping edges, up to the core.
      const apex = [x, ground + top, z] as const;
      line(P(0, wall), apex);
      line(P(1, wall), apex);
    }
    const tip = ground + H;
    for (const u of [-0.9, 0.9]) {
      solids.push(
        mast(
          x + RIGHT[0] * u,
          z + RIGHT[1] * u,
          ground + body - 3,
          tip - (u < 0 ? 1.5 : 0),
        ),
      );
    }
    landmark("Bank of China Tower", x, z, ground, tip, S * 1.4);
  }

  // IFC 2 (412 m): a square shaft with its corners cut back, tapering a
  // little, then stepping in to its crown, whose tips reach up like claws.
  {
    const H = 71;
    const S = 10;
    const { x, z } = inView(192, 11);
    const ground = groundUnder(x, z, S);
    const plan = chamfered(S, 1.6);
    const steps: [number, number][] = [
      [0, 1],
      [0.76, 0.9],
      [0.76, 0.8],
      [0.82, 0.8],
      [0.82, 0.68],
      [0.87, 0.68],
      [0.87, 0.56],
      [0.91, 0.56],
    ];
    solids.push(
      loft(
        x,
        z,
        ground,
        steps.map(([k, s]) => ({ h: H * k, outline: scaled(plan, s) })),
      ),
    );
    // The crown: its four corners reaching up past the roof, like claws.
    for (const [u, v] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const k = S * 0.21;
      solids.push({
        shape: "frustum",
        x: x + RIGHT[0] * u * k - AHEAD[0] * v * k,
        y: ground + H * 0.91,
        z: z + RIGHT[1] * u * k - AHEAD[1] * v * k,
        rBottom: 0.9,
        rTop: 0.15,
        h: H * 0.09,
        segments: 4,
        color: cyan,
        wash: 0.35,
      });
    }
    for (const [k, s] of [
      [0.76, 0.9],
      [0.82, 0.8],
      [0.87, 0.68],
    ]) {
      rings.push({
        x,
        y: ground + H * k + 0.15,
        z,
        r: 0,
        h: 0.3,
        color: cyan,
        outline: scaled(plan, s + 0.01),
      });
    }
    rings.push({
      x,
      y: ground + H * 0.91 + 0.15,
      z,
      r: 0,
      h: 0.35,
      color: red,
      outline: scaled(plan, 0.57),
    });
    landmark("IFC 2", x, z, ground, ground + H, S);
  }

  // The Center (346 m): a square shaft turned on the diagonal, its crown
  // stepping in, each step ringed in neon, under a mast.
  {
    const H = 60;
    const S = 9;
    const { x, z } = inView(200, 22);
    const ground = groundUnder(x, z, S * 1.2);
    const plan = facingShore(
      [0, 1, 2, 3].map(
        (i) =>
          [
            Math.cos((i * Math.PI) / 2) * S * 0.7,
            Math.sin((i * Math.PI) / 2) * S * 0.7,
          ] as const,
      ),
    );
    const tiers: [number, number][] = [
      [0.7, 1],
      [0.76, 0.84],
      [0.81, 0.68],
      [0.85, 0.52],
    ];
    const sections = [{ h: 0, outline: plan }];
    for (const [k, s] of tiers) {
      const prev = sections.at(-1)!;
      sections.push({ h: H * k, outline: prev.outline });
      sections.push({ h: H * k, outline: scaled(plan, s) });
      // Its bands of neon, three to a tier.
      for (let b = 0; b < 3; b++) {
        rings.push({
          x,
          y: ground + H * k - 0.6 - b * 1.1,
          z,
          r: 0,
          h: 0.32,
          color: b === 0 && k === 0.85 ? red : cyan,
          outline: scaled(prev.outline, 1.02),
        });
      }
    }
    sections.push({ h: H * 0.87, outline: scaled(plan, 0.52) });
    solids.push(
      loft(x, z, ground, sections),
      mast(x, z, ground + H * 0.87 - 0.5, ground + H),
    );
    landmark("The Center", x, z, ground, ground + H, S * 1.4);
  }

  // ICC (484 m), the tallest, at the back: a square shaft with notched
  // corners, its crown sloping in to a flat top.
  {
    const H = 84;
    const S = 11;
    const { x, z } = inView(252, 4);
    const ground = groundUnder(x, z, S);
    const h = S / 2;
    const n = S * 0.12;
    const plan = facingShore([
      [h, h - n],
      [h - n, h - n],
      [h - n, h],
      [-(h - n), h],
      [-(h - n), h - n],
      [-h, h - n],
      [-h, -(h - n)],
      [-(h - n), -(h - n)],
      [-(h - n), -h],
      [h - n, -h],
      [h - n, -(h - n)],
      [h, -(h - n)],
    ]);
    solids.push(
      loft(x, z, ground, [
        { h: 0, outline: plan },
        { h: H * 0.88, outline: scaled(plan, 0.93) },
        { h: H * 0.97, outline: scaled(plan, 0.66) },
        { h: H, outline: scaled(plan, 0.62) },
      ]),
    );
    rings.push(
      {
        x,
        y: ground + H * 0.88,
        z,
        r: 0,
        h: 0.35,
        color: cyan,
        outline: scaled(plan, 0.945),
      },
      {
        x,
        y: ground + H - 0.2,
        z,
        r: 0,
        h: 0.35,
        color: red,
        outline: scaled(plan, 0.64),
      },
    );
    landmark("ICC", x, z, ground, ground + H, S);
  }

  // The towers round the landmarks: the Island's waterfront and a row
  // behind, each [dist, across, height, width, depth, dark glass].
  const plan = [
    [150, 2, 12, 8, 6, false],
    [152, 14, 14, 7, 6, true],
    [154, 25, 17, 8, 7, false],
    [156, -12, 13, 8, 7, false],
    [162, -23, 18, 8, 7, false],
    [214, -16, 40, 9, 8, true],
    [222, -28, 34, 8, 8, false],
    [226, 14, 44, 9, 9, false],
    [216, 27, 32, 8, 8, true],
    [240, 24, 38, 8, 8, false],
  ] as const;
  for (const [dist, across, height, w, d, dark] of plan) {
    const { x, z } = inView(dist, across);
    const ground = groundUnder(x, z, w, d);
    const box = {
      x,
      y: ground - 2 + (height + 2) / 2,
      z,
      w,
      h: height + 2,
      d,
      color: cyan,
    };
    (dark ? darkTowers : towers).push(box);
    bounds.push(box);
    rings.push({
      x,
      y: ground + height - 1.2,
      z,
      r: 0,
      h: 0.28,
      color: cyan,
      outline: [
        [w / 2 + 0.1, d / 2 + 0.1],
        [-w / 2 - 0.1, d / 2 + 0.1],
        [-w / 2 - 0.1, -d / 2 - 0.1],
        [w / 2 + 0.1, -d / 2 - 0.1],
      ],
    });
    glows.push({
      x,
      y: ground + height + 0.8,
      z,
      color: cyan,
      size: 3,
      seed: random(),
    });
    reflected.push({
      x,
      y: ground + height,
      z,
      color: cyan,
      power: 0.14,
      relit: false,
    });
  }

  // Victoria Peak's lights: a scatter up its slope, sparse.
  for (let i = 0; i < 16; i++) {
    const z = -1315 - random() * 55;
    const x = valleyCentre(z) + (random() * 2 - 1) * 40;
    const light: Color = random() < 0.7 ? palette.ink : cyan;
    glows.push({
      x,
      y: valleyHeight(x, z) + 0.6,
      z,
      color: light,
      size: 1.2 + random() * 1.2,
      seed: random(),
    });
  }

  return {
    solids,
    rings,
    strokes,
    towers,
    darkTowers,
    glows,
    pools,
    bounds,
    landmarks,
    /** The points of light Victoria Harbour throws back, the landmarks' first. */
    reflected,
  };
}
