import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import type { Glow } from "./glow-points";
import type { Pool } from "./ground-pools";
import { seededRandom } from "./noise";
import { fogChunk, fogUniforms, MOON, palette } from "./palette";
import { OUTPOST, SITES } from "./route";
import {
  corridorHalfWidth,
  valleyCentre,
  valleyHeight,
  WORLD_BACK,
} from "./terrain";

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
 * Where the hero's camera stands, near enough for every layout: the eye the
 * skyline is kept under the mountains from.
 */
const EYE = new Vector3(0, 16, 0);

/**
 * The share of the rise from a tower's foot to the ridge behind it (as the
 * hero sees it) the tower may fill: the mountains always crest above the
 * skyline.
 */
const SKYLINE = 0.6;

/**
 * The tallest a tower standing at (x, z) on `ground` can be and still sit
 * under the ridge behind it, as the hero's camera sees it.
 */
function underRidge(x: number, z: number, ground: number) {
  const dx = x - EYE.x;
  const dz = z - EYE.z;
  const near = Math.hypot(dx, dz);
  const elevation = (y: number, d: number) => Math.atan2(y - EYE.y, d);
  let crest = -Math.PI / 2;
  for (let d = near + 6; d < 1600; d += 8) {
    const px = EYE.x + (dx / near) * d;
    const pz = EYE.z + (dz / near) * d;
    crest = Math.max(crest, elevation(valleyHeight(px, pz), d));
  }
  const foot = elevation(ground, near);
  const top = foot + (crest - foot) * SKYLINE;
  return EYE.y + near * Math.tan(top) - ground;
}

/**
 * Tower bodies: faceted and moonlit like the terrain, and lit from within
 * near the top in their own light colour, which falls off down the shaft.
 * With `windows`, the faces carry a grid of windows, a scatter of them lit
 * in the tower's light (a few in white), so a block reads as a building.
 */
function bodyMaterial(windows: boolean) {
  return new ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      uBase: { value: palette.night.clone().lerp(palette.dusk, 0.7) },
      uMoon: { value: MOON },
      uWindows: { value: windows ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vLight;
      varying float vHeight;
      void main() {
        vHeight = position.y + 0.5;
        vLight = instanceColor;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uMoon;
      uniform float uWindows;
      varying vec3 vWorld;
      varying vec3 vLight;
      varying float vHeight;
      ${fogChunk}
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float diffuse = max(dot(n, uMoon), 0.0);
        vec3 col = uBase * (0.55 + 1.1 * diffuse);
        col += vLight * pow(vHeight, 7.0) * 0.55 * (1.0 - 0.6 * uWindows);
        if (uWindows > 0.5 && abs(n.y) < 0.5) {
          // Windows 1.7 wide and 2.3 high, laid out on the face's own axes.
          vec2 face = vec2(abs(n.x) > 0.5 ? vWorld.z : vWorld.x, vWorld.y);
          vec2 cell = floor(face / vec2(1.7, 2.3));
          vec2 f = fract(face / vec2(1.7, 2.3));
          float pane = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.75);
          float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float lit = step(0.7, h) * pane * step(0.04, vHeight) * step(vHeight, 0.97);
          vec3 tint = mix(vLight, vec3(0.92, 0.95, 1.0), step(0.9, h) * 0.6);
          col += tint * lit * (0.35 + 0.4 * fract(h * 7.0));
        }
        col = mix(col, uFogColor, fogAmount(vWorld));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Where everything stands, as pure data (unit tested without WebGL): a city
 * of wide towers along the valley's walls and down the opening's canyon,
 * windowed and lit from within, kept under the mountains; slim light masts
 * at the lit sites, the outpost and two gates; and runway lights down the
 * floor. Each emitter also throws a pool of light onto the ground at its foot.
 */
export function layoutStructures() {
  const random = seededRandom(0x11ad);
  /** The city's buildings, windowed; and the masts, which are not. */
  const buildings: Box[] = [];
  const masts: Box[] = [];
  const bands: Box[] = [];
  const glows: Glow[] = [];
  const pools: Pool[] = [];
  const lightOf = () => (random() < 0.62 ? palette.cyan : palette.violet);

  function tower(
    x: number,
    z: number,
    height: number,
    width: number,
    facing: number,
    light: Color,
    building?: { depth: number; underRidge: boolean },
  ) {
    const depth = building?.depth ?? width;
    const ground = Math.min(
      valleyHeight(x - width / 2, z - depth / 2),
      valleyHeight(x + width / 2, z - depth / 2),
      valleyHeight(x - width / 2, z + depth / 2),
      valleyHeight(x + width / 2, z + depth / 2),
      valleyHeight(x, z),
    );
    if (building?.underRidge) {
      height = Math.max(8, Math.min(height, underRidge(x, z, ground)));
    }
    const top = ground + height;
    (building ? buildings : masts).push({
      x,
      y: ground - 2 + (height + 2) / 2,
      z,
      w: width,
      h: height + 2,
      d: depth,
      color: light,
    });
    // A vertical seam of light on the face looking into the valley.
    bands.push({
      x: x + (facing * width) / 2,
      y: ground + height * 0.5,
      z,
      w: 0.16,
      h: height * 0.78,
      d: Math.max(0.4, depth * 0.22),
      color: light,
    });
    // Rings of light near the top.
    const rings = 1 + Math.floor(random() * 3);
    for (let r = 0; r < rings; r++) {
      bands.push({
        x,
        y: top - 1.2 - r * (1.4 + random() * 1.6),
        z,
        w: width + 0.22,
        h: 0.28,
        d: depth + 0.22,
        color: light,
      });
    }
    glows.push({
      x,
      y: top + 0.9,
      z,
      color: light,
      size: 3.2 + random() * 2.5,
      seed: random(),
    });
    // Long in z: seen at a grazing angle, a round pool would read as a line.
    // A mast's width, even under a building: any wider floods the floor.
    const spill = Math.min(width, 3.8);
    pools.push({
      x,
      y: valleyHeight(x, z),
      z,
      width: spill * 6,
      depth: spill * 14,
      color: light,
    });
  }

  // The city along both walls, from just behind the plate to the far end:
  // wide and deep, one in five a tall one, every one under the ridge behind.
  for (let i = 0; i < 46; i++) {
    const z = -110 - i * 19 - random() * 12;
    const side = i % 2 === 0 ? -1 : 1;
    const w = corridorHalfWidth(z);
    const x = valleyCentre(z) + side * (w - 6 + random() * 46);
    const tall = random() < 0.2;
    const height = tall ? 50 + random() * 22 : 12 + random() * 34;
    const width = 6 + random() * 8;
    tower(x, z, height, width, -side, lightOf(), {
      depth: 5 + random() * 7,
      underRidge: true,
    });
  }

  // Gates: twin pylons either side of the floor, far enough out to clear the
  // sky above the plate. No bar spans them: a line across the sky is a stroke.
  for (const [z, color] of [
    [-540, palette.cyan],
    [-800, palette.violet],
  ] as const) {
    const c = valleyCentre(z);
    const half = corridorHalfWidth(z) + 2;
    for (const side of [-1, 1]) {
      tower(c + side * half, z, 36, 2.8, -side, color);
    }
  }

  // Runway lights down the floor, either side of the line the flight follows,
  // and down the canyon it comes in by.
  const runway = [];
  for (let z = -112; z > -1100; z -= 7) runway.push(z);
  for (let z = 200; z < WORLD_BACK; z += 7) runway.push(z);
  for (const z of runway) {
    const c = valleyCentre(z);
    const far = -z > 300;
    for (const side of [-1, 1]) {
      const x = c + side * 14;
      glows.push({
        x,
        y: valleyHeight(x, z) + 0.35,
        z,
        color:
          Math.round(Math.abs(z) / 7) % 6 === 0 ? palette.violet : palette.cyan,
        size: far ? 1.6 : 1.1,
        seed: random(),
      });
    }
  }

  // The canyon the opening flight comes down (behind the settled view): the
  // city close along both walls, so it streams past either side. Last, so
  // the settled view's random draws are unchanged.
  for (let i = 0; i < 26; i++) {
    const z = 150 + i * 21 + random() * 10;
    const side = i % 2 === 0 ? -1 : 1;
    const w = corridorHalfWidth(z);
    const x = valleyCentre(z) + side * (w - 4 + random() * 22);
    tower(x, z, 14 + random() * 30, 5 + random() * 7, -side, lightOf(), {
      depth: 5 + random() * 6,
      underRidge: false,
    });
  }

  // The runway carried on from the plate towards the camera, each light
  // pooling on the ground: lines of light leading up out of the foreground
  // to the name. Last, so the random draws above are unchanged.
  for (let z = -77; z <= -14; z += 7) {
    for (const side of [-1, 1]) {
      const x = side * 14;
      const color =
        Math.round(Math.abs(z) / 7) % 6 === 0 ? palette.violet : palette.cyan;
      const y = valleyHeight(x, z);
      glows.push({ x, y: y + 0.35, z, color, size: 0.9, seed: random() });
      pools.push({ x, y, z, width: 3, depth: 7, color });
    }
  }

  // The scroll route's lit sites: a tall mast at each, its light at the top
  // (the scene brightens it as the site's panel enters), and the outpost at
  // the route's end, a ring of masts round its light. Last, so the random
  // draws above are unchanged.
  for (const site of SITES) {
    const { x, y, z } = site.position;
    const light = palette[site.light];
    const ground = valleyHeight(x, z);
    tower(x, z, y - ground - 2.5, 3.4, -site.side, light);
    pools.push({ x, y: ground, z, width: 34, depth: 60, color: light });
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const x = OUTPOST.x + Math.sin(a) * 16;
    const z = OUTPOST.z + Math.cos(a) * 16;
    const light = i % 2 ? palette.violet : palette.cyan;
    tower(x, z, 16 + random() * 14, 2.2, x < OUTPOST.x ? 1 : -1, light);
  }
  pools.push({
    x: OUTPOST.x,
    y: valleyHeight(OUTPOST.x, OUTPOST.z),
    z: OUTPOST.z,
    width: 50,
    depth: 80,
    color: palette.cyan,
  });

  return { buildings, masts, bands, glows, pools };
}

/** The structures as meshes, one instanced draw per kind of box. */
export function createStructures() {
  const { buildings, masts, bands, glows, pools } = layoutStructures();
  const geometry = new BoxGeometry(1, 1, 1);
  const m = new Matrix4();
  const q = new Quaternion();
  const meshes = (
    [
      [bodyMaterial(true), buildings],
      [bodyMaterial(false), masts],
      [new MeshBasicMaterial(), bands],
    ] as const
  ).map(([material, boxes]) => {
    const mesh = new InstancedMesh(geometry, material, boxes.length);
    boxes.forEach((b, i) => {
      mesh.setMatrixAt(
        i,
        m.compose(new Vector3(b.x, b.y, b.z), q, new Vector3(b.w, b.h, b.d)),
      );
      mesh.setColorAt(i, b.color);
    });
    mesh.computeBoundingSphere();
    return mesh;
  });

  return { meshes, glows, pools };
}
