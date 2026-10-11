import {
  BufferGeometry,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fogChunk, fogUniforms, MOON, palette } from "./palette";
import type { SharedUniforms } from "./shared";
import type { Box } from "./structures";

/**
 * An Airliner's route: from one end to the other in a straight line, `speed`
 * units a second, round again forever, fading in and out at the ends.
 * `phase` is how far along it is at the traffic's time 0 (0 to 1).
 */
export type AirlinerRoute = { from: Vector3; to: Vector3; speed: number; phase: number };

/** The three Airliners: two along the valley, one across it, 70 to 135 up. */
export const AIRLINERS: readonly AirlinerRoute[] = [
  { from: new Vector3(-10, 70, -230), to: new Vector3(40, 85, -1200), speed: 14, phase: 0.1 },
  { from: new Vector3(60, 95, -1300), to: new Vector3(-30, 75, -220), speed: 13, phase: 0.71 },
  // Across on a slant: over Toronto's skyline seen from the Islands, then far
  // enough down the valley to stand in the court's sky.
  { from: new Vector3(370, 125, -700), to: new Vector3(-320, 100, -1185), speed: 16, phase: 0.94 },
];

/** How much of each end of a route the plane spends fading in or out. */
const FADE = 0.06;

/** The white strobe at each wingtip: flashes a second, and how long each is on (of one). */
export const STROBE = { rate: 0.8, on: 0.08 };

/**
 * The plane's extremes in its own frame (nose to +z, port to +x): nose,
 * tail, both wingtips, the fin's top and the nacelles' bottom.
 */
const EXTREMES = [
  new Vector3(0, 0, 12.6),
  new Vector3(0, 0, -15.8),
  new Vector3(11.6, -0.5, -2.2),
  new Vector3(-11.6, -0.5, -2.2),
  new Vector3(0, 6.6, -15.8),
  new Vector3(0, -2.1, 2.2),
];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Where a plane is at the traffic's time `t`: its middle, the way its nose
 * points (level), and how far it shows (0 to 1, as it fades at the ends).
 * The shader in `createAirliners` does the same sums.
 */
export function airlinerAt({ from, to, speed, phase }: AirlinerRoute, t: number) {
  const along = to.clone().sub(from);
  const u = (((t * speed) / along.length() + phase) % 1 + 1) % 1;
  const forward = along.clone().setY(0).normalize();
  return {
    position: from.clone().addScaledVector(along, u),
    forward,
    show: smoothstep(0, FADE, u) * (1 - smoothstep(1 - FADE, 1, u)),
  };
}

/** True while a plane's strobes are lit, at the traffic's time `t`. */
export function strobeOn(plane: AirlinerRoute, t: number) {
  const f = (((t * STROBE.rate + plane.phase * 7) % 1) + 1) % 1;
  return f < STROBE.on;
}

/** The box round a plane at the traffic's time `t`, square to the world. */
export function airlinerBox(plane: AirlinerRoute, t: number): Box {
  const { position, forward } = airlinerAt(plane, t);
  const port = new Vector3(forward.z, 0, -forward.x);
  const points = EXTREMES.map((e) =>
    position.clone().addScaledVector(port, e.x).add(new Vector3(0, e.y, 0)).addScaledVector(forward, e.z),
  );
  const min = (k: "x" | "y" | "z") => Math.min(...points.map((p) => p[k]));
  const max = (k: "x" | "y" | "z") => Math.max(...points.map((p) => p[k]));
  return {
    x: (min("x") + max("x")) / 2,
    y: (min("y") + max("y")) / 2,
    z: (min("z") + max("z")) / 2,
    w: max("x") - min("x"),
    h: max("y") - min("y"),
    d: max("z") - min("z"),
  } as Box;
}

/** What each piece of the merged plane is, for the shader (`aPart`). */
const PART = { body: 0, black: 1, wing: 2, leaf: 3, port: 4, starboard: 5, strobe: 6, tail: 7 };

/** The red maple leaf's outline, 0 to 1 across, y down (as drawn on a canvas). */
const LEAF = [
  [50, 2], [57, 15], [64, 12], [61, 34], [74, 20], [77, 27], [90, 25], [85, 40], [93, 44],
  [72, 60], [75, 68], [53, 65], [54, 92], [46, 92], [47, 65], [25, 68], [28, 60], [7, 44],
  [15, 40], [10, 25], [23, 27], [26, 20], [39, 34], [36, 12], [43, 15],
].map(([x, y]) => [x / 100, y / 100]);

/** A piece of the plane, tagged with what it is. */
function part(geometry: BufferGeometry, kind: number) {
  const n = geometry.getAttribute("position").count;
  geometry.setAttribute("aPart", new Float32BufferAttribute(new Array(n).fill(kind), 1));
  return geometry;
}

/** A swept wing, both halves, flat in the plane's xz (its root's leading edge forward). */
function swept(span: number, root: number, tip: number, sweep: number) {
  const s = new Shape();
  s.moveTo(0, root / 2);
  s.lineTo(span, root / 2 - sweep);
  s.lineTo(span, root / 2 - sweep - tip);
  s.lineTo(0, -root / 2);
  s.lineTo(-span, root / 2 - sweep - tip);
  s.lineTo(-span, root / 2 - sweep);
  s.closePath();
  return new ShapeGeometry(s).rotateX(Math.PI / 2);
}

/** A light: a quad shrunk to a point; the shader opens it to face the camera. */
function light(x: number, y: number, z: number, kind: number) {
  const g = new PlaneGeometry(1, 1);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) p.setXYZ(i, x, y, z);
  return part(g, kind);
}

/**
 * One Airliner, its nose to +z and its port wing to +x, about 28 long: the
 * fuselage, nose and tail cone, swept wings, tailplane, fin, two engines,
 * the maple leaf each side of the fin, and its lights.
 */
function airlinerGeometry() {
  const tube = (r0: number, r1: number, length: number, sides: number) =>
    new CylinderGeometry(r1, r0, length, sides).rotateX(Math.PI / 2);
  const fin = new Shape();
  fin.moveTo(-10.5, 1);
  fin.lineTo(-14.2, 6.6);
  fin.lineTo(-15.8, 6.6);
  fin.lineTo(-15.2, 1);
  fin.closePath();
  const leaf = new Shape();
  LEAF.forEach(([x, y], i) => (i ? leaf.lineTo(x, -y) : leaf.moveTo(x, -y)));
  const leafSide = (s: 1 | -1) =>
    new ShapeGeometry(leaf)
      .translate(-0.48, 0.47, 0)
      .scale(2.6, 2.6, 1)
      .rotateY((s * Math.PI) / 2)
      .translate(s * 0.07, 3.9, -13.9);
  const tipZ = -2.2;
  return mergeGeometries([
    part(tube(1.3, 1.3, 20, 16), PART.body),
    part(new SphereGeometry(1.3, 16, 8).scale(1, 1, 2).translate(0, 0, 10), PART.body),
    part(tube(1.3, 0.35, 5.5, 16).translate(0, 0.3, -12.7), PART.body),
    part(tube(0.7, 0.75, 3, 12).translate(4.3, -1.35, 2.2), PART.black),
    part(tube(0.7, 0.75, 3, 12).translate(-4.3, -1.35, 2.2), PART.black),
    part(new ShapeGeometry(fin).rotateY(-Math.PI / 2), PART.black),
    part(swept(11.5, 5, 1.4, 4.5).translate(0, -0.5, 0.5), PART.wing),
    part(swept(4.2, 2.6, 0.9, 2).translate(0, 0.6, -13.2), PART.wing),
    part(leafSide(1), PART.leaf),
    part(leafSide(-1), PART.leaf),
    light(11.5, -0.5, tipZ, PART.port),
    light(-11.5, -0.5, tipZ, PART.starboard),
    light(11.6, -0.5, tipZ - 0.4, PART.strobe),
    light(-11.6, -0.5, tipZ - 0.4, PART.strobe),
    light(0, 0.4, -15.5, PART.tail),
  ])!;
}

/**
 * The three Airliners and all their lights, in one instanced draw. Each
 * flies its route on the traffic's clock (`uTraffic`) in the vertex shader,
 * as `airlinerAt` reckons it, so nothing moves on the CPU and the planes
 * hold still with the traffic. Air Canada's 2017 scheme is painted in the
 * shader: white above, black belly, cockpit mask, nacelles and fin, grey
 * wings, a lit row of cabin windows each side, and the red maple leaf on
 * the tail, lit as the logo lights light it. Steady magenta (port) and cyan
 * (starboard) wingtip lights, and a white strobe at each tip (`STROBE`).
 */
export function createAirliners(shared: SharedUniforms) {
  const geometry = airlinerGeometry();
  const each = (pick: (r: AirlinerRoute) => number[]) =>
    new InstancedBufferAttribute(new Float32Array(AIRLINERS.flatMap(pick)), pick(AIRLINERS[0]).length);
  geometry.setAttribute("aFrom", each((r) => r.from.toArray()));
  geometry.setAttribute("aTo", each((r) => r.to.toArray()));
  geometry.setAttribute("aRun", each((r) => [r.speed, r.phase]));

  const material = new ShaderMaterial({
    // Premultiplied: the planes blend over as they fade, their lights add.
    transparent: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    side: DoubleSide,
    uniforms: {
      uTraffic: shared.uTraffic,
      uMoon: { value: MOON },
      uWhite: { value: new Color("#dfe3ee") },
      uBlack: { value: new Color("#15161c") },
      uWing: { value: new Color("#8a90a6") },
      uLeaf: { value: new Color("#f01428") },
      uWindow: { value: new Color("#ffd89a") },
      uPort: { value: palette.magenta },
      uStarboard: { value: palette.cyan },
      uStrobe: { value: palette.ink },
      ...fogUniforms(),
    },
    vertexShader: /* glsl */ `
      uniform float uTraffic;
      attribute float aPart;
      attribute vec3 aFrom;
      attribute vec3 aTo;
      attribute vec2 aRun;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec2 vCorner;
      varying float vPart;
      varying float vShow;
      varying float vStrobe;
      void main() {
        // As airlinerAt: along the route, level, fading at its ends.
        vec3 along = aTo - aFrom;
        float u = fract(uTraffic * aRun.x / length(along) + aRun.y);
        vec3 forward = normalize(vec3(along.x, 0.0, along.z));
        vec3 port = vec3(forward.z, 0.0, -forward.x);
        mat3 turn = mat3(port, vec3(0.0, 1.0, 0.0), forward);
        vShow = smoothstep(0.0, ${FADE}, u) * (1.0 - smoothstep(${1 - FADE}, 1.0, u));
        // As strobeOn.
        vStrobe = fract(uTraffic * ${STROBE.rate} + aRun.y * 7.0) < ${STROBE.on} ? 1.0 : 0.0;
        vLocal = position;
        vPart = aPart;
        vNormal = turn * normal;
        vec3 world = aFrom + along * u + turn * position;
        vWorld = world;
        vec4 view = viewMatrix * vec4(world, 1.0);
        vCorner = uv * 2.0 - 1.0;
        // Lights open to face the camera, a few pixels across at any distance.
        if (aPart > 3.5) view.xy += vCorner * max(0.3, -view.z * 0.0035);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uMoon;
      uniform vec3 uWhite;
      uniform vec3 uBlack;
      uniform vec3 uWing;
      uniform vec3 uLeaf;
      uniform vec3 uWindow;
      uniform vec3 uPort;
      uniform vec3 uStarboard;
      uniform vec3 uStrobe;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec2 vCorner;
      varying float vPart;
      varying float vShow;
      varying float vStrobe;
      ${fogChunk}
      void main() {
        if (vShow < 0.001) discard;
        int part = int(vPart + 0.5);
        float fog = fogAmount(vWorld);
        if (part > 3) {
          float glow = pow(max(1.0 - length(vCorner), 0.0), 2.0);
          if (glow < 0.02) discard;
          vec3 c = part == 4 ? uPort : part == 5 ? uStarboard : part == 6 ? uStrobe * 1.4 * vStrobe : uStrobe * 0.7;
          // Alpha 0: the lights add.
          gl_FragColor = vec4(c * glow * vShow * (1.0 - fog), 0.0);
        } else {
          vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
          float lit = 0.3 + 0.55 * max(dot(n, uMoon), 0.0);
          vec3 c = uWhite;
          vec3 glow = vec3(0.0);
          if (part == 1) c = uBlack;
          else if (part == 2) c = uWing;
          else if (part == 3) {
            // The logo lights shine up the fin from the tailplane.
            c = vec3(0.0);
            glow = uLeaf * (1.6 - 0.25 * (vLocal.y - 2.6));
          } else {
            // Air Canada's 2017 scheme: black belly and cockpit mask, a row of windows.
            bool belly = vLocal.y < -0.5;
            bool mask = vLocal.z > 10.5 && vLocal.y > 0.15 && abs(vLocal.x) < 1.05;
            bool pane = abs(vLocal.y - 0.35) < 0.12 && vLocal.z > -8.5 && vLocal.z < 7.5
              && fract(vLocal.z * 1.1) < 0.45;
            if (belly || mask) c = uBlack;
            if (pane) { c = vec3(0.0); glow = uWindow; }
          }
          vec3 col = mix(c * lit + vec3(0.03, 0.035, 0.07) + glow, uFogColor, fog);
          gl_FragColor = vec4(col * vShow, vShow);
        }
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new InstancedMesh(geometry, material, AIRLINERS.length);
  // Placed in the shader, not by instanceMatrix: three can't cull them.
  mesh.frustumCulled = false;
  return mesh;
}
