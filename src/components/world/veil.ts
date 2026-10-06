import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fogChunk, fogUniforms } from "./palette";
import type { SharedUniforms } from "./shared";

/**
 * A translucent panel of light, upright and facing down the valley (+z),
 * centred on (x, y, z): a court's net, a mesh of fine light, or a gate's
 * barrier, a field that shimmers as it holds.
 */
export type Veil = {
  kind: "net" | "barrier";
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  color: Color;
};

/** One veil as geometry, with its own units across it for the pattern. */
function veilGeometry(v: Veil): BufferGeometry {
  const g = new PlaneGeometry(v.w, v.h).translate(v.x, v.y, v.z).toNonIndexed();
  const uv = g.getAttribute("uv");
  const n = uv.count;
  const across: number[] = [];
  for (let i = 0; i < n; i++) across.push(uv.getX(i) * v.w, uv.getY(i) * v.h);
  g.setAttribute("aAcross", new Float32BufferAttribute(across, 2));
  g.setAttribute(
    "aSize",
    new Float32BufferAttribute(
      Array.from({ length: n }, () => [v.w, v.h]).flat(),
      2,
    ),
  );
  g.setAttribute(
    "aLight",
    new Float32BufferAttribute(
      Array.from({ length: n }, () => v.color.toArray()).flat(),
      3,
    ),
  );
  g.setAttribute(
    "aBarrier",
    new Float32BufferAttribute(
      new Array(n).fill(v.kind === "barrier" ? 1 : 0),
      1,
    ),
  );
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  return g;
}

/**
 * Every veil in one additive draw. A net is a fine grid of light; a barrier
 * is a faint field, brighter at its edges, crossed by bands of light that
 * drift up it over time (still when the world is, under reduced motion).
 */
export function createVeils(veils: readonly Veil[], shared: SharedUniforms) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { uTime: shared.uTime, ...fogUniforms() },
    vertexShader: /* glsl */ `
      attribute vec2 aAcross;
      attribute vec2 aSize;
      attribute vec3 aLight;
      attribute float aBarrier;
      varying vec2 vAcross;
      varying vec2 vSize;
      varying vec3 vLight;
      varying float vBarrier;
      varying vec3 vWorld;
      void main() {
        vAcross = aAcross;
        vSize = aSize;
        vLight = aLight;
        vBarrier = aBarrier;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vAcross;
      varying vec2 vSize;
      varying vec3 vLight;
      varying float vBarrier;
      varying vec3 vWorld;
      ${fogChunk}
      void main() {
        vec2 edge = min(vAcross, vSize - vAcross);
        float rim = exp(-min(edge.x, edge.y) * 1.6);
        // The net: strings of light every 0.35, thinner than the gaps.
        vec2 cell = abs(fract(vAcross / 0.35) - 0.5);
        float strings = smoothstep(0.38, 0.5, max(cell.x, cell.y));
        float net = 0.06 + 0.5 * strings + 0.6 * rim;
        // The barrier: a faint scanned field, with bands drifting up it.
        float bands = pow(0.5 + 0.5 * sin(vAcross.y * 0.9 - uTime * 1.4), 6.0);
        float ripple = 0.5 + 0.5 * sin(vAcross.x * 1.7 + uTime * 0.8)
          * sin(vAcross.y * 1.3 - uTime * 0.6);
        float scan = 0.5 + 0.5 * sin(vAcross.y * 14.0);
        float field = 0.08 + 0.1 * ripple + 0.35 * bands + 0.05 * scan + 0.9 * rim;
        float light = mix(net, field, vBarrier);
        vec3 col = vLight * light * (1.0 - fogAmount(vWorld));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  return new Mesh(mergeGeometries(veils.map(veilGeometry)), material);
}
