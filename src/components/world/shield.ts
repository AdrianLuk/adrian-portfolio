import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Path,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
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

/**
 * A heater shield's outline, `w` wide and `h` tall, centred on the origin:
 * a flat top, straight sides, and curves meeting in a point below.
 */
function heater(w: number, h: number) {
  const shape = new Shape();
  const top = h * 0.45;
  const shoulder = h * 0.05;
  shape.moveTo(-w / 2, top);
  shape.lineTo(w / 2, top);
  shape.lineTo(w / 2, shoulder);
  shape.quadraticCurveTo(w / 2, -h * 0.32, 0, -h * 0.55);
  shape.quadraticCurveTo(-w / 2, -h * 0.32, -w / 2, shoulder);
  shape.closePath();
  return shape;
}

/** A heater shield's band, `w` wide and `h` tall, `t` thick, inside its edge. */
function heaterBand(w: number, h: number, t: number) {
  const band = heater(w, h);
  band.holes.push(new Path(heater(w - 2 * t, h - 2 * t).getPoints(24)));
  return band;
}

/** Geometry carrying one colour on every vertex, for a vertex-coloured draw. */
function painted(g: BufferGeometry, color: Color) {
  const flat = g.toNonIndexed();
  flat.deleteAttribute("uv");
  flat.deleteAttribute("normal");
  const n = flat.getAttribute("position").count;
  flat.setAttribute(
    "color",
    new Float32BufferAttribute(
      Array.from({ length: n }, () => color.toArray()).flat(),
      3,
    ),
  );
  return flat;
}

/**
 * The portals in one draw: each a bright ring with a hot inner edge, and in
 * its mouth a shield of light facing up the valley, filled faintly, edged
 * bright, with a second edge inside.
 */
export function createPortals(portals: readonly Portal[]) {
  const white = new Color(1, 1, 1);
  const geometry = mergeGeometries(
    portals.flatMap((p) => {
      const hot = p.color.clone().lerp(white, 0.6);
      const h = p.r * 1.25;
      const w = h * 0.8;
      const at = (g: BufferGeometry) => g.translate(p.x, p.y, p.z);
      // The outline's middle sits 0.05 of its height below its origin.
      const mid = (g: BufferGeometry) => at(g.translate(0, h * 0.05, 0));
      return [
        painted(at(new TorusGeometry(p.r, p.tube, 10, 64)), p.color),
        painted(
          at(new TorusGeometry(p.r - p.tube * 0.8, p.tube * 0.3, 10, 64)),
          hot,
        ),
        painted(
          mid(new ShapeGeometry(heater(w, h), 24)),
          p.color.clone().multiplyScalar(0.35),
        ),
        painted(
          mid(
            new ShapeGeometry(heaterBand(w, h, 0.5), 24).translate(0, 0, 0.05),
          ),
          hot,
        ),
        painted(
          mid(
            new ShapeGeometry(
              heaterBand(w * 0.72, h * 0.72, 0.18),
              24,
            ).translate(0, -h * 0.014, 0.05),
          ),
          p.color.clone().lerp(white, 0.3),
        ),
      ];
    }),
  );
  return new Mesh(
    geometry,
    new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }),
  );
}
