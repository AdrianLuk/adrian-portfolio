import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
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
 * stepped crown, First Canadian Place). Scaled like a postcard, not a map.
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

/**
 * A round solid standing on its base: a cylinder or cone (a frustum), a
 * shallow dome, or a lathe, its `profile` ([radius, height] pairs) turned
 * round its axis. `windows` lays the city's lit windows on it; `wash` floods
 * it with its light, as the CN Tower's shaft is lit at night.
 */
export type Solid = {
  shape: "frustum" | "dome" | "lathe";
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
  profile?: readonly (readonly [number, number])[];
};

/** A ring of light round a solid: the CN Tower's pods, the dome's rim. */
export type Ring = {
  x: number;
  y: number;
  z: number;
  r: number;
  h: number;
  color: Color;
};

/** The stretch of the valley's right side the skyline takes over from the city. */
export const DOWNTOWN = { side: 1, near: -455, far: -640 } as const;

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

  // The CN Tower: a tapering hexagonal shaft on three legs, washed in its
  // light, the main pod three-fifths of the way up, the SkyPod above it, and
  // the antenna. Stouter than life, so it reads from the far end of the
  // valley.
  const cn = onWall(44, -560);
  const H = CN_TOWER_HEIGHT;
  /** The main pod's radius, and the shaft's at its foot and at the pod. */
  const POD = 7.2;
  const FOOT = 4.8;
  const NECK = 1.7;
  const podY = cn.ground + H * 0.6;
  const skyY = cn.ground + H * 0.76;
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
  solids.push(
    frustum(cn.ground - 1, FOOT, NECK, H * 0.6 + 1, 6, violet, { wash: 0.85 }),
    frustum(podY, NECK, NECK * 0.75, H * 0.16, 6, violet, { wash: 0.85 }),
    // The main pod: a sloping underside, the observation deck, a low cap.
    frustum(podY - 4.2, NECK, POD, 4.2, 24, cyan, { wash: 0.3 }),
    frustum(podY, POD, POD, 4.4, 24, cyan, { windows: true }),
    frustum(podY + 4.4, POD, POD * 0.45, 2, 24, cyan, { wash: 0.3 }),
    frustum(skyY, 2.5, 2.5, 2.4, 12, cyan, { windows: true }),
    frustum(skyY + 2.4, 0.9, 0.22, H * 0.22, 6, white, { wash: 0.5 }),
  );
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    solids.push({
      shape: "frustum",
      x: cn.x + Math.cos(a) * FOOT,
      y: cn.ground - 1,
      z: cn.z + Math.sin(a) * FOOT,
      rBottom: 2.8,
      rTop: 0.4,
      h: H * 0.32,
      segments: 4,
      color: violet,
      wash: 0.6,
    });
  }
  rings.push(
    { ...at(cn, podY + 1.8), r: POD + 0.15, h: 0.7, color: cyan },
    { ...at(cn, podY - 0.3), r: POD + 0.05, h: 0.35, color: violet },
    { ...at(cn, skyY + 1.1), r: 2.65, h: 0.45, color: cyan },
  );
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    glows.push({
      x: cn.x + Math.cos(a) * (POD + 0.3),
      y: podY + 2,
      z: cn.z + Math.sin(a) * (POD + 0.3),
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

  // The Rogers Centre: a low drum under a ribbed dome, left of the tower as
  // the hero sees it (its west, from the Islands), about life size beside it.
  const dome = onWall(40, -603);
  const R = 20;
  const DRUM = 9;
  const ROOF = 8.5;
  solids.push(
    {
      shape: "frustum",
      ...at(dome, dome.ground - 2),
      rBottom: R,
      rTop: R,
      h: DRUM + 2,
      segments: 32,
      color: cyan,
      windows: true,
    },
    {
      shape: "dome",
      ...at(dome, dome.ground + DRUM),
      rBottom: R,
      rTop: R,
      h: ROOF,
      segments: 16,
      color: cyan,
      wash: 0.25,
    },
  );
  rings.push({
    ...at(dome, dome.ground + DRUM - 0.2),
    r: R + 0.15,
    h: 0.6,
    color: cyan,
  });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    glows.push({
      x: dome.x + Math.cos(a) * (R + 0.5),
      y: dome.ground + DRUM + 0.4,
      z: dome.z + Math.sin(a) * (R + 0.5),
      color: i % 2 ? violet : cyan,
      size: 2.6,
      seed: i / 18,
    });
  }
  pools.push({
    x: dome.x,
    y: dome.ground,
    z: dome.z,
    width: 70,
    depth: 100,
    color: cyan,
  });
  bounds.push(boxAround(dome, R, DRUM + ROOF));

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
  core(36, -530, 34, 9, 9, violet);
  core(74, -505, 38, 8, 8, cyan);
  core(84, -590, 30, 10, 8, violet);

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

/** One solid as geometry, standing on its base, tagged for the shader. */
function solidGeometry(s: Solid): BufferGeometry {
  const g =
    s.shape === "lathe"
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
  g.translate(s.x, s.y, s.z);
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
  return g;
}

/** A ring of light as an open band. */
function ringGeometry(r: Ring): BufferGeometry {
  const g = new CylinderGeometry(r.r, r.r, r.h, 24, 1, true)
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
    },
    vertexShader: /* glsl */ `
      attribute vec3 aLight;
      attribute float aWindows;
      attribute float aWash;
      varying vec3 vWorld;
      varying vec3 vLight;
      varying float vWindows;
      varying float vWash;
      void main() {
        vLight = aLight;
        vWindows = aWindows;
        vWash = aWash;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uMoon;
      varying vec3 vWorld;
      varying vec3 vLight;
      varying float vWindows;
      varying float vWash;
      ${fogChunk}
      ${windowLight}
      const float HAZE = ${haze.toFixed(2)};
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float diffuse = max(dot(n, uMoon), 0.0);
        vec3 col = uBase * (0.55 + 1.1 * diffuse);
        col += vLight * vWash * (0.35 + 0.25 * max(dot(n, -uMoon), 0.0));
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
