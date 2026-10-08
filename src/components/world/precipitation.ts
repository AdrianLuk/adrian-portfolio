import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import { seededRandom } from "./noise";
import { fogChunk, fogUniforms, palette } from "./palette";
import type { SharedUniforms } from "./shared";

/**
 * The falling field is a box that travels with the camera: every flake or
 * drop wraps within it, so the camera can fly the whole valley through the
 * same few thousand, and fades out towards its walls so none pops in.
 */
const wrapChunk = /* glsl */ `
  uniform vec3 uBox;
  vec3 wrapAroundCamera(vec3 p) {
    return cameraPosition + mod(p - cameraPosition, uBox) - uBox * 0.5;
  }
  float boxFade(vec3 world) {
    vec3 edge = abs(world - cameraPosition) / (uBox * 0.5);
    return 1.0 - smoothstep(0.7, 1.0, max(max(edge.x, edge.y), edge.z));
  }
`;

const SNOW_BOX = new Vector3(110, 50, 110);
const RAIN_BOX = new Vector3(110, 52, 110);

/**
 * Snow: soft flakes, slow and swaying, cold white with a breath of cyan,
 * sized in world units (and capped, so one by the lens never blots the copy).
 */
function createSnow(count: number, shared: SharedUniforms) {
  const random = seededRandom(0x5e0f);
  const positions: number[] = [];
  const sizes: number[] = [];
  const seeds: number[] = [];
  for (let i = 0; i < count; i++) {
    positions.push(
      random() * SNOW_BOX.x,
      random() * SNOW_BOX.y,
      random() * SNOW_BOX.z,
    );
    sizes.push(0.22 + random() * 0.3);
    seeds.push(random());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      ...shared,
      ...fogUniforms(),
      uBox: { value: SNOW_BOX },
      uFade: { value: 1 },
      uViewportHeight: { value: 800 },
      uColor: { value: palette.ink.clone().lerp(palette.cyan, 0.12) },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uViewportHeight;
      varying float vAlpha;
      ${fogChunk}
      ${wrapChunk}
      void main() {
        vec3 p = position;
        p.y -= uTime * (1.3 + aSeed * 1.1);
        // A light wind down the valley, and each flake's own sway.
        p.x += uTime * 0.4 + sin(uTime * (0.35 + aSeed * 0.5) + aSeed * 31.0) * 1.3;
        p.z += cos(uTime * (0.3 + aSeed * 0.4) + aSeed * 17.0) * 1.3;
        vec3 world = wrapAroundCamera(p);
        vec4 mv = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        float focal = projectionMatrix[1][1] * 0.5 * uViewportHeight;
        gl_PointSize = clamp(aSize * focal / dist, 1.5, 7.0) * uPixelRatio;
        vAlpha = boxFade(world) * smoothstep(2.0, 9.0, dist) * (1.0 - fogAmount(world));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFade;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float flake = pow(1.0 - d, 1.6);
        gl_FragColor = vec4(uColor * flake * vAlpha * 0.85 * uFade, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return { object: points, material };
}

/**
 * Rain: thin streaks, fast and slanting a little with the wind, each a line
 * from its head up to a tail that fades out, in the sky's cold cyan.
 */
function createRain(count: number, shared: SharedUniforms) {
  const random = seededRandom(0x7a17);
  const positions: number[] = [];
  const tails: number[] = [];
  const seeds: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = random() * RAIN_BOX.x;
    const y = random() * RAIN_BOX.y;
    const z = random() * RAIN_BOX.z;
    const seed = random();
    // Head and tail share the drop's position; the shader draws the streak.
    positions.push(x, y, z, x, y, z);
    tails.push(0, 1);
    seeds.push(seed, seed);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aTail", new Float32BufferAttribute(tails, 1));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      ...shared,
      ...fogUniforms(),
      uBox: { value: RAIN_BOX },
      uFade: { value: 1 },
      uColor: { value: palette.cyan.clone().lerp(palette.ink, 0.45) },
    },
    vertexShader: /* glsl */ `
      attribute float aTail;
      attribute float aSeed;
      uniform float uTime;
      varying float vAlpha;
      ${fogChunk}
      ${wrapChunk}
      const vec3 FALL = normalize(vec3(0.14, -1.0, 0.05));
      void main() {
        float speed = 34.0 + aSeed * 14.0;
        vec3 world = wrapAroundCamera(position + FALL * uTime * speed);
        float fade = boxFade(world) * (1.0 - fogAmount(world));
        // The tail trails back up the drop's path.
        world -= FALL * aTail * (1.6 + aSeed * 1.4);
        vec4 mv = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mv;
        vAlpha = fade * smoothstep(3.0, 12.0, -mv.z) * (1.0 - aTail);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFade;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(uColor * vAlpha * 0.4 * uFade, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const lines = new LineSegments(geometry, material);
  lines.frustumCulled = false;
  return { object: lines, material };
}

/** Snow or rain falling round the camera, `count` flakes or drops of it. */
export function createPrecipitation(
  weather: "snow" | "rain",
  count: number,
  shared: SharedUniforms,
) {
  const { object, material } =
    weather === "snow" ? createSnow(count, shared) : createRain(count, shared);
  return {
    object,
    setViewportHeight(height: number) {
      if (material.uniforms.uViewportHeight) {
        material.uniforms.uViewportHeight.value = height;
      }
    },
    /** How much of it shows, 0 to 1 (it fades out as the court's look comes in). */
    setFade(amount: number) {
      material.uniforms.uFade.value = amount;
    },
  };
}
