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
import { createBalls, createTrophies, layoutLandmarks } from "./landmarks";
import { seededRandom } from "./noise";
import { FOG_DENSITY, fogChunk, fogUniforms, MOON, palette } from "./palette";
import { OUTPOST, SITES } from "./route";
import type { SharedUniforms } from "./shared";
import {
  createSkylineMeshes,
  DOWNTOWN,
  HAZE,
  layoutSkyline,
  type Box,
} from "./skyline";
import {
  corridorHalfWidth,
  valleyCentre,
  valleyHeight,
  WORLD_BACK,
} from "./terrain";
import { createPortals, createShields } from "./shield";
import { createVeils } from "./veil";

export type { Box };

/**
 * The heights the hero's camera stands at across layouts (it rises with the
 * headline's place on screen): the eyes the skyline is kept under the
 * mountains from.
 */
const EYES = [11, 16, 22];

/**
 * The share of the rise from a tower's foot to the ridge behind it (as the
 * hero sees it) the tower may fill: the mountains always crest above the
 * skyline.
 */
const SKYLINE = 0.85;

/**
 * How far the hero can see: past this the fog hides 99% of anything, so a
 * building beyond it needn't keep under the ridge (the Outpost's district).
 */
export const HERO_SIGHT = Math.sqrt(Math.log(100)) / FOG_DENSITY;

/**
 * The street of towers along the runway: where it starts (behind the plate)
 * and ends (short of the Outpost's district), how far off the valley's centre
 * line its frontage stands (the runway's lights are 14 off it), and the plaza
 * kept open round each lit site, from ahead of where the camera stops to
 * frame it (80 short of it) to past it, and the clearance kept either side of
 * the hero's line of sight to the first site.
 */
const STREET = {
  start: -120,
  end: -960,
  setback: 20,
  plaza: { before: 110, after: 30 },
  sightline: 14,
};

/**
 * The tallest a tower standing at (x, z) on `ground` can be and still sit
 * under the ridge behind it, from every eye the hero's camera might have.
 */
function underRidge(x: number, z: number, ground: number) {
  const near = Math.hypot(x, z);
  return Math.min(
    ...EYES.map((eye) => {
      const elevation = (y: number, d: number) => Math.atan2(y - eye, d);
      let crest = -Math.PI / 2;
      for (let d = near + 6; d < 1600; d += 8) {
        const px = (x / near) * d;
        const pz = (z / near) * d;
        crest = Math.max(crest, elevation(valleyHeight(px, pz), d));
      }
      const foot = elevation(ground, near);
      const top = foot + (crest - foot) * SKYLINE;
      return eye + near * Math.tan(top) - ground;
    }),
  );
}

/**
 * Lit windows on a vertical face, 1.7 wide and 2.3 high on the face's own
 * axes: a scatter of them lit in the building's light, a few in white.
 */
const WINDOW_LIGHT = /* glsl */ `
  vec3 windowLight(vec3 world, vec3 n, vec3 light) {
    if (abs(n.y) >= 0.5) return vec3(0.0);
    vec2 face = vec2(abs(n.x) > 0.5 ? world.z : world.x, world.y);
    vec2 cell = floor(face / vec2(1.7, 2.3));
    vec2 f = fract(face / vec2(1.7, 2.3));
    float pane = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.75);
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 tint = mix(light, vec3(0.92, 0.95, 1.0), step(0.9, h) * 0.6);
    return tint * step(0.7, h) * pane * (0.35 + 0.4 * fract(h * 7.0));
  }
`;

/**
 * Tower bodies: faceted and moonlit like the terrain, and lit from within
 * near the top in their own light colour, which falls off down the shaft.
 * With `windows`, the faces carry the city's lit windows, so a block reads as
 * a building; `dark` sets it in near-black, as TD Centre's towers are; `haze`
 * is how much of the world's fog it takes.
 */
function bodyMaterial({ windows = false, dark = false, haze = 1 } = {}) {
  return new ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      uBase: {
        value: dark
          ? palette.night.clone().multiplyScalar(0.55)
          : palette.night.clone().lerp(palette.dusk, 0.7),
      },
      uMoon: { value: MOON },
      uWindows: { value: windows ? 1 : 0 },
      uHaze: { value: haze },
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
      uniform float uWindows, uHaze;
      varying vec3 vWorld;
      varying vec3 vLight;
      varying float vHeight;
      ${fogChunk}
      ${WINDOW_LIGHT}
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float diffuse = max(dot(n, uMoon), 0.0);
        vec3 col = uBase * (0.55 + 1.1 * diffuse);
        col += vLight * pow(vHeight, 7.0) * 0.55 * (1.0 - 0.6 * uWindows);
        col += uWindows * windowLight(vWorld, n, vLight)
          * step(0.04, vHeight) * step(vHeight, 0.97);
        col = mix(col, uFogColor, fogAmount(vWorld) * uHaze);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Where everything stands, as pure data (unit tested without WebGL): a city
 * of tall, wide towers along the valley's walls and down the opening's
 * canyon, windowed and lit from within, kept under the mountains; Toronto's
 * skyline on the right-hand wall (skyline.ts), which the city makes way for;
 * a financial district at the Outpost, where the route ends; a landmark at
 * each lit site (landmarks.ts); slim light masts at the two gates; and runway
 * lights down the floor. Each emitter also throws a pool of light onto the
 * ground at its foot.
 */
export function layoutStructures() {
  const random = seededRandom(0x11ad);
  /**
   * The city's buildings, windowed (the district's dark-glass ones apart);
   * and the masts, which are not.
   */
  const buildings: Box[] = [];
  const darkBuildings: Box[] = [];
  const masts: Box[] = [];
  const bands: Box[] = [];
  const glows: Glow[] = [];
  const pools: Pool[] = [];
  const lightOf = () => (random() < 0.62 ? palette.cyan : palette.violet);
  const landmarks = layoutLandmarks();
  /** True if a w by d footprint at (x, z) meets a landmark's, with a gap. */
  const onLandmark = (x: number, z: number, w: number, d: number) =>
    landmarks.bounds.some(
      (b) =>
        Math.abs(x - b.x) < (w + b.w) / 2 + 2 &&
        Math.abs(z - b.z) < (d + b.d) / 2 + 2,
    );

  function tower(
    x: number,
    z: number,
    height: number,
    width: number,
    facing: number,
    light: Color,
    building?: {
      depth: number;
      underRidge: boolean;
      dark?: boolean;
      pool?: boolean;
    },
  ) {
    const depth = building?.depth ?? width;
    const ground = Math.min(
      valleyHeight(x - width / 2, z - depth / 2),
      valleyHeight(x + width / 2, z - depth / 2),
      valleyHeight(x - width / 2, z + depth / 2),
      valleyHeight(x + width / 2, z + depth / 2),
      valleyHeight(x, z),
    );
    if (building?.underRidge && Math.hypot(x, z) < HERO_SIGHT) {
      height = Math.max(8, Math.min(height, underRidge(x, z, ground)));
    }
    const top = ground + height;
    const box = {
      x,
      y: ground - 2 + (height + 2) / 2,
      z,
      w: width,
      h: height + 2,
      d: depth,
      color: light,
    };
    (building?.dark ? darkBuildings : building ? buildings : masts).push(box);
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
    if (building?.pool === false) return box;
    pools.push({
      x,
      y: valleyHeight(x, z),
      z,
      width: spill * 6,
      depth: spill * 14,
      color: light,
    });
    return box;
  }

  // The city along both walls, from just behind the plate to the far end:
  // wide and deep, one in five a tall one, every one under the ridge behind,
  // making way for downtown and the landmarks. (Its draws are made either
  // way, so the rest of the city stands where it did.)
  for (let i = 0; i < 46; i++) {
    const z = -110 - i * 19 - random() * 12;
    const side = i % 2 === 0 ? -1 : 1;
    const w = corridorHalfWidth(z);
    const x = valleyCentre(z) + side * (w - 6 + random() * 46);
    const tall = random() < 0.2;
    const height = tall ? 58 + random() * 28 : 18 + random() * 40;
    const width = 6 + random() * 8;
    const light = lightOf();
    const depth = 5 + random() * 7;
    const downtown =
      side === DOWNTOWN.side && z < DOWNTOWN.near && z > DOWNTOWN.far;
    if (downtown || onLandmark(x, z, width, depth)) continue;
    tower(x, z, height, width, -side, light, { depth, underRidge: true });
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

  // The scroll route's lit sites: a landmark at each, carrying the site's
  // light (the scene brightens it as the site's panel enters), and a pool of
  // that light round it.
  for (const site of SITES) {
    const { x, z } = site.position;
    const y = valleyHeight(x, z);
    pools.push({ x, y, z, width: 34, depth: 60, color: palette[site.light] });
  }

  // The Outpost at the route's end: a financial district on the valley floor
  // past its light, three rows climbing from the front to the tallest at the
  // back, three in dark glass, the tallest crowned. Each is [along (from the
  // Outpost, down the valley), across (from the valley's centre line),
  // height, width, depth, light, dark glass]. The hero can't see this far,
  // so it may rise over the ridge; never over the CN Tower.
  const { cyan, violet } = palette;
  const plan = [
    [-45, -1, 26, 10, 8, violet, false],
    [-45, 12, 34, 9, 9, cyan, false],
    [-45, 25, 22, 11, 8, violet, false],
    [-75, -2, 44, 10, 9, cyan, true],
    [-75, 10, 58, 11, 10, cyan, false],
    [-75, 21, 48, 9, 8, cyan, true],
    [-75, 30, 36, 8, 8, violet, false],
    [-110, 8, 62, 10, 10, violet, false],
    [-110, 19, 80, 11, 11, cyan, false],
    [-110, 29, 66, 9, 9, cyan, true],
  ] as const;
  const district: Box[] = [];
  for (const [along, across, height, width, depth, light, dark] of plan) {
    const z = OUTPOST.z + along;
    const box = tower(
      valleyCentre(z) + across,
      z,
      height,
      width,
      -Math.sign(across),
      light,
      {
        depth,
        underRidge: true,
        dark,
        pool: false,
      },
    );
    district.push(box);
  }
  // The tallest gets a stepped crown, two setbacks on its roof.
  const tallest = district.reduce((a, b) =>
    b.y + b.h / 2 > a.y + a.h / 2 ? b : a,
  );
  const roof = tallest.y + tallest.h / 2;
  const crown = [
    { ...tallest, y: roof + 2, w: tallest.w * 0.7, h: 4, d: tallest.d * 0.65 },
    {
      ...tallest,
      y: roof + 5.25,
      w: tallest.w * 0.4,
      h: 2.5,
      d: tallest.d * 0.35,
    },
  ];
  buildings.push(...crown);
  district.push(...crown);
  pools.push({
    x: OUTPOST.x,
    y: valleyHeight(OUTPOST.x, OUTPOST.z),
    z: OUTPOST.z,
    width: 70,
    depth: 90,
    color: cyan,
  });

  // A street of towers lining the runway on both sides, set back a pavement
  // from its lights, broken by cross streets, so the floor reads as a city
  // street running down to downtown. Each lit site stands in a plaza open to
  // the street the camera comes down to frame it, and the street opens on the
  // hero's line of sight to the first, the beacon the arrival lights, as the
  // valley bends; it makes way for downtown as the city does. Last, so the
  // random draws above are unchanged.
  const beacon = SITES[0].position;
  /** True if a footprint `size` across at (x, z) stands between the hero and the beacon. */
  const hidesBeacon = (x: number, z: number, size: number) =>
    z > beacon.z &&
    // The footprint's distance, in plan, from the line from the hero's camera
    // (at the origin) to the beacon.
    Math.abs(x * beacon.z - z * beacon.x) / Math.hypot(beacon.x, beacon.z) <
      size / 2 + STREET.sightline;
  for (const side of [-1, 1]) {
    for (let z = STREET.start; z > STREET.end; z -= 10 + random() * 6) {
      const crossStreet = random() < 0.18;
      const width = 6 + random() * 5;
      const depth = 6 + random() * 4;
      const tall = random() < 0.15;
      const height = tall ? 40 + random() * 16 : 14 + random() * 22;
      const x =
        valleyCentre(z) + side * (STREET.setback + width / 2 + random() * 5);
      const light = lightOf();
      const plaza = SITES.some(
        (s) =>
          s.side === side &&
          z < s.position.z + STREET.plaza.before &&
          z > s.position.z - STREET.plaza.after,
      );
      const downtown =
        side === DOWNTOWN.side && z < DOWNTOWN.near && z > DOWNTOWN.far;
      if (crossStreet || plaza || downtown) continue;
      if (onLandmark(x, z, width, depth)) continue;
      if (hidesBeacon(x, z, Math.hypot(width, depth))) continue;
      tower(x, z, height, width, -side, light, { depth, underRidge: true });
    }
  }

  const skyline = layoutSkyline();
  return {
    buildings,
    darkBuildings,
    district,
    masts,
    bands,
    landmarks,
    glows: [...glows, ...landmarks.glows, ...skyline.glows],
    pools: [...pools, ...skyline.pools],
    skyline,
  };
}

/**
 * The structures as meshes, one instanced draw per kind of box; the
 * landmarks' shields and trophies move with the world's clock.
 */
export function createStructures(shared: SharedUniforms) {
  const {
    buildings,
    darkBuildings,
    masts,
    bands,
    landmarks,
    glows,
    pools,
    skyline,
  } = layoutStructures();
  const geometry = new BoxGeometry(1, 1, 1);
  const m = new Matrix4();
  const q = new Quaternion();
  const meshes = (
    [
      [bodyMaterial({ windows: true }), [...buildings, ...landmarks.rooms]],
      [bodyMaterial({ windows: true, dark: true }), darkBuildings],
      [bodyMaterial({ windows: true, haze: HAZE }), skyline.towers],
      [
        bodyMaterial({ windows: true, dark: true, haze: HAZE }),
        skyline.darkTowers,
      ],
      [bodyMaterial(), [...masts, ...landmarks.bodies]],
      [new MeshBasicMaterial(), [...bands, ...landmarks.bands]],
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

  return {
    meshes: [
      ...meshes,
      ...createSkylineMeshes(skyline.solids, skyline.rings, WINDOW_LIGHT),
      ...createSkylineMeshes(landmarks.solids, landmarks.rings, WINDOW_LIGHT, {
        haze: 1,
        insideRings: true,
      }),
      createVeils(landmarks.veils),
      createShields(landmarks.shields, shared),
      createPortals(landmarks.portals),
      ...createTrophies(landmarks.trophies, shared),
      ...createBalls(landmarks.balls),
    ],
    glows,
    pools,
  };
}
