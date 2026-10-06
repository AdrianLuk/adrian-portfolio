import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fogChunk, fogUniforms } from "./palette";
import type { SharedUniforms } from "./shared";

/**
 * A shield: a dome of light standing on the ground at (x, y, z), `r` across
 * its foot and `h` to its apex, a grid of hexagonal cells that shimmer as it
 * holds.
 */
export type Shield = {
  x: number;
  y: number;
  z: number;
  r: number;
  h: number;
  color: Color;
};

/** A ring of light standing upright, facing down the valley (+z): a portal. */
export type Portal = {
  x: number;
  y: number;
  z: number;
  r: number;
  tube: number;
  color: Color;
};

/** Hex cells' size across the dome, in world units. */
const CELL = 1.7;

/**
 * The shields in one additive draw: faint across their faces, bright along
 * the hex cells' edges and at their silhouettes, with waves of light rising
 * up them and cells flaring one by one, all off the world's clock (so still
 * when the world is, under reduced motion).
 */
export function createShields(
  shields: readonly Shield[],
  shared: SharedUniforms,
) {
  const geometry = mergeGeometries(
    shields.map((s) => {
      const g = new SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2)
        .scale(s.r, s.h, s.r)
        .translate(s.x, s.y, s.z)
        .toNonIndexed();
      g.deleteAttribute("uv");
      const n = g.getAttribute("position").count;
      const each = (v: number[]) =>
        new Float32BufferAttribute(
          Array.from({ length: n }, () => v).flat(),
          v.length,
        );
      g.setAttribute("aLight", each(s.color.toArray()));
      g.setAttribute("aCentre", each([s.x, s.y, s.z]));
      g.setAttribute("aSize", each([s.r, s.h]));
      return g;
    }),
  );
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { uTime: shared.uTime, ...fogUniforms() },
    vertexShader: /* glsl */ `
      attribute vec3 aLight;
      attribute vec3 aCentre;
      attribute vec2 aSize;
      varying vec3 vLight;
      varying vec3 vLocal;
      varying vec2 vSize;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vLight = aLight;
        vLocal = position - aCentre;
        vSize = aSize;
        vNormal = normal;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vLight;
      varying vec3 vLocal;
      varying vec2 vSize;
      varying vec3 vNormal;
      varying vec3 vWorld;
      ${fogChunk}
      const vec2 HEX = vec2(1.0, 1.7320508);
      void main() {
        // Unrolled round the dome: arc length along each parallel (so the
        // cells keep their size as the dome narrows), height up it.
        float around = atan(vLocal.z, vLocal.x) * length(vLocal.xz);
        vec2 p = vec2(around, vLocal.y) / ${CELL.toFixed(2)};
        vec2 a = mod(p, HEX) - HEX * 0.5;
        vec2 b = mod(p - HEX * 0.5, HEX) - HEX * 0.5;
        vec2 cell = dot(a, a) < dot(b, b) ? a : b;
        vec2 id = p - cell;
        vec2 q = abs(cell);
        float edge = 0.5 - max(dot(q, normalize(HEX)), q.x);
        float lines = 1.0 - smoothstep(0.02, 0.07, edge);

        float h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
        float flare = pow(0.5 + 0.5 * sin(uTime * 1.3 + h * 40.0), 12.0);
        float rise = vLocal.y / vSize.y;
        float wave = pow(0.5 + 0.5 * sin(rise * 9.0 - uTime * 1.6), 4.0);

        vec3 view = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - abs(dot(normalize(vNormal), view)), 3.0);
        // Brightest near the ground, where the shield meets it.
        float foot = 1.0 - smoothstep(0.0, 0.12, rise);

        float light = 0.03
          + lines * (0.22 + 0.5 * wave)
          + 0.18 * flare
          + 0.7 * rim
          + 0.5 * foot;
        vec3 col = vLight * light * (1.0 - fogAmount(vWorld));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  return new Mesh(geometry, material);
}

/** The portals, each a bright ring with a hot inner edge, in one draw. */
export function createPortals(portals: readonly Portal[]) {
  const geometry = mergeGeometries(
    portals.flatMap((p) =>
      [
        { r: p.r, tube: p.tube, color: p.color },
        {
          r: p.r - p.tube * 0.8,
          tube: p.tube * 0.3,
          color: p.color.clone().lerp(new Color(1, 1, 1), 0.6),
        },
      ].map(({ r, tube, color }) => {
        const g = new TorusGeometry(r, tube, 10, 64)
          .translate(p.x, p.y, p.z)
          .toNonIndexed();
        g.deleteAttribute("uv");
        g.deleteAttribute("normal");
        const n = g.getAttribute("position").count;
        g.setAttribute(
          "color",
          new Float32BufferAttribute(
            Array.from({ length: n }, () => color.toArray()).flat(),
            3,
          ),
        );
        return g;
      }),
    ),
  );
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }));
}
