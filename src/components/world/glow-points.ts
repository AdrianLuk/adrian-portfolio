import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  ShaderMaterial,
} from "three";
import { fogChunk, fogUniforms } from "./palette";
import type { SharedUniforms } from "./shared";

export type Glow = {
  x: number;
  y: number;
  z: number;
  color: Color;
  /** World-space diameter of the halo. */
  size: number;
  /** 0..1, varies twinkle and drift per point. */
  seed: number;
};

export type GlowOptions = {
  /** Rise through this height and wrap, swaying as they go (the motes). */
  drift?: number;
  /** Brightness multiplier. */
  intensity?: number;
  /**
   * Sway side to side by up to this much, slowly, as lightsticks held up in
   * a crowd do: each in its seed's turn, so a wave runs through them.
   */
  sway?: number;
};

/**
 * Light sprites: soft additive halos with a hot core, sized in world units so
 * they shrink with distance, and dimmed by the same fog as everything else.
 * They stand in for bloom, which the world does without.
 */
export function createGlowPoints(
  glows: readonly Glow[],
  shared: SharedUniforms,
  { drift = 0, intensity = 1, sway = 0 }: GlowOptions = {},
) {
  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  const seeds: number[] = [];
  for (const g of glows) {
    positions.push(g.x, g.y, g.z);
    colors.push(g.color.r, g.color.g, g.color.b);
    sizes.push(g.size);
    seeds.push(g.seed);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      ...shared,
      uViewportHeight: { value: 800 },
      uDrift: { value: drift },
      uSway: { value: sway },
      // Each point lights once the fill passes its seed: all of them by default.
      uFill: { value: 2 },
      uIntensity: { value: intensity },
      ...fogUniforms(),
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uViewportHeight;
      uniform float uDrift;
      uniform float uSway;
      uniform float uFill;
      varying vec3 vColor;
      varying float vAlpha;
      ${fogChunk}
      void main() {
        vec3 p = position;
        float alpha = 1.0;
        if (uDrift > 0.0) {
          float rise = mod(p.y + uTime * (0.5 + aSeed * 0.9), uDrift);
          alpha *= smoothstep(0.0, 2.5, rise) * smoothstep(uDrift, uDrift - 4.0, rise);
          p.y = rise;
          p.x += sin(uTime * 0.37 + aSeed * 41.0) * 1.6;
          p.z += cos(uTime * 0.29 + aSeed * 23.0) * 1.6;
          alpha *= 0.65 + 0.35 * sin(uTime * 1.7 + aSeed * 13.0);
        }
        if (uSway > 0.0) {
          // About one sway every four seconds: nothing near a flash.
          float swing = sin(uTime * 1.6 - aSeed * 9.0);
          p.x += swing * uSway;
          p.y += abs(swing) * uSway * 0.3;
        }
        alpha *= smoothstep(aSeed - 0.03, aSeed + 0.03, uFill);
        vec4 world = modelMatrix * vec4(p, 1.0);
        vec4 mv = viewMatrix * world;
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        // World size to pixels: the projection's focal length in pixels over depth.
        float focal = projectionMatrix[1][1] * 0.5 * uViewportHeight;
        gl_PointSize = max(aSize * focal / dist, 1.5) * uPixelRatio;
        vColor = aColor;
        // Additive light fades into the fog rather than tinting towards it.
        vAlpha = alpha * (1.0 - fogAmount(world.xyz));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float halo = pow(1.0 - d, 2.4);
        float core = smoothstep(0.32, 0.0, d);
        vec3 col = vColor * halo + vec3(1.0) * core * 0.55;
        gl_FragColor = vec4(col * vAlpha * uIntensity, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return {
    points,
    setViewportHeight(height: number) {
      material.uniforms.uViewportHeight.value = height;
    },
    setIntensity(value: number) {
      material.uniforms.uIntensity.value = value;
    },
    /** Lights the points whose seed the fill (0 to 1) has passed. */
    setFill(value: number) {
      // Stretched a hair each way, so 0 lights none and 1 lights all.
      material.uniforms.uFill.value = value * 1.06 - 0.03;
    },
  };
}
