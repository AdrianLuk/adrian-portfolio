import { Color, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from "three";
import { fogChunk, fogUniforms, MOON, palette } from "./palette";
import type { SharedUniforms } from "./shared";
import { magentaWash, type layoutSkyline } from "./skyline";
import {
  bayWidth,
  corridorHalfWidth,
  type Harbour,
  valleyCentre,
} from "./terrain";

/**
 * A harbour's water (./terrain's HARBOURS): a dark, moonlit surface that its
 * city's lights streak across, as Toronto's do across its harbour at night,
 * and Hong Kong's across Victoria Harbour. Its reflections are drawn, not
 * mirrored: each of a few points of light (up the CN Tower, along the Rogers
 * Centre's rim, atop the financial core; Hong Kong's landmarks' tips) shows
 * where the rippled water would throw it back to the camera, so each
 * harbour's water costs one draw and no second render of the world.
 */

/** A point of light the water throws back. */
export type Reflected = {
  x: number;
  y: number;
  z: number;
  color: Color;
  /** How bright its reflection burns. */
  power: number;
  /** True for the CN Tower's wash, which turns magenta at the Skyline. */
  relit: boolean;
};

/** The most points of light the water's shader takes. */
export const MAX_REFLECTED = 24;

/** The points of light the Harbour throws back, from the skyline's layout. */
export function reflectedLights(
  skyline: ReturnType<typeof layoutSkyline>,
): Reflected[] {
  const { cnTower: cn, rogersCentre: dome } = skyline;
  const lights: Reflected[] = [];
  // Up the CN Tower's washed shaft to its pod and tip.
  for (const k of [0.15, 0.3, 0.45]) {
    lights.push({
      x: cn.x,
      y: cn.foot + (cn.pod - cn.foot) * k,
      z: cn.z,
      color: palette.violet,
      power: 0.55,
      relit: true,
    });
  }
  lights.push(
    { x: cn.x, y: cn.pod, z: cn.z, color: palette.cyan, power: 0.9, relit: false },
    { x: cn.x, y: cn.tip, z: cn.z, color: palette.violet, power: 0.7, relit: true },
  );
  // Round the Rogers Centre's rim.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    lights.push({
      x: dome.x + Math.cos(a) * dome.r,
      y: dome.foot + 7.5,
      z: dome.z + Math.sin(a) * dome.r,
      color: palette.cyan,
      power: 0.5,
      relit: false,
    });
  }
  // The financial core's crowns, the tallest first.
  const tops = [...skyline.towers, ...skyline.darkTowers]
    .map((b) => ({ ...b, top: b.y + b.h / 2 }))
    .sort((a, b) => b.top - a.top);
  for (const b of tops) {
    if (lights.length >= MAX_REFLECTED) break;
    lights.push({ x: b.x, y: b.top, z: b.z, color: b.color, power: 0.6, relit: false });
  }
  return lights.slice(0, MAX_REFLECTED);
}

/** A harbour's extent in plan, sampled down its length: x across, z down. */
function extent(harbour: Harbour) {
  let minX = Infinity;
  let maxX = -Infinity;
  for (let z = harbour.near; z >= harbour.far; z -= 5) {
    const c = valleyCentre(z);
    minX = Math.min(minX, c - corridorHalfWidth(z) - bayWidth(z, harbour));
    maxX = Math.max(maxX, c + harbour.shore + 2);
  }
  return { minX, maxX, near: harbour.near + 2, far: harbour.far - 2 };
}

/**
 * A harbour's water as a mesh: a flat sheet at its level over its whole
 * extent, throwing back `lights`. The ground stands above it everywhere but
 * over the basin, so the depth test cuts it to the harbour's shape.
 */
export function createHarbour(
  shared: SharedUniforms,
  harbour: Harbour,
  lights: Reflected[],
) {
  const { minX, maxX, near, far } = extent(harbour);
  const width = maxX - minX;
  const depth = near - far;
  const geometry = new PlaneGeometry(width, depth, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(minX + width / 2, harbour.level, far + depth / 2);

  const padded = [...lights];
  while (padded.length < MAX_REFLECTED) {
    padded.push({ ...lights[0], power: 0, relit: false });
  }
  const material = new ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      uTime: shared.uTime,
      uDeep: { value: palette.night.clone().multiplyScalar(0.7) },
      uSky: { value: palette.fog.clone().lerp(palette.dusk, 0.3) },
      uMoon: { value: MOON },
      uMagenta: { value: palette.magenta },
      uMagentaWash: magentaWash,
      uLights: { value: padded.map((l) => new Vector3(l.x, l.y, l.z)) },
      uColors: { value: padded.map((l) => l.color) },
      uPowers: { value: padded.map((l) => l.power) },
      uRelit: { value: padded.map((l) => (l.relit ? 1 : 0)) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      #define LIGHTS ${MAX_REFLECTED}
      uniform float uTime, uMagentaWash;
      uniform vec3 uDeep, uSky, uMoon, uMagenta;
      uniform vec3 uLights[LIGHTS];
      uniform vec3 uColors[LIGHTS];
      uniform float uPowers[LIGHTS];
      uniform float uRelit[LIGHTS];
      varying vec3 vWorld;
      ${fogChunk}
      void main() {
        vec3 toCamera = normalize(cameraPosition - vWorld);
        // Ripples: a few slow swells crossing, which break each reflection
        // into a shimmering streak towards the camera.
        vec2 p = vWorld.xz;
        float t = uTime;
        vec2 slope = vec2(
          0.5 * sin(p.x * 0.31 + t * 0.6) + 0.3 * sin(p.x * 0.83 - p.y * 0.41 + t * 1.1),
          0.5 * sin(p.y * 0.47 + t * 0.8) + 0.3 * sin(p.y * 1.27 + p.x * 0.29 - t * 0.9)
        );
        vec3 n = normalize(vec3(slope.x * 0.05, 1.0, slope.y * 0.05));
        vec3 r = reflect(-toCamera, n);
        float fresnel = pow(1.0 - max(toCamera.y, 0.0), 4.0);
        vec3 col = mix(uDeep, uSky, 0.12 + 0.55 * fresnel);
        // The moon's glint.
        col += vec3(0.5, 0.55, 0.7) * pow(max(dot(r, uMoon), 0.0), 220.0) * 0.4;
        for (int i = 0; i < LIGHTS; i++) {
          vec3 toLight = normalize(uLights[i] - vWorld);
          float a = max(dot(r, toLight), 0.0);
          vec3 c = mix(uColors[i], uMagenta, uRelit[i] * uMagentaWash);
          col += c * uPowers[i] * (pow(a, 900.0) * 1.3 + pow(a, 90.0) * 0.05);
        }
        col = mix(col, uFogColor, fogAmount(vWorld));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  return new Mesh(geometry, material);
}
