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
  // that end a module apart (about the 28th, 41st, 55th and 70th floors),
  // each in a sloping glass roof rising one module to the core, until a
  // single triangular prism remains, its twin masts on top. One even grid
  // of lines of light over every face it shows, up to the top: a module is
  // a fifth of its height, an X to each up its outer faces, and the inner
  // faces each shaft bares above the lower ones cut into like triangles.
  {
    const H = 64;
    const body = 54.7;
    /** The 52 m square's side, and the grid's module, a fifth of its height. */
    const S = 9;
    const M = body / 5;
    const { x, z } = inView(180, -5);
    const ground = footOf(x, z, S * 1.4);
    const h = S / 2;
    /**
     * Each shaft by the side it faces (local), and the module its roof
     * starts at. Turned so a tall shaft faces the harbour: its lattice
     * climbs the front, the lower two step down either side.
     */
    const shafts = [
      { side: [-1, 0], wall: 1 },
      { side: [1, 0], wall: 2 },
      { side: [0, 1], wall: 3 },
      { side: [0, -1], wall: 4 },
    ] as const;
    /** A point on the tower: (u, v) in plan off its axis, y over its foot. */
    const at = (u: number, v: number, y: number) => {
      const [[px, pz]] = facingShore([[u, v]]);
      return [x + px, ground + y, z + pz] as const;
    };
    const lineOn =
      (normal: readonly [number, number]) =>
      (
        from: readonly [number, number, number],
        to: readonly [number, number, number],
      ) =>
        strokes.push({ from, to, width: 0.3, facing: normal, color: cyan });
    /** A unit normal in the world, for a direction in plan. */
    const facingOf = (u: number, v: number) => {
      const [[nx, nz]] = facingShore([[u, v]]);
      const length = Math.hypot(nx, nz);
      return [nx / length, nz / length] as const;
    };
    for (const { side, wall } of shafts) {
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
          { h: wall * M, outline: tri },
          { h: (wall + 1) * M, outline: core },
        ]),
      );
      // Its outer face: an X to each module, up to its roof, and the roof's
      // edges up to the core.
      const outer = lineOn(facingOf(sx, sz));
      const P = (u: number, y: number) =>
        at(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, y);
      for (let k = 0; k < wall; k++) {
        outer(P(0, k * M), P(1, (k + 1) * M));
        outer(P(1, k * M), P(0, (k + 1) * M));
        outer(P(0, (k + 1) * M), P(1, (k + 1) * M));
      }
      outer(P(0, 0), P(0, wall * M));
      outer(P(1, 0), P(1, wall * M));
      const apex = at(0, 0, (wall + 1) * M);
      outer(P(0, wall * M), apex);
      outer(P(1, wall * M), apex);

      // Its inner faces, on the diagonals, where it stands over a lower
      // neighbour: from the neighbour's roof up to its own, each module a
      // band running up from the shared corner to the core at the roofs'
      // slope, cut level across into two like triangles.
      for (const other of shafts) {
        const [ox, oz] = other.side;
        if (sx * ox + sz * oz !== 0 || other.wall >= wall) continue;
        const corner = [h * (sx + ox), h * (sz + oz)] as const;
        // Across the diagonal, away from this shaft, towards the neighbour.
        const turned = [-corner[1], corner[0]] as const;
        const away = turned[0] * sx + turned[1] * sz > 0 ? -1 : 1;
        const inner = lineOn(facingOf(turned[0] * away, turned[1] * away));
        /** At the corner (u 0) or the core (u 1), `y` up the corner's line. */
        const Q = (u: number, y: number) =>
          at(corner[0] * (1 - u), corner[1] * (1 - u), y + u * M);
        for (let k = other.wall; k < wall; k++) {
          inner(Q(0, (k + 1) * M), Q(1, k * M));
          inner(Q(0, (k + 1) * M), Q(1, (k + 1) * M));
        }
        inner(Q(1, other.wall * M), Q(1, wall * M));
      }
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
  // narrowing as it rises in setbacks at its corners, to its open crown: a
  // ring of blades standing past the top floor, curving in as they rise so
  // their tips close in near the top, the sky showing between them.
  {
    const H = 71.5;
    const S = 10;
    const { x, z } = inView(204, 11);
    const ground = footOf(x, z, S);
    /** A face's middle steps forward `step`; its corners bevel back `cut`. */
    const localPlan = (size: number, cut: number, step = 0.35): Outline => {
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
      return [0, 1, 2, 3].flatMap(quarter);
    };
    const plan = (size: number, cut: number) =>
      facingShore(localPlan(size, cut));
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
      [0.9, S * 0.82, 3.4],
    ];
    solids.push(
      loft(
        x,
        z,
        ground,
        setbacks.map(([k, size, cut]) => ({ h: H * k, outline: plan(size, cut) })),
      ),
    );
    // The crown's fins, evenly round the top floor's edge: each a blade
    // rising off the edge and curving in over the roof, the corners' the
    // tallest, so their tips close in on one another near the top.
    const crown = localPlan(S * 0.82, 3.4);
    const edges = crown.map((p, i) => {
      const q = crown[(i + 1) % crown.length];
      return { p, q, length: Math.hypot(q[0] - p[0], q[1] - p[1]) };
    });
    const perimeter = edges.reduce((sum, e) => sum + e.length, 0);
    const FINS = 16;
    const RISE = 6;
    for (let i = 0; i < FINS; i++) {
      let d = ((i + 0.5) / FINS) * perimeter;
      const edge = edges.find((e) => (d -= e.length) <= 0)!;
      const t = 1 + d / edge.length;
      const u = edge.p[0] + (edge.q[0] - edge.p[0]) * t;
      const v = edge.p[1] + (edge.q[1] - edge.p[1]) * t;
      const out = Math.hypot(u, v);
      const [du, dv] = [u / out, v / out];
      const cornerward = Math.abs(Math.sin(2 * Math.atan2(v, u))) ** 1.6;
      const rise = H * (0.07 + 0.03 * cornerward);
      // Up the blade, its section: thin across, narrowing to its tip, and
      // drawn in towards the axis, slowly at first, then sharply.
      const sections = Array.from({ length: RISE + 1 }, (_, k) => {
        const f = k / RISE;
        const r = out * (1 - 0.82 * f ** 2);
        const half = 0.26 * (1 - f) + 0.05;
        const thin = 0.16;
        const [cu, cv] = [du * r, dv * r];
        const outline: Outline = facingShore([
          [cu + du * thin - dv * half, cv + dv * thin + du * half],
          [cu - du * thin - dv * half, cv - dv * thin + du * half],
          [cu - du * thin + dv * half, cv - dv * thin - du * half],
          [cu + du * thin + dv * half, cv + dv * thin - du * half],
        ]);
        return { h: H * 0.9 - 0.3 + rise * f, outline };
      });
      solids.push(
        loft(x, z, ground, sections, { windows: false, wash: 0.55 }),
      );
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
      y: ground + H * 0.9 + 0.15,
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
    [150, 5, 12, 8, 6, false],
    [152, 14, 14, 7, 6, true],
    [154, 25, 17, 8, 7, false],
    [158, -14, 13, 8, 7, false],
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
