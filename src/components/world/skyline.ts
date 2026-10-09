import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  type IUniform,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Glow } from "./glow-points";
import type { Pool } from "./ground-pools";
import { fogChunk, fogUniforms, MOON, palette } from "./palette";
import { valleyCentre, valleyHeight } from "./terrain";

/**
 * Toronto's skyline, standing on the right of the valley's floor where it
 * swings left past the first lit site, as pure data (unit tested without
 * WebGL) and meshes.
 * Seen from the hero it reads as the classic view from the Islands: the
 * Rogers Centre's dome on the left, the CN Tower beside it, the tallest thing
 * in the world and the one thing that rises over the mountains, and the
 * financial core to the right (TD Centre's dark slabs, Scotia Plaza's
 * stepped crown, First Canadian Place) with the Royal York's copper roofs in
 * front of it. Scaled like a postcard, not a map.
 */

/** A box, as the city's buildings are. */
export type Box = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: Color;
};

/** An outline in plan, [x, z] off a solid's axis, running anticlockwise. */
export type Outline = readonly (readonly [number, number])[];

/**
 * A round solid standing on its base: a cylinder or cone (a frustum), a
 * shallow dome, a lathe, its `profile` ([radius, height] pairs) turned round
 * its axis, or a loft through its `sections` (outlines at heights over its
 * base, each with as many points). `windows` lays the city's lit windows on
 * it; `wash` floods it with its light, as the CN Tower's shaft is lit at
 * night; `relit` turns that wash magenta at the Skyline (see `magentaWash`).
 */
export type Solid = {
  shape: "frustum" | "dome" | "lathe" | "loft";
  x: number;
  y: number;
  z: number;
  rTop: number;
  rBottom: number;
  h: number;
  segments: number;
  color: Color;
  windows?: boolean;
  wash?: number;
  relit?: boolean;
  profile?: readonly (readonly [number, number])[];
  sections?: readonly { h: number; outline: Outline }[];
  /** Turned round its axis: a 4-sided frustum turned an eighth is square on. */
  turn?: number;
};

/**
 * A ring of light round a solid: the CN Tower's pods, the dome's rim. Round,
 * `r` across, unless it follows an `outline`.
 */
export type Ring = {
  x: number;
  y: number;
  z: number;
  r: number;
  h: number;
  color: Color;
  outline?: Outline;
};

/**
 * A steep hipped roof in copper (verdigris, so cyan), as on a château: a
 * four-sided frustum turned square on over a square `size` across, from `y`
 * to `top`, overhanging a little.
 */
export function hippedRoof(
  x: number,
  z: number,
  size: number,
  y: number,
  top: number,
): Solid {
  const corner = (size / 2) * Math.SQRT2;
  return {
    shape: "frustum",
    x,
    y,
    z,
    rBottom: corner + 0.3,
    rTop: corner * 0.18,
    h: top - y,
    segments: 4,
    turn: Math.PI / 4,
    color: palette.cyan,
    wash: 0.55,
  };
}

/**
 * The CN Tower's section: a hexagonal core `core` across its corners, with
 * three legs off alternate faces reaching `reach` from its axis, the first
 * towards `facing` (an angle in plan). With `reach` at the faces' distance
 * the legs are gone and the core stands alone.
 */
export function yOutline(core: number, reach: number, facing: number): Outline {
  const out: [number, number][] = [];
  const point = (a: number, r: number, side = 0): [number, number] => [
    Math.cos(a) * r - Math.sin(a) * side,
    Math.sin(a) * r + Math.cos(a) * side,
  ];
  for (let i = 0; i < 3; i++) {
    const a = facing + (i * 2 * Math.PI) / 3;
    out.push(
      point(a - Math.PI / 6, core),
      point(a, reach, -core / 2),
      point(a, reach, core / 2),
      point(a + Math.PI / 6, core),
    );
  }
  return out;
}

/**
 * A stadium's plan, as the Rogers Centre's: two half circles `r` across, their
 * centres `a` either side of the middle along `along` (an angle in plan),
 * `steps` points to each half. `part` takes one of the roof's four panels
 * instead: the near end's quarter dome (along `along`), the near barrel, the
 * far barrel, or the far end's quarter dome.
 */
export function stadiumOutline(
  r: number,
  a: number,
  along: number,
  steps = 12,
  part?: "near" | "nearBarrel" | "farBarrel" | "far",
): Outline {
  const end = (centre: number, from: number) =>
    Array.from({ length: steps + 1 }, (_, k) => {
      const t = from + (k / steps) * Math.PI;
      return [centre + Math.cos(t) * r, Math.sin(t) * r] as const;
    });
  const local =
    part === "near"
      ? end(a, -Math.PI / 2)
      : part === "far"
      ? end(-a, Math.PI / 2)
      : part
      ? ([
          [part === "nearBarrel" ? 0 : -a, -r],
          [part === "nearBarrel" ? a : 0, -r],
          [part === "nearBarrel" ? a : 0, r],
          [part === "nearBarrel" ? 0 : -a, r],
        ] as const)
      : [...end(a, -Math.PI / 2), ...end(-a, Math.PI / 2)];
  const [c, s] = [Math.cos(along), Math.sin(along)];
  return local.map(([t, n]) => [t * c - n * s, t * s + n * c] as const);
}

/** The stretch of the valley's right side the skyline takes over from the city. */
export const DOWNTOWN = { side: 1, near: -455, far: -640 } as const;

/**
 * How far the CN Tower's wash has turned magenta, 0 to 1: the Skyline's look
 * (./skyline-look), which the scene sets each frame. Every skyline shader
 * shares this one uniform; only the solids marked `relit` take it.
 */
export const magentaWash: IUniform<number> = { value: 0 };

/** The CN Tower's height, its foot to the tip of its antenna. */
export const CN_TOWER_HEIGHT = 96;

/**
 * How much of the world's haze the landmarks take: less than the rest of
 * the world, so the skyline glows through it from the far end of the valley.
 */
export const HAZE = 0.55;

/** A point on the valley's right side, `offset` off its centre line. */
function onWall(offset: number, z: number) {
  const x = valleyCentre(z) + DOWNTOWN.side * offset;
  return { x, z, ground: valleyHeight(x, z) };
}

/** The CN Tower's foot: where it stands, and the ground there. */
export const CN_TOWER = onWall(44, -560);

/**
 * The Rogers Centre: its centre and the ground there, the radius of its
 * drum's round ends, and half the straight between them, so it reaches
 * ROGERS_CENTRE_RADIUS + ROGERS_CENTRE_STRAIGHT from its centre at most.
 */
export const ROGERS_CENTRE = onWall(40, -603);
export const ROGERS_CENTRE_RADIUS = 19;
export const ROGERS_CENTRE_STRAIGHT = 4;

export function layoutSkyline() {
  const solids: Solid[] = [];
  const rings: Ring[] = [];
  /** The financial core's towers: windowed, and TD Centre's, dark. */
  const towers: Box[] = [];
  const darkTowers: Box[] = [];
  const glows: Glow[] = [];
  const pools: Pool[] = [];
  /** Every landmark's bounding box, for keeping the camera clear of them. */
  const bounds: Box[] = [];

  const { cyan, violet } = palette;
  const white = palette.ink;

  // The CN Tower: a hexagonal core, washed in its light, with three legs that
  // flare out to the ground and taper into it under the main pod (a Y in
  // section, one leg towards the hero); the main pod three-fifths of the way
  // up, its white radome ringing the foot of the glass; the core going on,
  // alone, to the SkyPod; and the stepped antenna on top. Stouter than life,
  // so it reads from the far end of the valley.
  const cn = CN_TOWER;
  const H = CN_TOWER_HEIGHT;
  /** The main pod's radius, at the radome, and the core's under the pod. */
  const POD = 7;
  const NECK = 1.8;
  const podBase = cn.ground + H * 0.585;
  const podY = podBase + 4.6;
  const skyY = cn.ground + H * 0.79;
  const mastY = cn.ground + H * 0.83;
  const facing = Math.atan2(-cn.z, -cn.x);
  /** The shaft's section at each height: the core across, the legs' reach. */
  const shaft: [number, number, number][] = [
    [0, 2.6, 7.4],
    [H * 0.06, 2.5, 5.6],
    [H * 0.16, 2.35, 4.3],
    [H * 0.3, 2.15, 3.3],
    [H * 0.45, 1.95, 2.6],
    [podBase - cn.ground, NECK, NECK * Math.cos(Math.PI / 6)],
    [mastY - cn.ground, 1.35, 1.35 * Math.cos(Math.PI / 6)],
  ];
  const frustum = (
    y: number,
    rBottom: number,
    rTop: number,
    h: number,
    segments: number,
    color: Color,
    extra: Partial<Solid> = {},
  ): Solid => ({
    shape: "frustum",
    ...at(cn, y),
    rBottom,
    rTop,
    h,
    segments,
    color,
    ...extra,
  });
  const tower: Solid[] = [
    {
      shape: "loft",
      ...at(cn, cn.ground - 1),
      rTop: NECK,
      rBottom: shaft[0][2],
      h: mastY - cn.ground + 1,
      segments: 12,
      color: violet,
      wash: 0.6,
      sections: shaft.map(([y, core, reach], k) => ({
        h: k === 0 ? 0 : y + 1,
        outline: yOutline(core, reach, facing),
      })),
    },
    // The main pod: a sloping underside swelling into the radome, the glass
    // of its observation levels leaning out over it, and a low roof.
    {
      shape: "lathe",
      ...at(cn, podBase),
      rTop: POD - 1.1,
      rBottom: NECK,
      h: 4.6,
      segments: 24,
      color: white,
      wash: 0.4,
      profile: [
        [NECK, 0],
        [3.4, 0.6],
        [5, 1.2],
        [6.2, 1.7],
        [POD - 0.1, 2.3],
        [POD + 0.3, 3],
        [POD + 0.2, 3.7],
        [POD - 0.4, 4.3],
        [POD - 1.1, 4.6],
      ],
    },
    frustum(podY, POD - 1.1, POD - 0.3, 2.8, 24, cyan, { windows: true }),
    frustum(podY + 2.8, POD - 0.2, POD * 0.6, 1, 24, cyan, { wash: 0.3 }),
    frustum(podY + 3.8, POD * 0.6, NECK + 0.6, 1.2, 12, cyan, { wash: 0.3 }),
    // The SkyPod: a small drum of glass high on the core.
    frustum(skyY - 0.8, 1.6, 2.6, 0.8, 12, cyan, { wash: 0.3 }),
    frustum(skyY, 2.6, 2.6, 2, 12, cyan, { windows: true }),
    frustum(skyY + 2, 2.6, 1.6, 0.6, 12, cyan, { wash: 0.3 }),
    // The antenna, narrowing in steps.
    frustum(mastY, 1, 0.8, 5.5, 6, white, { wash: 0.5 }),
    frustum(mastY + 5.5, 0.6, 0.45, 5, 6, white, { wash: 0.5 }),
    frustum(mastY + 10.5, 0.32, 0.1, cn.ground + H - mastY - 10.5, 6, white, {
      wash: 0.5,
    }),
  ];
  // Its wash, and only the tower's, turns magenta at the Skyline.
  solids.push(...tower.map((s) => ({ ...s, relit: true })));
  rings.push(
    { ...at(cn, podY + 2.5), r: POD - 0.25, h: 0.45, color: cyan },
    { ...at(cn, podBase + 3.1), r: POD + 0.15, h: 0.35, color: violet },
    { ...at(cn, skyY + 1.6), r: 2.65, h: 0.35, color: cyan },
  );
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    glows.push({
      x: cn.x + Math.cos(a) * (POD - 0.3),
      y: podY + 1.2,
      z: cn.z + Math.sin(a) * (POD - 0.3),
      color: cyan,
      size: 3,
      seed: i / 12,
    });
  }
  glows.push({
    x: cn.x,
    y: cn.ground + H + 1,
    z: cn.z,
    color: violet,
    size: 9,
    seed: 0.3,
  });
  pools.push({
    x: cn.x,
    y: cn.ground,
    z: cn.z,
    width: 36,
    depth: 70,
    color: violet,
  });
  bounds.push(boxAround(cn, POD + 1, H + 2));

  // The Rogers Centre, left of the tower as the hero sees it (its west, from
  // the Islands), about life size beside it: a stadium-shaped drum under its
  // closed roof of four panels, a quarter dome at each end and two barrel
  // vaults between, each standing a little proud of the next so their seams
  // show as arcs. Its long axis runs north-south, so from the Islands, as
  // from the hero, it's seen end on.
  const dome = ROGERS_CENTRE;
  const R = ROGERS_CENTRE_RADIUS;
  /** Half the straight between the drum's round ends. */
  const A = ROGERS_CENTRE_STRAIGHT;
  const DRUM = 7.5;
  const ROOF = 9.5;
  const along = Math.atan2(-dome.z, -dome.x);
  solids.push({
    shape: "loft",
    ...at(dome, dome.ground - 2),
    rBottom: R,
    rTop: R,
    h: DRUM + 2,
    segments: 26,
    color: cyan,
    windows: true,
    sections: [0, DRUM + 2].map((h) => ({
      h,
      outline: stadiumOutline(R, A, along),
    })),
  });
  // The panels, nearest first: each one's rise, and how much light it takes.
  // Each is a slice of a low dome springing from the drum's rim.
  const panels = [
    ["near", ROOF * 0.8, 0.4],
    ["nearBarrel", ROOF, 0.12],
    ["farBarrel", ROOF * 0.9, 0.4],
    ["far", ROOF * 0.8, 0.12],
  ] as const;
  for (const [part, h, wash] of panels) {
    const STEPS = 6;
    /** The radius of the sphere the panel is cut from. */
    const sphere = (R * R + h * h) / (2 * h);
    solids.push({
      shape: "loft",
      ...at(dome, dome.ground + DRUM),
      rBottom: R,
      rTop: 0,
      h,
      segments: 12,
      color: cyan,
      wash,
      sections: Array.from({ length: STEPS + 1 }, (_, k) => {
        const y = h * Math.sin((k / STEPS) * (Math.PI / 2));
        const r = Math.sqrt(Math.max(sphere ** 2 - (sphere - h + y) ** 2, 0));
        return { h: y, outline: stadiumOutline(r, A, along, 12, part) };
      }),
    });
  }
  rings.push({
    ...at(dome, dome.ground + DRUM - 0.2),
    r: R + 0.15,
    h: 0.6,
    color: cyan,
    outline: stadiumOutline(R + 0.15, A, along),
  });
  const rim = stadiumOutline(R + 0.5, A, along, 9);
  rim.forEach(([dx, dz], i) => {
    glows.push({
      x: dome.x + dx,
      y: dome.ground + DRUM + 0.4,
      z: dome.z + dz,
      color: i % 2 ? violet : cyan,
      size: 2.6,
      seed: i / rim.length,
    });
  });
  pools.push({
    x: dome.x,
    y: dome.ground,
    z: dome.z,
    width: 70,
    depth: 100,
    color: cyan,
  });
  bounds.push(boxAround(dome, R + A, DRUM + ROOF));

  /** A core tower standing on the wall, with a ring of light at its crown. */
  function core(
    offset: number,
    z: number,
    height: number,
    w: number,
    d: number,
    light: Color,
    list = towers,
  ) {
    const p = onWall(offset, z);
    const ground = Math.min(
      valleyHeight(p.x - w / 2, z - d / 2),
      valleyHeight(p.x + w / 2, z - d / 2),
      valleyHeight(p.x - w / 2, z + d / 2),
      valleyHeight(p.x + w / 2, z + d / 2),
    );
    const box = {
      x: p.x,
      y: ground - 2 + (height + 2) / 2,
      z,
      w,
      h: height + 2,
      d,
      color: light,
    };
    list.push(box);
    bounds.push(box);
    glows.push({
      x: p.x,
      y: ground + height + 0.8,
      z,
      color: light,
      size: 3,
      seed: (offset % 7) / 7,
    });
    return { ...p, ground, top: ground + height };
  }

  // The financial core, to the right of the tower as the hero sees it.
  // TD Centre: three dark slabs, staggered.
  core(52, -520, 52, 13, 6, cyan, darkTowers);
  core(62, -505, 42, 11, 6, cyan, darkTowers);
  core(48, -540, 36, 10, 6, violet, darkTowers);
  // Commerce Court, and the Royal Bank's pair in front of the core.
  core(70, -530, 50, 9, 9, cyan);
  core(40, -500, 30, 8, 12, violet);
  // Scotia Plaza: a tall shaft with a stepped crown.
  const scotia = core(60, -545, 64, 10, 9, violet);
  towers.push(
    {
      x: scotia.x,
      y: scotia.top + 2,
      z: scotia.z,
      w: 7,
      h: 4,
      d: 6.5,
      color: violet,
    },
    {
      x: scotia.x,
      y: scotia.top + 5,
      z: scotia.z,
      w: 4,
      h: 2.5,
      d: 4,
      color: violet,
    },
  );
  // First Canadian Place: the tallest of them, a plain square shaft.
  core(66, -565, 72, 10, 10, cyan);
  // Towers round the core, so it reads as a downtown, not a row.
  core(78, -560, 44, 9, 8, cyan);
  core(74, -505, 38, 8, 8, cyan);
  core(84, -590, 30, 10, 8, violet);

  // The Fairmont Royal York, on Front Street in front of the core, right of
  // the tower as the hero sees it: a château, its centre block rising between
  // two lower wings, each under a steep copper roof.
  const york = onWall(36, -530);
  const BLOCK = { w: 8, h: 26, roof: 7 };
  const WING = { w: 7, d: 6, h: 19, roof: 3.6 };
  const yorkGround = Math.min(
    valleyHeight(york.x - WING.w / 2, york.z - BLOCK.w / 2 - WING.d),
    valleyHeight(york.x + WING.w / 2, york.z - BLOCK.w / 2 - WING.d),
    valleyHeight(york.x - WING.w / 2, york.z + BLOCK.w / 2 + WING.d),
    valleyHeight(york.x + WING.w / 2, york.z + BLOCK.w / 2 + WING.d),
  );
  const block = {
    x: york.x,
    y: yorkGround - 2 + (BLOCK.h + 2) / 2,
    z: york.z,
    w: BLOCK.w,
    h: BLOCK.h + 2,
    d: BLOCK.w,
    color: cyan,
  };
  towers.push(block);
  bounds.push(block);
  solids.push(
    hippedRoof(
      york.x,
      york.z,
      BLOCK.w,
      yorkGround + BLOCK.h,
      yorkGround + BLOCK.h + BLOCK.roof,
    ),
  );
  for (const end of [-1, 1]) {
    const wing = {
      x: york.x,
      y: yorkGround - 2 + (WING.h + 2) / 2,
      z: york.z + end * (BLOCK.w / 2 + WING.d / 2),
      w: WING.w,
      h: WING.h + 2,
      d: WING.d,
      color: cyan,
    };
    towers.push(wing);
    bounds.push(wing);
    solids.push(
      hippedRoof(
        wing.x,
        wing.z,
        WING.d,
        yorkGround + WING.h,
        yorkGround + WING.h + WING.roof,
      ),
    );
  }
  bounds.push({
    ...block,
    y: yorkGround + BLOCK.h + BLOCK.roof / 2,
    h: BLOCK.roof,
    w: BLOCK.w + 1,
    d: BLOCK.w + 1,
  });
  glows.push({
    x: york.x,
    y: yorkGround + BLOCK.h + BLOCK.roof + 0.6,
    z: york.z,
    color: cyan,
    size: 3,
    seed: 0.8,
  });

  return {
    solids,
    rings,
    towers,
    darkTowers,
    glows,
    pools,
    bounds,
    /** The CN Tower's place: its foot, its main pod and its tip. */
    cnTower: {
      x: cn.x,
      z: cn.z,
      foot: cn.ground,
      pod: podY + 1.7,
      tip: cn.ground + H,
    },
    /** The Rogers Centre's place: its centre, radius, foot and the dome's top. */
    rogersCentre: {
      x: dome.x,
      z: dome.z,
      r: R,
      foot: dome.ground,
      top: dome.ground + DRUM + ROOF,
    },
  };
}

function at(p: { x: number; z: number; ground: number }, y = p.ground - 1) {
  return { x: p.x, y, z: p.z };
}

function boxAround(
  p: { x: number; z: number; ground: number },
  r: number,
  h: number,
): Box {
  return {
    x: p.x,
    y: p.ground + h / 2 - 1,
    z: p.z,
    w: 2 * r,
    h: h + 2,
    d: 2 * r,
    color: palette.cyan,
  };
}

/**
 * The faces between two outlines (the lower one at `y0`, the upper at `y1`)
 * as triangles looking out, and, given `cap`, the upper one's lid.
 */
function wallPositions(
  lower: Outline,
  upper: Outline,
  y0: number,
  y1: number,
  cap = false,
): number[] {
  const out: number[] = [];
  const n = lower.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push(
      lower[i][0], y0, lower[i][1],
      upper[i][0], y1, upper[i][1],
      lower[j][0], y0, lower[j][1],
      lower[j][0], y0, lower[j][1],
      upper[i][0], y1, upper[i][1],
      upper[j][0], y1, upper[j][1],
    );
  }
  if (cap) {
    const cx = upper.reduce((sum, p) => sum + p[0], 0) / n;
    const cz = upper.reduce((sum, p) => sum + p[1], 0) / n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      out.push(cx, y1, cz, upper[j][0], y1, upper[j][1], upper[i][0], y1, upper[i][1]);
    }
  }
  return out;
}

/** A loft through its sections, capped on top. */
function loftGeometry(s: Solid): BufferGeometry {
  const sections = s.sections ?? [];
  const positions = sections.slice(1).flatMap((upper, k) => {
    const lower = sections[k];
    return wallPositions(
      lower.outline,
      upper.outline,
      lower.h,
      upper.h,
      k === sections.length - 2,
    );
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return g;
}

/** One solid as geometry, standing on its base, tagged for the shader. */
function solidGeometry(s: Solid): BufferGeometry {
  const g =
    s.shape === "loft"
      ? loftGeometry(s)
      : s.shape === "lathe"
      ? new LatheGeometry(
          (s.profile ?? []).map(([r, y]) => new Vector2(r, y)),
          s.segments,
        ).toNonIndexed()
      : s.shape === "dome"
      ? new SphereGeometry(
          s.rBottom,
          s.segments,
          6,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        )
          .scale(1, s.h / s.rBottom, 1)
          .toNonIndexed()
      : new CylinderGeometry(s.rTop, s.rBottom, s.h, s.segments, 1)
          .translate(0, s.h / 2, 0)
          .toNonIndexed();
  g.rotateY(s.turn ?? 0).translate(s.x, s.y, s.z);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const n = g.getAttribute("position").count;
  g.setAttribute(
    "aLight",
    new Float32BufferAttribute(
      Array.from({ length: n }, () => s.color.toArray()).flat(),
      3,
    ),
  );
  g.setAttribute(
    "aWindows",
    new Float32BufferAttribute(new Array(n).fill(s.windows ? 1 : 0), 1),
  );
  g.setAttribute(
    "aWash",
    new Float32BufferAttribute(new Array(n).fill(s.wash ?? 0), 1),
  );
  g.setAttribute(
    "aRelit",
    new Float32BufferAttribute(new Array(n).fill(s.relit ? 1 : 0), 1),
  );
  return g;
}

/** A ring of light as an open band. */
function ringGeometry(r: Ring): BufferGeometry {
  const g = r.outline
    ? new BufferGeometry()
        .setAttribute(
          "position",
          new Float32BufferAttribute(
            wallPositions(r.outline, r.outline, -r.h / 2, r.h / 2),
            3,
          ),
        )
        .translate(r.x, r.y, r.z)
    : new CylinderGeometry(r.r, r.r, r.h, 24, 1, true)
        .translate(r.x, r.y, r.z)
        .toNonIndexed();
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const n = g.getAttribute("position").count;
  g.setAttribute(
    "color",
    new Float32BufferAttribute(
      Array.from({ length: n }, () => r.color.toArray()).flat(),
      3,
    ),
  );
  return g;
}

/**
 * The landmarks' round solids, shaded like the city (moonlit facets, lit
 * windows, fog) in one draw, and their rings of light in another. `haze` is
 * how much of the world's fog they take; rings seen from inside, as a
 * stadium's are, need `insideRings`.
 */
export function createSkylineMeshes(
  solids: readonly Solid[],
  rings: readonly Ring[],
  windowLight: string,
  { haze = HAZE, insideRings = false } = {},
) {
  const material = new ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      uBase: { value: palette.night.clone().lerp(palette.dusk, 0.7) },
      uMoon: { value: MOON },
      uMagenta: { value: palette.magenta },
      uMagentaWash: magentaWash,
    },
    vertexShader: /* glsl */ `
      attribute vec3 aLight;
      attribute float aWindows;
      attribute float aWash;
      attribute float aRelit;
      varying vec3 vWorld;
      varying vec3 vLight;
      varying float vWindows;
      varying float vWash;
      varying float vRelit;
      void main() {
        vLight = aLight;
        vWindows = aWindows;
        vWash = aWash;
        vRelit = aRelit;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uMoon, uMagenta;
      uniform float uMagentaWash;
      varying vec3 vWorld;
      varying vec3 vLight;
      varying float vWindows;
      varying float vWash;
      varying float vRelit;
      ${fogChunk}
      ${windowLight}
      const float HAZE = ${haze.toFixed(2)};
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float diffuse = max(dot(n, uMoon), 0.0);
        vec3 col = uBase * (0.55 + 1.1 * diffuse);
        vec3 wash = mix(vLight, uMagenta, vRelit * uMagentaWash);
        col += wash * vWash * (0.35 + 0.25 * max(dot(n, -uMoon), 0.0));
        col += vWindows * windowLight(vWorld, n, vLight);
        col = mix(col, uFogColor, fogAmount(vWorld) * HAZE);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const body = new Mesh(mergeGeometries(solids.map(solidGeometry)), material);
  const light = new Mesh(
    mergeGeometries(rings.map(ringGeometry)),
    // Unfogged: the rings carry the skyline's shape through the haze.
    new MeshBasicMaterial({
      vertexColors: true,
      fog: false,
      side: insideRings ? DoubleSide : FrontSide,
    }),
  );
  return [body, light];
}
