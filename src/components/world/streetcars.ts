import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Mesh,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { each, piece } from "./attributes";
import { smoothstep } from "./noise";
import { fogChunk, fogUniforms, MOON, palette } from "./palette";
import type { SharedUniforms } from "./shared";
import { valleyCentre, valleyHeight } from "./terrain";

/**
 * The Streetcars and their line, as pure data (unit tested without WebGL):
 * three TTC Flexity streetcars running down the valley on two tracks either
 * side of the light path's centre line, under an overhead wire, over the
 * Harbour on a low bridge of light, and underground at a Portal at each end.
 */

/**
 * The line's tunnel Portals: up out of the floor past the plate, back under
 * it short of the Diamond. Further in than the mockup's -150 and -1030: the
 * floor nearer the plate is behind its words in the settled view, and the
 * end Portal's berm would stand in front of the Diamond at its stop.
 */
export const PORTALS = { start: -280, end: -990 };
/** How far into a tunnel a section stays drawn: the berm hides it there. */
export const COVERED = 22;
/** A Flexity's five sections, cab to cab, about 28 m as Toronto's are, and the gap at each joint. */
export const SECTIONS = [4.6, 3.2, 3.8, 3.2, 4.6];
const JOINT = 0.25;
/** A section's width and height. */
export const CAR = { width: 1.8, height: 2.2 };
/** The tracks' offset either side of the centre line, and the cars' speed. */
export const TRACK = { offset: 2.2, speed: 10 };
/** The wire's height over the rails. */
export const WIRE = 4.6;
/** The bridge of light over the Harbour: its ends and its deck's height. */
export const BRIDGE = { from: -430, to: -586, deck: 0.3 };
/** Poles down the line's middle, this far apart. */
const POLE_SPACING = 30;

export const ROUTES = ["501 QUEEN", "504 KING", "505 DUNDAS"] as const;

/**
 * Two cars down the valley on the left-hand track, one back up on the
 * right: that one on the bridge, in the Skyline's sight, in the still frame.
 */
export const STREETCARS = [
  { dir: -1, side: -1, phase: 0, route: 0 },
  { dir: -1, side: -1, phase: 0.5, route: 1 },
  { dir: 1, side: 1, phase: 0.44, route: 2 },
] as const;

/** Each section's middle, measured back from the car's nose. */
const MIDDLES = SECTIONS.map(
  (l, k) => SECTIONS.slice(0, k).reduce((s, x) => s + x + JOINT, 0) + l / 2,
);
const CAR_LENGTH =
  SECTIONS.reduce((s, x) => s + x, 0) + JOINT * (SECTIONS.length - 1);
/** Where a nose starts and ends its run: as deep in as the berms cover. */
const RUN = { start: PORTALS.start + COVERED, end: PORTALS.end - COVERED };
/** A full run, nose in at one end to tail out at the other, in seconds. */
export const CYCLE = (RUN.start - RUN.end + CAR_LENGTH) / TRACK.speed;

export const trackX = (z: number, side: number) =>
  valleyCentre(z) + side * TRACK.offset;
/** How far in from each end of the bridge its deck climbs from the floor to its height. */
const RAMP = 10;
/**
 * The rails' height: the bridge's deck over the Harbour, else the floor,
 * eased from one to the other over each end's ramp, so nothing on the line
 * steps at the bridge's ends.
 */
export const railHeight = (x: number, z: number) => {
  const floor = valleyHeight(x, z);
  const onDeck = smoothstep(0, RAMP, Math.min(BRIDGE.from - z, z - BRIDGE.to));
  return floor + (BRIDGE.deck - floor) * onDeck + 0.15;
};
/** The heading of something on the line at depth z, facing down the valley. */
const heading = (z: number) =>
  Math.atan2(valleyCentre(z - 1) - valleyCentre(z + 1), -2);

/** True where a section at depth z is deeper into a tunnel than its berm covers. */
export const buried = (z: number) => z > RUN.start || z < RUN.end;

export type Section = {
  car: number;
  /** Which of the five, from the nose. */
  k: number;
  length: number;
  /** Its middle, on the rails' level plus half its height. */
  x: number;
  y: number;
  z: number;
  /** Its turn about y: its +z toward the car's nose. */
  yaw: number;
  shown: boolean;
};

/** Every section of every car at traffic time `t`, each following the curve on its own. */
export function streetcarSections(t: number): Section[] {
  const total = CYCLE * TRACK.speed;
  return STREETCARS.flatMap((car, i) => {
    const s = (((t * TRACK.speed + car.phase * total) % total) + total) % total;
    const head = car.dir < 0 ? RUN.start - s : RUN.end + s;
    return SECTIONS.map((length, k) => {
      const z = head - car.dir * MIDDLES[k];
      const x = trackX(z, car.side);
      return {
        car: i,
        k,
        length,
        x,
        y: railHeight(x, z) + CAR.height / 2 + 0.15,
        z,
        yaw: heading(z) + (car.dir > 0 ? Math.PI : 0),
        shown: !buried(z),
      };
    });
  });
}

/** A piece of the line, in world space: moonlit, or self-lit (`lit`). */
export type LinePart = {
  name: string;
  geometry: BufferGeometry;
  color: Color;
  lit: boolean;
};

const ink = (hex: number) => new Color(hex);
const LOOK = {
  berm: ink(0x1f2756),
  wall: ink(0x2a3570),
  mouth: ink(0x03050d),
  pole: ink(0x2a3570),
  deck: ink(0x0d1230),
};

const m = new Matrix4();
const q = new Quaternion();
const e = new Euler();
/** `g` stood at `at` turned `yaw`, then tilted `pitch` about x, inside a frame at `frame`. */
function placed(
  g: BufferGeometry,
  frame: Matrix4,
  at: Vector3,
  yaw = 0,
  pitch = 0,
) {
  q.setFromEuler(e.set(pitch, yaw, 0));
  return g.applyMatrix4(
    frame.clone().multiply(m.compose(at, q, new Vector3(1, 1, 1))),
  );
}

/**
 * A Portal at depth z, its mouth facing down the valley (`faces` 1) or back
 * up it (-1): a lit frame round a dark mouth in a headwall, and a low berm
 * over the tunnel's first stretch, standing on the floor.
 */
function portal(z: number, faces: number): LinePart[] {
  const x = valleyCentre(z);
  const frame = new Matrix4().compose(
    new Vector3(x, valleyHeight(x, z), z),
    q.setFromEuler(e.set(0, heading(z), 0)).clone(),
    new Vector3(1, 1, 1),
  );
  const berm = new CylinderGeometry(0.55, 1, 5.6, 4, 1)
    .rotateY(Math.PI / 4)
    .scale(11.3, 1, 19.8);
  const v = (a: number, b: number, c: number) => new Vector3(a, b, c);
  const at = faces * 0.45;
  return [
    {
      name: "berm",
      geometry: placed(berm, frame, v(0, 2.8, -faces * 13)),
      color: LOOK.berm,
      lit: false,
    },
    {
      name: "headwall",
      geometry: placed(new BoxGeometry(10.5, 5.8, 0.8), frame, v(0, 2.9, 0)),
      color: LOOK.wall,
      lit: false,
    },
    {
      name: "mouth",
      geometry: placed(
        new BoxGeometry(7.6, 3.8, 0.06),
        frame,
        v(0, 1.9, faces * 0.41),
      ),
      color: LOOK.mouth,
      lit: true,
    },
    ...[-1, 1].map((s) => ({
      name: "frame",
      geometry: placed(
        new BoxGeometry(0.28, 3.9, 0.12),
        frame,
        v(s * 3.9, 1.95, at),
      ),
      color: palette.cyan,
      lit: true,
    })),
    {
      name: "frame",
      geometry: placed(new BoxGeometry(8.08, 0.28, 0.12), frame, v(0, 3.9, at)),
      color: palette.cyan,
      lit: true,
    },
  ];
}

/** The poles down the line's middle, each with an arm out to both wires. */
function poles(): LinePart[] {
  const parts: LinePart[] = [];
  const id = new Matrix4();
  for (let z = PORTALS.start - 10; z > PORTALS.end + 5; z -= POLE_SPACING) {
    const x = valleyCentre(z);
    const y = railHeight(x, z);
    parts.push(
      {
        name: "pole",
        geometry: placed(
          new CylinderGeometry(0.12, 0.16, WIRE + 0.5, 6),
          id,
          new Vector3(x, y + (WIRE + 0.5) / 2, z),
        ),
        color: LOOK.pole,
        lit: false,
      },
      {
        name: "pole",
        geometry: placed(
          new BoxGeometry(5.6, 0.12, 0.12),
          id,
          new Vector3(x, y + WIRE + 0.35, z),
          heading(z),
        ),
        color: LOOK.pole,
        lit: false,
      },
    );
  }
  return parts;
}

/**
 * The bridge of light: a low deck along the path's line over the Harbour,
 * its edges lit, its top under the rails from one end to the other.
 */
function bridge(): LinePart[] {
  const parts: LinePart[] = [];
  const id = new Matrix4();
  const STEP = 5;
  const top = (x: number, z: number) => railHeight(x, z) - 0.15;
  for (let z = BRIDGE.from; z > BRIDGE.to; z -= STEP) {
    const z2 = Math.max(z - STEP, BRIDGE.to);
    const x = valleyCentre(z);
    const x2 = valleyCentre(z2);
    const yaw = Math.atan2(x - x2, z - z2);
    const along = Math.hypot(x - x2, z - z2);
    // Tilted up or down the ramps at the ends (a turn about x lowers its +z end).
    const pitch = Math.atan2(top(x2, z2) - top(x, z), along);
    const y = (top(x, z) + top(x2, z2)) / 2;
    const mid = new Vector3((x + x2) / 2, y - 0.2, (z + z2) / 2);
    parts.push({
      name: "bridge",
      geometry: placed(new BoxGeometry(8, 0.4, along + 0.3), id, mid, yaw, pitch),
      color: LOOK.deck,
      lit: false,
    });
    for (const s of [-1, 1]) {
      const edge = mid
        .clone()
        .add(new Vector3(Math.cos(yaw) * 4 * s, 0.25, -Math.sin(yaw) * 4 * s));
      parts.push({
        name: "bridge",
        geometry: placed(new BoxGeometry(0.3, 0.3, along + 0.3), id, edge, yaw, pitch),
        color: palette.cyan,
        lit: true,
      });
    }
  }
  return parts;
}

/**
 * The line, all of it still: both Portals, the poles, the bridge and the
 * overhead wire (pairs of points, one segment each, over each track).
 */
export function layoutLine() {
  const wire: Vector3[] = [];
  for (const side of [-1, 1]) {
    for (let z = PORTALS.start; z > PORTALS.end; z -= 4) {
      const z2 = Math.max(z - 4, PORTALS.end);
      for (const at of [z, z2]) {
        const x = trackX(at, side);
        wire.push(new Vector3(x, railHeight(x, at) + WIRE, at));
      }
    }
  }
  return {
    parts: [
      ...portal(PORTALS.start, 1),
      ...portal(PORTALS.end, -1),
      ...poles(),
      ...bridge(),
    ],
    wire,
  };
}

/**
 * The line in two draws: everything solid merged into one mesh (moonlit,
 * its lit parts self-lit), and the overhead wire as one set of lines.
 */
export function createLine() {
  const { parts, wire } = layoutLine();
  const geometry = mergeGeometries(
    parts.map(({ geometry: g, color, lit }) => {
      g.deleteAttribute("uv");
      g.deleteAttribute("normal");
      g.setAttribute("aColor", each(g, color.toArray()));
      g.setAttribute("aLit", each(g, [lit ? 1 : 0]));
      return g;
    }),
  );
  const material = new ShaderMaterial({
    uniforms: { ...fogUniforms(), uMoon: { value: MOON } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aLit;
      varying vec3 vColor;
      varying float vLit;
      varying vec3 vWorld;
      void main() {
        vColor = aColor;
        vLit = aLit;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uMoon;
      varying vec3 vColor;
      varying float vLit;
      varying vec3 vWorld;
      ${fogChunk}
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float diffuse = max(dot(n, uMoon), 0.0);
        vec3 col = mix(vColor * (0.55 + 1.1 * diffuse), vColor, vLit);
        col = mix(col, uFogColor, fogAmount(vWorld));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const wires = new LineSegments(
    new BufferGeometry().setFromPoints(wire),
    new ShaderMaterial({
      transparent: true,
      uniforms: { ...fogUniforms(), uColor: { value: palette.ink } },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec3 vWorld;
        ${fogChunk}
        void main() {
          gl_FragColor = vec4(mix(uColor, uFogColor, fogAmount(vWorld)), 0.4);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  return [new Mesh(geometry, material), wires] as const;
}

/** The route signs, a row each, white on black (the shader colours them amber): a small texture drawn in code. */
function routeSigns() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 32 * ROUTES.length;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#fff";
  g.font = "bold 19px monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  ROUTES.forEach((route, i) =>
    g.fillText(route, canvas.width / 2, 32 * i + 17),
  );
  return new CanvasTexture(canvas);
}

/**
 * The Streetcars, in one instanced draw, an instance per section, each
 * placed from the traffic's clock (`shared.uTraffic`) by `update`, after the
 * camera is posed: so they hold still wherever the traffic does. Their
 * livery is painted in the shader: TTC red, a black window band lit from
 * inside, a lit double door, a white stripe low down and a black skirt;
 * grey pods on the roof; a cab front with its amber route sign on the first
 * section, tail lights on the last, and a pantograph up to the wire on the
 * middle one.
 */
export function createStreetcars(shared: SharedUniforms) {
  const geometry = mergeGeometries([
    // The body: its length is set per section in the shader.
    piece(new BoxGeometry(CAR.width, CAR.height, 1), 0),
    piece(new BoxGeometry(1.3, 0.38, 0.7).translate(0, 1.29, 0), 1),
    // The pantograph, its shoe on the wire.
    piece(
      new BoxGeometry(0.08, 2.5, 0.08).rotateX(0.45).translate(0, 2.25, 0),
      2,
    ),
    piece(new BoxGeometry(1.5, 0.08, 0.2).translate(0, WIRE - 1.25, 0.54), 2),
  ]);
  geometry.deleteAttribute("uv");
  const lengths: number[] = [];
  const looks: number[] = [];
  for (const car of STREETCARS) {
    SECTIONS.forEach((length, k) => {
      lengths.push(length);
      looks.push(
        k === 0 ? 1 : 0,
        k === SECTIONS.length - 1 ? 1 : 0,
        k === 2 ? 1 : 0,
        car.route,
      );
    });
  }
  geometry.setAttribute(
    "aLength",
    new InstancedBufferAttribute(new Float32Array(lengths), 1),
  );
  geometry.setAttribute(
    "aLook",
    new InstancedBufferAttribute(new Float32Array(looks), 4),
  );

  const material = new ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      uMoon: { value: MOON },
      uSigns: { value: routeSigns() },
    },
    vertexShader: /* glsl */ `
      attribute float aPart;
      attribute float aLength;
      attribute vec4 aLook;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vPart;
      varying float vLength;
      varying vec4 vLook;
      void main() {
        vec3 p = position;
        // The body and pods stretch to the section; only the middle one has a pantograph.
        if (aPart < 1.5) p.z *= aLength;
        else p *= aLook.z;
        vLocal = p;
        vNormal = normal;
        vPart = aPart;
        vLength = aLength;
        vLook = aLook;
        vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uMoon;
      uniform sampler2D uSigns;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vPart;
      varying float vLength;
      varying vec4 vLook;
      ${fogChunk}
      vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
      bool within(float v, float lo, float hi) { return v > lo && v < hi; }
      void main() {
        vec3 red = lin(vec3(0.784, 0.063, 0.180));
        vec3 black = lin(vec3(0.04, 0.04, 0.063));
        vec3 white = lin(vec3(0.95, 0.953, 0.97));
        vec3 glass = lin(vec3(1.0, 0.886, 0.69));
        vec3 n = normalize(vNormal);
        // Down the face from the roof (0) to the rails (1), as the TTC paints it.
        float fy = (1.1 - vLocal.y) / 2.2;
        vec3 paint = red;
        float lit = 0.0;
        if (vPart > 0.5) paint = lin(vec3(0.56, 0.576, 0.64));
        else if (n.y > 0.5) paint = lin(vec3(0.36, 0.376, 0.44));
        else if (n.y < -0.5) paint = black;
        else if (abs(n.x) > 0.5) {
          float z = vLocal.z;
          bool door = abs(z) < 0.7;
          if (within(fy, 0.156, 0.5625) && !door) paint = black;
          if (within(fy, 0.719, 0.781) && !door) paint = white;
          if (fy > 0.875) paint = black;
          float f = fract(z / 1.2 + 0.5);
          bool pane = within(fy, 0.2, 0.52) && within(f, 0.12, 0.88)
            && abs(z) > 0.85 && abs(z) < vLength * 0.5 - 0.25;
          bool doorGlass = door && within(abs(z), 0.05, 0.6) && within(fy, 0.2, 0.8);
          if (pane || doorGlass) { paint = glass; lit = 1.0; }
        } else {
          bool front = vLook.x > 0.5 && n.z > 0.0;
          bool back = vLook.y > 0.5 && n.z < 0.0;
          // Across the end, left to right as one faces it.
          float fx = (n.z > 0.0 ? vLocal.x : -vLocal.x) / 1.8 + 0.5;
          paint = black;
          if (front || back) {
            paint = red;
            if (fy > 0.875) paint = black;
            else if (within(fy, 0.75, 0.797)) paint = white;
            bool lamp = within(fy, 0.656, 0.719)
              && (within(fx, 0.094, 0.234) || within(fx, 0.766, 0.906));
            if (front && within(fx, 0.047, 0.953) && within(fy, 0.03, 0.22)) {
              float s = (fy - 0.03) / 0.19;
              float ink = texture2D(uSigns, vec2((fx - 0.047) / 0.906, 1.0 - (vLook.w + s) / 3.0)).r;
              paint = mix(black, lin(vec3(1.0, 0.69, 0.0)), ink);
              lit = ink;
            } else if (front && within(fx, 0.047, 0.953) && within(fy, 0.234, 0.625)) {
              paint = lin(vec3(0.12, 0.13, 0.17));
            } else if (back && within(fx, 0.11, 0.89) && within(fy, 0.156, 0.53)) {
              paint = black;
            } else if (lamp) {
              paint = front ? lin(vec3(1.0, 0.98, 0.91)) : lin(vec3(1.0, 0.23, 0.23));
              lit = 1.0;
            }
          }
        }
        vec3 m = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float diffuse = max(dot(m, uMoon), 0.0);
        vec3 col = mix(paint * (0.7 + 0.5 * diffuse), paint, lit);
        col = mix(col, uFogColor, fogAmount(vWorld));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new InstancedMesh(geometry, material, lengths.length);
  // Placed each frame from the traffic's clock: no bounds to cull by.
  mesh.frustumCulled = false;

  const hidden = new Matrix4().makeScale(0, 0, 0);
  const at = new Vector3();
  const turn = new Quaternion();
  const one = new Vector3(1, 1, 1);
  const up = new Vector3(0, 1, 0);
  let placedAt: number | null = null;
  function update() {
    const t = shared.uTraffic.value;
    if (t === placedAt) return;
    placedAt = t;
    streetcarSections(t).forEach((s, i) => {
      mesh.setMatrixAt(
        i,
        s.shown
          ? m.compose(
              at.set(s.x, s.y, s.z),
              turn.setFromAxisAngle(up, s.yaw),
              one,
            )
          : hidden,
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  update();
  return { mesh, update };
}
