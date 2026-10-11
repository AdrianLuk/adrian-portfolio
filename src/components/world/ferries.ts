import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  type Mesh,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import { MAX_REFLECTED } from "./harbour";
import { fogChunk, fogUniforms, MOON, palette } from "./palette";
import type { SharedUniforms } from "./shared";
import type { Box } from "./structures";
import {
  HARBOUR,
  type Harbour,
  HARBOURS,
  valleyCentre,
  VICTORIA_HARBOUR,
} from "./terrain";

/**
 * The Ferries: two crossing each harbour and back, resting at each pier.
 * Toronto's cross the Harbour's bay; Hong Kong's cross Victoria Harbour from
 * Tsim Sha Tsui to Central, as the Star Ferry does. Each is a dark hull with
 * a lit cabin band, a bow light and a mast light; its light streaks across
 * the water toward the camera as the Landmarks' do (./harbour). Where they
 * are comes only from the traffic's clock, so they stand still as scenery
 * when it does.
 */

/** How fast a ferry crosses, in units a second, and how long it rests at a pier. */
export const FERRY = { speed: 4, dwell: 6 };

/** The hull's beam and length, and how high its mast light stands over the water. */
const HULL = { beam: 3, length: 9, top: 3.85 };

/**
 * Each ferry's piers, as [offset from the path's centre line, z], and how
 * far through its round trip it starts. The Harbour's keep wide of the
 * centre line, where the streetcars' bridge of light crosses the water.
 * Victoria Harbour's come in at Central right of Hong Kong's Landmarks, and
 * keep right of BT Cup's bowl as its stop sees them, so neither hides them.
 */
const ROUTES: readonly {
  harbour: Harbour;
  a: [number, number];
  b: [number, number];
  phase: number;
  bow: Color;
}[] = [
  { harbour: HARBOUR, a: [-14, -458], b: [-95, -545], phase: 0, bow: palette.cyan },
  { harbour: HARBOUR, a: [-120, -472], b: [-20, -558], phase: 0.5, bow: palette.magenta },
  { harbour: VICTORIA_HARBOUR, a: [-20, -1068], b: [6, -1170], phase: 0.2, bow: palette.cyan },
  { harbour: VICTORIA_HARBOUR, a: [12, -1070], b: [22, -1168], phase: 0.7, bow: palette.cyan },
];

export const FERRIES = ROUTES.map((route) => ({
  ...route,
  /** Its two piers, in the world's x and z. */
  ends: [route.a, route.b].map(([off, z]) => ({ x: valleyCentre(z) + off, z })),
}));

export type Ferry = (typeof FERRIES)[number];

/** A crossing's time, without the rests. */
const crossing = (ferry: Ferry) => {
  const [a, b] = ferry.ends;
  return Math.hypot(b.x - a.x, b.z - a.z) / FERRY.speed;
};

/** The seconds a ferry's round trip takes, both rests included. */
export const ferryCycle = (ferry: Ferry) => 2 * (crossing(ferry) + FERRY.dwell);

/**
 * Where a ferry is at traffic time `t`: x and z, and its heading (a turn
 * about the vertical from facing +z), bow toward the pier it makes for next.
 */
export function ferryAt(ferry: Ferry, t: number) {
  const travel = crossing(ferry);
  const cycle = ferryCycle(ferry);
  const s = (((t + ferry.phase * cycle) % cycle) + cycle) % cycle;
  const leg = s < travel + FERRY.dwell ? 0 : 1;
  const into = s - leg * (travel + FERRY.dwell) - FERRY.dwell;
  const u = Math.min(Math.max(into / travel, 0), 1);
  const eased = u * u * (3 - 2 * u);
  const from = ferry.ends[leg];
  const to = ferry.ends[1 - leg];
  return {
    x: from.x + (to.x - from.x) * eased,
    z: from.z + (to.z - from.z) * eased,
    heading: Math.atan2(to.x - from.x, to.z - from.z),
  };
}

/** The hull's four corners in plan at time `t`, as [x, z]. */
export function ferryFootprint(ferry: Ferry, t: number): [number, number][] {
  const { x, z, heading } = ferryAt(ferry, t);
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  return [-1, 1].flatMap((side) =>
    [-1, 1].map((end): [number, number] => {
      const across = (side * HULL.beam) / 2;
      const along = (end * HULL.length) / 2;
      return [x + across * cos + along * sin, z - across * sin + along * cos];
    }),
  );
}

/** The box a ferry fills at time `t`, from the waterline to its mast light. */
export function ferryBounds(ferry: Ferry, t: number): Box {
  const corners = ferryFootprint(ferry, t);
  const xs = corners.map(([x]) => x);
  const zs = corners.map(([, z]) => z);
  const level = ferry.harbour.level;
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: level + HULL.top / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
    w: Math.max(...xs) - Math.min(...xs),
    h: HULL.top,
    d: Math.max(...zs) - Math.min(...zs),
    color: palette.ink,
  };
}

/**
 * A ferry's parts, in its own frame (bow toward +z, y up from the
 * waterline): each box's size, its centre, and its light (black for the
 * moonlit dark parts).
 */
const parts = (bow: Color) =>
  [
    // The hull, the cabin band lit from within, the cabin's roof and the mast.
    [[HULL.beam, 1.1, HULL.length], [0, 0.45, 0], new Color(0, 0, 0)],
    [[2.7, 0.35, 6.6], [0, 1.3, 0], palette.ink.clone().multiplyScalar(0.9)],
    [[2.5, 0.8, 6.2], [0, 1.85, 0], new Color(0, 0, 0)],
    [[0.15, 1.3, 0.15], [0, 2.9, 0], new Color(0, 0, 0)],
    // The bow light and the mast light.
    [[0.55, 0.55, 0.55], [0, 1.4, 4.6], bow.clone().multiplyScalar(1.6)],
    [[0.55, 0.55, 0.55], [0, HULL.top - 0.275, 0], palette.ink.clone().multiplyScalar(1.6)],
  ] as const;

/** Each ferry's streak: its cabin band's light, as the water throws it back. */
const STREAK = { height: 1.3, power: 0.8 };

/**
 * The ferries as one instanced draw, their lights among their parts, and
 * their streaks in the harbours' water (`waters`, in HARBOURS' order): each
 * takes one of its harbour's ferry slots, past the Landmarks' lights. Call
 * `update` once a frame, after the traffic's clock is set.
 */
export function createFerries(shared: SharedUniforms, waters: readonly Mesh[]) {
  const pieces = FERRIES.flatMap((ferry) =>
    parts(ferry.bow).map(([size, at, light]) => ({ ferry, size, at, light })),
  );
  const material = new ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      uBase: { value: palette.night.clone().lerp(palette.dusk, 0.4) },
      uMoon: { value: MOON },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vLight;
      void main() {
        vLight = instanceColor;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uMoon;
      varying vec3 vWorld;
      varying vec3 vLight;
      ${fogChunk}
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec3 col = uBase * (0.55 + 1.1 * max(dot(n, uMoon), 0.0)) + vLight;
        col = mix(col, uFogColor, fogAmount(vWorld));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, pieces.length);
  pieces.forEach(({ light }, i) => mesh.setColorAt(i, light));
  // They move: culled by a fixed bound, they would vanish at its edge.
  mesh.frustumCulled = false;

  // Each ferry's slot in its harbour's water, past the Landmarks' lights.
  const streaks = FERRIES.map((ferry) => {
    const water = waters[HARBOURS.indexOf(ferry.harbour)];
    const slot =
      MAX_REFLECTED +
      FERRIES.filter((f) => f.harbour === ferry.harbour).indexOf(ferry);
    const { uLights, uColors, uPowers, uRelit } = (
      water.material as ShaderMaterial
    ).uniforms;
    uColors.value[slot] = palette.ink;
    uPowers.value[slot] = STREAK.power;
    uRelit.value[slot] = 0;
    return uLights.value[slot] as Vector3;
  });

  const ferryMatrix = new Matrix4();
  const partMatrix = new Matrix4();
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const one = new Quaternion();
  const scale = new Vector3();
  const centre = new Vector3();
  function update() {
    const t = shared.uTraffic.value;
    const at = FERRIES.map((ferry) => ferryAt(ferry, t));
    pieces.forEach(({ ferry, size, at: [x, y, z] }, i) => {
      const { x: fx, z: fz, heading } = at[FERRIES.indexOf(ferry)];
      ferryMatrix.compose(
        centre.set(fx, ferry.harbour.level, fz),
        turn.setFromAxisAngle(up, heading),
        scale.set(1, 1, 1),
      );
      partMatrix.compose(centre.set(x, y, z), one, scale.fromArray(size));
      mesh.setMatrixAt(i, ferryMatrix.multiply(partMatrix));
    });
    mesh.instanceMatrix.needsUpdate = true;
    FERRIES.forEach((ferry, k) =>
      streaks[k].set(at[k].x, ferry.harbour.level + STREAK.height, at[k].z),
    );
  }
  update();
  return { mesh, update };
}
