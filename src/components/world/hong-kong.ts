import type { Color } from "three";
import type { Glow } from "./glow-points";
import type { Pool } from "./ground-pools";
import type { Reflected } from "./harbour";
import { seededRandom } from "./noise";
import { palette } from "./palette";
import type { Box, Outline, Ring, Solid, Stroke } from "./skyline";
import { groundUnder, valleyCentre, valleyHeight } from "./terrain";

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
const footOf = (x: number, z: number, w: number, d = w) =>
  groundUnder(x, z, w, d).low;

/** An outline turned to face the shore, square on to the closing view. */
function facingShore(outline: Outline): Outline {
  // Local +x is the view's right, local -z its way ahead.
  return outline.map(
    ([u, v]) =>
      [RIGHT[0] * u - AHEAD[0] * v, RIGHT[1] * u - AHEAD[1] * v] as const,
  );
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

  // Central Plaza (309 m to its roof, 374 m to its mast's tip): a triangle in
  // plan with its three corners cut off, rising from the base through the
  // tower's body (to 266 m) into its top: six plant floors, ringed by the
  // four bars of its neon clock, under a glass pyramid, through which its
  // 102 m mast rises.
  {
    const H = 65;
    const body = 46.2;
    const top = 50.3;
    const roof = 53.6;
    const { x, z } = inView(172, -18);
    const ground = footOf(x, z, 12);
    const tri: Outline = facingShore(
      [0, 1, 2].flatMap((i) => {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
        return [-0.36, 0.36].map(
          (da) => [Math.cos(a + da) * 6.8, Math.sin(a + da) * 6.8] as const,
        );
      }),
    );
    solids.push(
      loft(x, z, ground, [
        { h: 0, outline: tri },
        { h: body, outline: tri },
        { h: body, outline: scaled(tri, 0.95) },
        { h: top, outline: scaled(tri, 0.95) },
      ]),
      loft(
        x,
        z,
        ground,
        [
          { h: top, outline: scaled(tri, 0.95) },
          { h: roof, outline: scaled(tri, 0.12) },
        ],
        { windows: false, wash: 0.55 },
      ),
      mast(x, z, ground + roof - 1, ground + H),
    );
    // The neon clock: four bars round the tower's top.
    for (let k = 0; k < 4; k++) {
      rings.push({
        x,
        y: ground + body + 0.6 + k * 1.0,
        z,
        r: 0,
        h: 0.4,
        color: cyan,
        outline: scaled(tri, 0.97),
      });
    }
    rings.push({
      x,
      y: ground + top + 0.15,
      z,
      r: 0,
      h: 0.35,
      color: red,
      outline: scaled(tri, 0.96),
    });
    landmark("Central Plaza", x, z, ground, ground + H, 12);
  }

  // The Bank of China Tower (315 m to its roof, 367 m to its masts' tips):
  // a 52 m square in plan, cut by its diagonals into four triangular shafts
  // that end one by one (at the 25th, 38th and 51st floors, the last at the
  // 70th), each in a sloping glass roof rising to the core, until a single
  // triangular prism remains, its twin masts on top. Its faces' X-braced
  // lattice, an X to each 52 m cube, in lines of light.
  {
    const H = 64;
    const body = 54.7;
    /** The 52 m square's side. */
    const S = 9;
    const { x, z } = inView(180, -5);
    const ground = footOf(x, z, S * 1.4);
    const h = S / 2;
    /** Each shaft by the side it faces (local), and the top of its roof. */
    // Turned so the shaft facing the harbour is one of the tall ones: its
    // lattice climbs the front, the lower two step down either side.
    const shafts = [
      { side: [-1, 0], top: (body * 25) / 70 },
      { side: [1, 0], top: (body * 38) / 70 },
      { side: [0, 1], top: (body * 51) / 70 },
      { side: [0, -1], top: body },
    ] as const;
    /** How far each roof rises from the face to the core. */
    const slope = h * 1.3;
    for (const { side, top } of shafts) {
      const [sx, sz] = side;
      // The shaft's outer side, corner to corner, and the core.
      const a = [sx * h - sz * h, sz * h + sx * h] as const;
      const b = [sx * h + sz * h, sz * h - sx * h] as const;
      const tri = facingShore([[0, 0], b, a]);
      const core: Outline = [
        [0, 0],
        [0, 0],
        [0, 0],
      ];
      solids.push(
        loft(x, z, ground, [
          { h: 0, outline: tri },
          { h: top - slope, outline: tri },
          { h: top, outline: core },
        ]),
      );
      // The lattice on its outer face: an X to each cube, from the ground
      // to the foot of its roof, and the roof's edges.
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
      const apex = [x, ground + top, z] as const;
      line(P(0, wall), apex);
      line(P(1, wall), apex);
    }
    // The twin masts, on the last prism's peak.
    const tip = ground + H;
    for (const u of [-0.7, 0.7]) {
      solids.push(
        mast(x + RIGHT[0] * u, z + RIGHT[1] * u, ground + body - 2, tip),
      );
    }
    landmark("Bank of China Tower", x, z, ground, tip, S * 1.4);
  }

  // IFC 2 (407 m to its roof, 412 m to its crown's tips): a square plan
  // with its corners bevelled back and each face's middle stepped forward,
  // narrowing as it rises in setbacks at its corners, to an open,
  // sculptural crown: fins at its corners and mid-faces reaching up past
  // the top floor, so the sky shows through.
  {
    const H = 71.5;
    const S = 10;
    const { x, z } = inView(204, 11);
    const ground = footOf(x, z, S);
    /** A face's middle steps forward `step`; its corners bevel back `cut`. */
    const plan = (size: number, cut: number, step = 0.35): Outline => {
      const h = size / 2;
      const m = size * 0.2;
      const side: [number, number][] = [
        [h, h - cut],
        [h - cut, h],
        [m, h],
        [m, h + step],
        [-m, h + step],
        [-m, h],
      ];
      // The same quarter, turned to each side in turn, anticlockwise.
      const quarter = (k: number) =>
        side.map(([u, v]) => {
          const a = (k * Math.PI) / 2;
          return [
            u * Math.cos(a) - v * Math.sin(a),
            u * Math.sin(a) + v * Math.cos(a),
          ] as const;
        });
      return facingShore([0, 1, 2, 3].flatMap(quarter));
    };
    /** Its setbacks: [height, size, bevel]. */
    const setbacks: [number, number, number][] = [
      [0, S, 1.2],
      [0.56, S, 1.2],
      [0.56, S * 0.97, 1.8],
      [0.68, S * 0.97, 1.8],
      [0.68, S * 0.93, 2.4],
      [0.79, S * 0.93, 2.4],
      [0.79, S * 0.88, 3],
      [0.87, S * 0.88, 3],
      [0.87, S * 0.82, 3.4],
      [0.94, S * 0.82, 3.4],
    ];
    solids.push(
      loft(
        x,
        z,
        ground,
        setbacks.map(([k, size, cut]) => ({ h: H * k, outline: plan(size, cut) })),
      ),
    );
    // The crown's fins: four at the corners, the tallest, and four at the
    // faces' middles, leaning a little in.
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 4;
      const corner = i % 2 === 0;
      const r = corner ? S * 0.33 : S * 0.43;
      const [u, v] = [Math.cos(a) * r, Math.sin(a) * r];
      solids.push({
        shape: "frustum",
        x: x + RIGHT[0] * u - AHEAD[0] * v,
        y: ground + H * 0.9,
        z: z + RIGHT[1] * u - AHEAD[1] * v,
        rBottom: corner ? 0.75 : 0.5,
        rTop: 0.1,
        h: corner ? H * 0.1 : H * 0.075,
        segments: 4,
        color: cyan,
        wash: 0.4,
      });
    }
    for (const [k, size, cut] of [
      [0.56, S, 1.2],
      [0.68, S * 0.97, 1.8],
      [0.79, S * 0.93, 2.4],
      [0.87, S * 0.88, 3],
    ]) {
      rings.push({
        x,
        y: ground + H * k + 0.15,
        z,
        r: 0,
        h: 0.28,
        color: cyan,
        outline: scaled(plan(size, cut), 1.01),
      });
    }
    rings.push({
      x,
      y: ground + H * 0.94 + 0.15,
      z,
      r: 0,
      h: 0.32,
      color: red,
      outline: scaled(plan(S * 0.82, 3.4), 1.01),
    });
    landmark("IFC 2", x, z, ground, ground + H, S);
  }

  // The Center (292 m to its roof, 346 m to its mast's tip): an eight-
  // pointed star in plan, two squares offset by 45°, its points running up
  // the shaft; bars of neon round it, closer together towards the top; and
  // a mast on its roof.
  {
    const H = 60;
    const roof = 50.7;
    /** Half the side of each of its two squares. */
    const half = 3.8;
    const { x, z } = inView(200, 22);
    const ground = footOf(x, z, half * 2.8);
    const star = facingShore(
      Array.from({ length: 16 }, (_, i) => {
        const a = (i * Math.PI) / 8;
        const r = i % 2 === 0 ? half * Math.SQRT2 : half / Math.cos(Math.PI / 8);
        return [Math.cos(a) * r, Math.sin(a) * r] as const;
      }),
    );
    solids.push(
      loft(x, z, ground, [
        { h: 0, outline: star },
        { h: roof - 2.5, outline: star },
        { h: roof, outline: scaled(star, 0.86) },
      ]),
      mast(x, z, ground + roof - 0.5, ground + H),
    );
    // Its neon: bars from a third of the way up, each gap shorter than the
    // last, the topmost in red.
    const bars: number[] = [];
    for (let y = roof * 0.34, gap = 4; y < roof - 3; y += gap) {
      bars.push(y);
      gap = Math.max(1.1, gap * 0.86);
    }
    bars.forEach((y, i) => {
      rings.push({
        x,
        y: ground + y,
        z,
        r: 0,
        h: 0.3,
        color: i === bars.length - 1 ? red : cyan,
        outline: scaled(star, 1.02),
      });
    });
    landmark("The Center", x, z, ground, ground + H, half * 2.8);
  }

  // ICC (484 m, its parapets included), the tallest, at the back: a square
  // in plan with re-entrant corners, notched the whole way up and deepening
  // a little as they rise; its faces curving out at the foot, splaying into
  // the ground; its top flat behind its parapets.
  {
    const H = 84;
    const S = 11;
    const { x, z } = inView(252, 4);
    const ground = footOf(x, z, S * 1.3);
    /** The square `size` across, its corners notched `notch` deep. */
    const plan = (size: number, notch: number): Outline => {
      const h = size / 2;
      const n = notch;
      return facingShore([
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
    };
    solids.push(
      loft(x, z, ground, [
        // The faces' curves, splaying out at the foot.
        { h: 0, outline: plan(S * 1.3, S * 0.1) },
        { h: H * 0.02, outline: plan(S * 1.16, S * 0.1) },
        { h: H * 0.05, outline: plan(S * 1.07, S * 0.1) },
        { h: H * 0.09, outline: plan(S * 1.02, S * 0.1) },
        { h: H * 0.13, outline: plan(S, S * 0.1) },
        { h: H, outline: plan(S * 0.96, S * 0.15) },
      ]),
    );
    rings.push(
      {
        x,
        y: ground + H * 0.81,
        z,
        r: 0,
        h: 0.35,
        color: cyan,
        outline: scaled(plan(S * 0.97, S * 0.14), 1.01),
      },
      {
        x,
        y: ground + H - 0.2,
        z,
        r: 0,
        h: 0.35,
        color: red,
        outline: scaled(plan(S * 0.96, S * 0.15), 1.01),
      },
    );
    landmark("ICC", x, z, ground, ground + H, S * 1.3);
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
    const ground = footOf(x, z, w, d);
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
