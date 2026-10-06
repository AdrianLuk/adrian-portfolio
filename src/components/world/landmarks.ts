import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LatheGeometry,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { HighlightId } from "@/content/site";
import { courtFootprint, layoutCourt } from "./court";
import type { Glow } from "./glow-points";
import { fogChunk, fogUniforms, palette } from "./palette";
import { SITES, type Site } from "./route";
import type { SharedUniforms } from "./shared";
import type { Box, Ring, Solid } from "./skyline";
import { valleyHeight } from "./terrain";
import type { Veil } from "./veil";

/**
 * The lit sites' landmarks, one for each Highlight's Project, as pure data
 * (unit tested without WebGL): a shielded gate for Control D, a hotel tower
 * for Life House, a pickleball court for Juice Bros and a stadium bowl for BT
 * Cup. Each is built from light, recognisable by its silhouette, and carries
 * its site's light, which stays where the scroll route frames it.
 */

/** A hologram that turns slowly over its foot: BT Cup's trophy. */
export type Trophy = { x: number; y: number; z: number; color: Color };

/**
 * The trophy's height, its foot to its rim; where its cup's light sits; and
 * its reach from its axis, handles and all.
 */
const TROPHY = { height: 7.4, light: 5.4, reach: 3.8 };

/** A ball of light: Juice Bros' pickleball, the site's light. */
export type Ball = { x: number; y: number; z: number; r: number; color: Color };

/** The pickleball's radius: far bigger than life, to read as a ball at a distance. */
const BALL = 1.8;

export type Landmarks = {
  /** Moonlit bodies, lit near the top in their own light. */
  bodies: Box[];
  /** Bodies with lit windows: the hotel's rooms. */
  rooms: Box[];
  /** Lines and strips of light. */
  bands: Box[];
  solids: Solid[];
  rings: Ring[];
  veils: Veil[];
  trophies: Trophy[];
  balls: Ball[];
  glows: Glow[];
  /** Each site's landmark, whole, in the sites' order. */
  bounds: Box[];
  /**
   * Every solid part as a box, for keeping the camera clear of them (the
   * ball is a light, as the glows are, not a part).
   */
  parts: Box[];
};

/** The lowest and highest ground under a w by d footprint centred on (x, z). */
function groundUnder(x: number, z: number, w: number, d: number) {
  const heights = [];
  for (const u of [-0.5, 0, 0.5]) {
    for (const v of [-0.5, 0, 0.5]) {
      heights.push(valleyHeight(x + u * w, z + v * d));
    }
  }
  return { low: Math.min(...heights), high: Math.max(...heights) };
}

/** A box standing from `foot` to `top`. */
function standing(
  x: number,
  z: number,
  foot: number,
  top: number,
  w: number,
  d: number,
  color: Color,
): Box {
  return { x, y: (foot + top) / 2, z, w, h: top - foot, d, color };
}

export function layoutLandmarks(): Landmarks {
  const out: Landmarks = {
    bodies: [],
    rooms: [],
    bands: [],
    solids: [],
    rings: [],
    veils: [],
    trophies: [],
    balls: [],
    glows: [],
    bounds: [],
    parts: [],
  };
  const build: Record<HighlightId, (site: Site, light: Color) => Box> = {
    "control-d": gate,
    "life-house": hotel,
    "juice-bros": court,
    "bt-cup": bowl,
  };
  for (const site of SITES) {
    out.bounds.push(build[site.highlight](site, palette[site.light]));
  }
  out.parts.push(
    ...out.bodies,
    ...out.rooms,
    ...out.solids.map((s) => ({
      x: s.x,
      y: s.y + s.h / 2,
      z: s.z,
      w: 2 * Math.max(s.rTop, s.rBottom),
      h: s.h,
      d: 2 * Math.max(s.rTop, s.rBottom),
      color: s.color,
    })),
    ...out.trophies.map((t) => ({
      x: t.x,
      y: t.y + TROPHY.height / 2,
      z: t.z,
      w: 2 * TROPHY.reach,
      h: TROPHY.height,
      d: 2 * TROPHY.reach,
      color: t.color,
    })),
  );
  return out;

  /**
   * Control D: a gate facing up the valley, two pylons under a lintel, the
   * site's light its glowing core on top, and a barrier held across it.
   */
  function gate({ position: p }: Site, light: Color) {
    const SPAN = 15;
    const PYLON = 2.6;
    const DEPTH = 3;
    const width = SPAN + PYLON;
    const foot = groundUnder(p.x, p.z, width, DEPTH).low - 2;
    const lintel = p.y - 1.6;
    const inner = SPAN / 2 - PYLON / 2;
    for (const end of [-1, 1]) {
      const x = p.x + (end * SPAN) / 2;
      out.bodies.push(standing(x, p.z, foot, lintel, PYLON, DEPTH, light));
      // Seams of light up the inner face, where the barrier is held, and
      // up the face looking up the valley.
      out.bands.push(
        standing(
          p.x + end * (inner - 0.04),
          p.z,
          foot,
          lintel - 2,
          0.14,
          0.7,
          light,
        ),
        standing(
          x,
          p.z + DEPTH / 2 + 0.04,
          foot,
          lintel - 0.6,
          0.5,
          0.12,
          light,
        ),
      );
      out.glows.push(
        {
          x: p.x + end * inner,
          y: foot + 2.6,
          z: p.z,
          color: light,
          size: 3.2,
          seed: 0.2,
        },
        {
          x: p.x + end * inner,
          y: lintel - 2,
          z: p.z,
          color: light,
          size: 2.6,
          seed: 0.7,
        },
      );
    }
    out.bodies.push(
      standing(p.x, p.z, lintel - 2, lintel, width, DEPTH, light),
      standing(p.x, p.z, lintel, lintel + 1.2, 4.5, 2, light),
    );
    out.bands.push(
      // The lintel's underside and its face, lit along their length.
      standing(p.x, p.z, lintel - 2.06, lintel - 1.98, 2 * inner, 0.7, light),
      standing(
        p.x,
        p.z + DEPTH / 2 + 0.04,
        lintel - 1.1,
        lintel - 0.8,
        width - 1,
        0.12,
        light,
      ),
    );
    const ground = foot + 2;
    out.veils.push({
      kind: "barrier",
      x: p.x,
      y: (ground + lintel - 2) / 2,
      z: p.z,
      w: 2 * inner,
      h: lintel - 2 - ground,
      color: light,
    });
    return standing(p.x, p.z, foot, lintel + 1.2, width, DEPTH, light);
  }

  /**
   * Life House: a boutique hotel, a slim tower of lit rooms on a podium,
   * the site's light a beacon crowning its roof.
   */
  function hotel({ position: p, side }: Site, light: Color) {
    const TOWER = 9;
    const PODIUM = { w: 15, h: 4.5, d: 12 };
    const foot = groundUnder(p.x, p.z, PODIUM.w, PODIUM.d).low - 2;
    const ground = foot + 2;
    const roof = p.y - 2.2;
    const facing = -side;
    out.rooms.push(
      standing(p.x, p.z, foot, roof, TOWER, TOWER, light),
      standing(p.x, p.z, foot, ground + PODIUM.h, PODIUM.w, PODIUM.d, light),
    );
    // The crown: a setback on the roof, ringed in light.
    out.bodies.push(standing(p.x, p.z, roof, roof + 1.4, 6, 6, light));
    out.bands.push(
      standing(
        p.x,
        p.z,
        roof - 0.7,
        roof - 0.4,
        TOWER + 0.22,
        TOWER + 0.22,
        light,
      ),
      standing(p.x, p.z, roof + 1.1, roof + 1.4, 6.22, 6.22, light),
      // A seam of light up the face looking into the valley, and the
      // entrance's canopy under it.
      standing(
        p.x + (facing * TOWER) / 2,
        p.z,
        ground + PODIUM.h,
        roof - 1,
        0.16,
        1.6,
        light,
      ),
      standing(
        p.x + (facing * PODIUM.w) / 2,
        p.z,
        ground + 2.6,
        ground + 3.1,
        0.3,
        6,
        light,
      ),
    );
    // A slab at every other floor, on the city's floor lines (its windows'
    // rows are 2.3 apart): balconies, so the tower reads as a hotel.
    for (
      let y = Math.ceil((ground + PODIUM.h) / 4.6) * 4.6;
      y < roof - 1;
      y += 4.6
    ) {
      out.bands.push(
        standing(
          p.x,
          p.z,
          y - 0.08,
          y + 0.08,
          TOWER + 0.5,
          TOWER + 0.5,
          light.clone().multiplyScalar(0.7),
        ),
      );
    }
    for (const [u, v] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      out.glows.push({
        x: p.x + u * 3,
        y: roof + 1.6,
        z: p.z + v * 3,
        color: light,
        size: 1.8,
        seed: (u + 2 * v + 3) / 6,
      });
    }
    return standing(p.x, p.z, foot, roof + 1.4, PODIUM.w, PODIUM.d, light);
  }

  /**
   * Juice Bros: a pickleball court on a plinth, its length down the valley,
   * lit by four low floodlights at its corners, with the site's light a ball
   * hanging high over the net, a lob mid-rally. Only the ball rises over the
   * ridge as the hero sees it: the court stands where the hero looks
   * straight down the valley, over its lowest ridges.
   */
  function court({ position: p }: Site, light: Color) {
    const SCALE = 0.8;
    const POLE = 5.8;
    const { w, d } = courtFootprint(SCALE);
    const { low, high } = groundUnder(p.x, p.z, w, d);
    const c = layoutCourt({
      x: p.x,
      z: p.z,
      level: high + 0.3,
      scale: SCALE,
      color: light,
    });
    out.bodies.push(c.plinth);
    out.bands.push(...c.surfaces, ...c.lines, ...c.posts, c.tape);
    out.veils.push(c.net);

    const top = high + POLE;
    for (const u of [-1, 1]) {
      for (const v of [-1, 1]) {
        const x = p.x + u * (w / 2 + 0.5);
        const z = p.z + v * (d / 2 - 4);
        out.bodies.push(standing(x, z, low - 2, top, 0.6, 0.6, light));
        // The lamp, turned in over the court.
        out.bands.push(
          standing(x - u * 0.6, z, top - 0.5, top, 1.6, 1, palette.ink),
        );
        out.glows.push({
          x: x - u * 0.9,
          y: top - 0.7,
          z,
          color: palette.ink,
          size: 3.4,
          seed: (u + 2 * v + 3) / 6,
        });
      }
    }
    out.balls.push({ x: p.x, y: p.y, z: p.z, r: BALL, color: light });
    return standing(p.x, p.z, low - 2, p.y + BALL, w + 2, d, light);
  }

  /**
   * BT Cup: an open stadium bowl, tiers of seats stepping down to a glowing
   * pitch, each tier's lip a ring of light, floodlight towers at the rim, and
   * the trophy, a hologram, hovering over the pitch with the site's light in
   * its cup.
   */
  function bowl({ position: p }: Site, light: Color) {
    const RIM = 16;
    /** How far the outer wall leans out, its foot to its rim. */
    const FLARE = 3.5;
    const PITCH = 7;
    const TIERS = 5;
    const STEP = (RIM - 1.2 - PITCH) / (TIERS - 1);
    const RISE = 1.4;
    const TOWER_AT = RIM - 0.6;
    const foot = groundUnder(p.x, p.z, 2 * RIM, 2 * RIM).low - 2;
    const ground = foot + 2;

    // The bowl's section, from the foot of its outer wall up over the rim
    // and down the tiers to the pitch (outside in, so every face looks out).
    const top = 0.4 + RISE * TIERS;
    const profile: [number, number][] = [
      [RIM - FLARE, -2],
      [RIM, top],
    ];
    for (let t = 0; t < TIERS; t++) {
      const r = RIM - 1.2 - t * STEP;
      const y = top - t * RISE;
      profile.push([r, y], [r, y - RISE]);
      out.rings.push({
        x: p.x,
        y: ground + y - 0.2,
        z: p.z,
        r: r - 0.06,
        h: 0.3,
        color: light,
      });
    }
    out.solids.push(
      {
        shape: "lathe",
        x: p.x,
        y: ground,
        z: p.z,
        rTop: RIM,
        rBottom: RIM,
        h: top + 2,
        segments: 40,
        color: light,
        wash: 0.2,
        profile,
      },
      {
        shape: "frustum",
        x: p.x,
        y: foot,
        z: p.z,
        rTop: PITCH,
        rBottom: PITCH,
        h: 2.4,
        segments: 40,
        color: light,
        wash: 1,
      },
    );
    out.rings.push({
      x: p.x,
      y: ground + top - 0.1,
      z: p.z,
      r: RIM + 0.06,
      h: 0.5,
      color: light,
    });

    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const x = p.x + Math.cos(a) * TOWER_AT;
      const z = p.z + Math.sin(a) * TOWER_AT;
      const lamp = ground + 12;
      out.bodies.push(standing(x, z, foot, lamp, 0.9, 0.9, light));
      out.bands.push(standing(x, z, lamp, lamp + 1, 2.4, 2.4, palette.ink));
      out.glows.push({
        x,
        y: lamp + 1.4,
        z,
        color: palette.ink,
        size: 4.5,
        seed: i / 4,
      });
    }

    const trophyFoot = p.y - TROPHY.light;
    out.trophies.push({ x: p.x, y: trophyFoot, z: p.z, color: light });
    // The hologram's projector, a point of light at the pitch's centre.
    out.glows.push({
      x: p.x,
      y: ground + 0.8,
      z: p.z,
      color: light,
      size: 5,
      seed: 0.4,
    });
    // The towers stand inside the rim, inside the square round it.
    return standing(
      p.x,
      p.z,
      foot,
      trophyFoot + TROPHY.height,
      2 * RIM,
      2 * RIM,
      light,
    );
  }
}

/** The trophy, standing on its foot at the origin: a cup on a stem, two handles. */
function trophyGeometry() {
  const section = [
    [0, 0],
    [1.6, 0],
    [1.6, 0.5],
    [1.1, 0.7],
    [0.45, 1.1],
    [0.32, 2.3],
    [0.7, 2.6],
    [0.38, 2.95],
    [0.55, 3.2],
    [2.1, 4.4],
    [2.6, 6.2],
    [2.75, TROPHY.height],
  ].map(([r, y]) => new Vector2(r, y));
  const cup = new LatheGeometry(section, 28);
  const handles = [-1, 1].map((end) =>
    new TorusGeometry(1.15, 0.2, 6, 14, Math.PI)
      .rotateZ(-end * (Math.PI / 2))
      .translate(end * 2.45, 5.2, 0),
  );
  return mergeGeometries(
    [cup, ...handles].map((g) => {
      const flat = g.toNonIndexed();
      flat.deleteAttribute("uv");
      return flat;
    }),
  );
}

/**
 * The trophies, holograms in additive light: brightest at their silhouettes,
 * scanned across, and turning slowly over their feet with the world's clock
 * (so still when the world is, under reduced motion).
 */
export function createTrophies(
  trophies: readonly Trophy[],
  shared: SharedUniforms,
) {
  return trophies.map((t) => {
    const geometry = trophyGeometry();
    const n = geometry.getAttribute("position").count;
    geometry.setAttribute(
      "aLight",
      new Float32BufferAttribute(
        Array.from({ length: n }, () => t.color.toArray()).flat(),
        3,
      ),
    );
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: { uTime: shared.uTime, ...fogUniforms() },
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute vec3 aLight;
        varying vec3 vLight;
        varying vec3 vWorld;
        varying vec3 vNormal;
        void main() {
          float a = uTime * 0.35;
          mat2 turn = mat2(cos(a), -sin(a), sin(a), cos(a));
          vec3 p = position;
          p.xz = turn * p.xz;
          vec3 n = normal;
          n.xz = turn * n.xz;
          vLight = aLight;
          vNormal = normalize(mat3(modelMatrix) * n);
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vLight;
        varying vec3 vWorld;
        varying vec3 vNormal;
        ${fogChunk}
        void main() {
          vec3 view = normalize(cameraPosition - vWorld);
          float edge = pow(1.0 - abs(dot(normalize(vNormal), view)), 2.0);
          float scan = 0.75 + 0.25 * sin(vWorld.y * 9.0);
          vec3 col = mix(vLight, vec3(1.0), 0.25) * (0.12 + 0.9 * edge) * scan;
          gl_FragColor = vec4(col * (1.0 - fogAmount(vWorld)), 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(t.x, t.y, t.z);
    return mesh;
  });
}

/**
 * A pickleball's 32 holes, as directions from its centre: an icosahedron's
 * 12 corners and its 20 faces' centres, spread evenly round it.
 */
function ballHoles() {
  const g = (1 + Math.sqrt(5)) / 2;
  const holes: [number, number, number][] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      holes.push([0, a, b * g], [a, b * g, 0], [a * g, 0, b]);
      holes.push([0, a / g, b * g], [a / g, b * g, 0], [a * g, 0, b / g]);
      for (const c of [-1, 1]) holes.push([a, b, c]);
    }
  }
  return holes.map(([x, y, z]) => new Vector3(x, y, z).normalize());
}

/** The balls, lit through: bright shells with dark holes, and a hot core. */
export function createBalls(balls: readonly Ball[]) {
  const holes = ballHoles();
  return balls.map((b) => {
    const material = new ShaderMaterial({
      uniforms: {
        ...fogUniforms(),
        uLight: { value: b.color.clone().lerp(palette.ink, 0.45) },
        uHoles: { value: holes },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        varying vec3 vWorld;
        void main() {
          vDir = normalize(position);
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight;
        uniform vec3 uHoles[${holes.length}];
        varying vec3 vDir;
        varying vec3 vWorld;
        ${fogChunk}
        void main() {
          float hole = 0.0;
          for (int i = 0; i < ${holes.length}; i++) {
            hole = max(hole, smoothstep(0.972, 0.982, dot(vDir, uHoles[i])));
          }
          vec3 view = normalize(cameraPosition - vWorld);
          float face = max(dot(normalize(vDir), view), 0.0);
          vec3 col = uLight * (0.75 + 0.5 * face) * (1.0 - 0.8 * hole);
          col = mix(col, uFogColor, fogAmount(vWorld));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new Mesh(new SphereGeometry(b.r, 32, 16), material);
    mesh.position.set(b.x, b.y, b.z);
    return mesh;
  });
}
