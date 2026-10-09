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
import type { RallyCourt } from "./court-look";
import { COURT } from "./court-size";
import type { Glow } from "./glow-points";
import { fogChunk, fogUniforms, palette } from "./palette";
import { SITES, type Site } from "./route";
import type { SharedUniforms } from "./shared";
import { hippedRoof, type Box, type Ring, type Solid } from "./skyline";
import { groundUnder, valleyHeight } from "./terrain";
import type { Portal, Shield } from "./shield";
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

/** The HOTEL sign's letters: their size, their neon's width, and the gap between. */
const LETTER = { w: 1.35, h: 1.85, stroke: 0.28, gap: 0.3 };

/** Each letter's strokes of neon, as [u0, v0, u1, v1] across its face. */
const NEON: Record<string, [number, number, number, number][]> = (() => {
  const { w, h, stroke: s } = LETTER;
  const mid = (h - s) / 2;
  const left: [number, number, number, number] = [0, 0, s, h];
  const right: [number, number, number, number] = [w - s, 0, w, h];
  const top: [number, number, number, number] = [0, h - s, w, h];
  const bottom: [number, number, number, number] = [0, 0, w, s];
  return {
    H: [left, right, [0, mid, w, mid + s]],
    O: [left, right, top, bottom],
    T: [top, [(w - s) / 2, 0, (w + s) / 2, h]],
    E: [left, top, [0, mid, w * 0.8, mid + s], bottom],
    L: [left, bottom],
  };
})();

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
  shields: Shield[];
  portals: Portal[];
  trophies: Trophy[];
  balls: Ball[];
  glows: Glow[];
  /**
   * The court's four floodlights, apart from the other glows: the court's
   * look turns them up (see ./court-look).
   */
  floodlights: Glow[];
  /** Juice Bros' court, where the court's look plays its rally. */
  court: RallyCourt;
  /** Each site's landmark, whole, in the sites' order. */
  bounds: Box[];
  /**
   * Every part as a box, for keeping the camera clear of them and under the
   * ridge (the ball is a light, as the glows are, not a part).
   */
  parts: Box[];
};

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
  let rally: RallyCourt | null = null;
  const out: Omit<Landmarks, "court"> = {
    bodies: [],
    rooms: [],
    bands: [],
    solids: [],
    rings: [],
    veils: [],
    shields: [],
    portals: [],
    trophies: [],
    balls: [],
    glows: [],
    floodlights: [],
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
    ...out.bands,
    ...out.solids.map((s) => ({
      x: s.x,
      y: s.y + s.h / 2,
      z: s.z,
      w: 2 * Math.max(s.rTop, s.rBottom),
      h: s.h,
      d: 2 * Math.max(s.rTop, s.rBottom),
      color: s.color,
    })),
    ...out.shields.map((d) =>
      standing(d.x, d.z, d.y, d.y + d.h, 2 * d.r, 2 * d.r, d.color),
    ),
    ...out.portals.map((g) => ({
      x: g.x,
      y: g.y,
      z: g.z,
      w: 2 * (g.r + g.tube),
      h: 2 * (g.r + g.tube),
      d: 2 * g.tube,
      color: g.color,
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
  if (!rally) throw new Error("No court among the Lit sites");
  return { ...out, court: rally };

  /**
   * Control D: a shield, a dome of hex cells of light, over a gate, a ring
   * standing on a dais and facing up the valley; the site's light is the
   * dome's apex.
   */
  function gate({ position: p }: Site, light: Color) {
    const DOME = 18;
    const RING = 7.5;
    const TUBE = 0.7;
    const DAIS = { r: 10.5, h: 1 };
    const foot = groundUnder(p.x, p.z, 2 * DOME, 2 * DOME).low - 2;
    const ground = valleyHeight(p.x, p.z);
    const apex = p.y - 0.5;
    out.shields.push({
      x: p.x,
      y: foot,
      z: p.z,
      r: DOME,
      h: apex - foot,
      color: light,
    });
    out.solids.push({
      shape: "frustum",
      x: p.x,
      y: foot,
      z: p.z,
      rBottom: DAIS.r,
      rTop: DAIS.r - 0.5,
      h: ground + DAIS.h - foot,
      segments: 40,
      color: light,
      wash: 0.3,
    });
    const dais = ground + DAIS.h;
    out.rings.push(
      {
        x: p.x,
        y: dais - 0.25,
        z: p.z,
        r: DAIS.r - 0.45,
        h: 0.3,
        color: light,
      },
      { x: p.x, y: ground + 0.2, z: p.z, r: DOME - 0.4, h: 0.4, color: light },
    );
    out.portals.push({
      x: p.x,
      y: dais + TUBE + RING,
      z: p.z,
      r: RING,
      tube: TUBE,
      color: light,
    });
    // The shield in the gate's mouth, and the lights on the dais either side.
    out.glows.push(
      {
        x: p.x,
        y: dais + TUBE + RING,
        z: p.z,
        color: light,
        size: 4.5,
        seed: 0.6,
      },
      ...[-1, 1].map((end) => ({
        x: p.x + end * (RING + 1.6),
        y: dais + 0.5,
        z: p.z,
        color: light,
        size: 2.6,
        seed: (end + 1) / 4,
      })),
    );
    return standing(p.x, p.z, foot, apex, 2 * DOME, 2 * DOME, light);
  }

  /**
   * Life House: a château-style hotel, a tower of lit rooms between two
   * lower wings, each under a steep copper roof with dormers; a neon HOTEL
   * sign down its face and a covered drop-off at its door; the site's light
   * on the tower roof's finial.
   */
  function hotel({ position: p, side }: Site, light: Color) {
    const TOWER = 9.5;
    const WING = { w: 7, d: 6, h: 10 };
    const CANOPY = { out: 4.5, d: 7, h: 3.6 };
    const facing = -side;
    const span = TOWER + 2 * WING.d;
    const reach = TOWER / 2 + CANOPY.out;
    const foot = groundUnder(p.x, p.z, 2 * reach, span).low - 2;
    const ground = valleyHeight(p.x, p.z);
    const eave = ground + 15.5;
    const peak = p.y - 0.8;
    const copper = palette.cyan;
    const roof = (x: number, z: number, size: number, y: number, top: number) =>
      out.solids.push(hippedRoof(x, z, size, y, top));

    out.rooms.push(standing(p.x, p.z, foot, eave, TOWER, TOWER, light));
    roof(p.x, p.z, TOWER, eave, peak);
    // The finial the light stands on.
    out.bands.push(standing(p.x, p.z, peak, p.y - 0.3, 0.25, 0.25, copper));
    for (const end of [-1, 1]) {
      const z = p.z + end * (TOWER / 2 + WING.d / 2);
      const top = ground + WING.h;
      out.rooms.push(standing(p.x, z, foot, top, WING.w, WING.d, light));
      roof(p.x, z, WING.w - 0.5, top, top + 3.4);
    }
    // Dormers, two on each face of the tower's roof, each a lit window.
    const rise = 1.6;
    const inset =
      TOWER / 2 + 0.3 - rise * (((TOWER / 2) * 0.82) / (peak - eave));
    for (const [u, v] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      for (const along of [-2.2, 2.2]) {
        const x = p.x + u * (inset - 0.5) + v * along;
        const z = p.z + v * (inset - 0.5) + u * along;
        out.bodies.push(
          standing(
            x,
            z,
            eave + 0.6,
            eave + 2.4,
            u ? 1.2 : 1.3,
            u ? 1.3 : 1.2,
            copper,
          ),
        );
        out.bands.push(
          standing(
            x + u * 0.62,
            z + v * 0.62,
            eave + 1,
            eave + 2,
            u ? 0.06 : 0.7,
            u ? 0.7 : 0.06,
            palette.ink,
          ),
        );
      }
    }

    // The covered drop-off: a canopy on two posts out from the door, lit
    // along its edge and from beneath.
    const face = p.x + (facing * TOWER) / 2;
    const canopyX = face + (facing * CANOPY.out) / 2;
    const tip = face + facing * (CANOPY.out - 0.3);
    out.bodies.push(
      standing(
        canopyX,
        p.z,
        ground + CANOPY.h,
        ground + CANOPY.h + 0.5,
        CANOPY.out,
        CANOPY.d,
        light,
      ),
      ...[-1, 1].map((end) =>
        standing(
          tip,
          p.z + end * (CANOPY.d / 2 - 0.3),
          foot,
          ground + CANOPY.h,
          0.35,
          0.35,
          light,
        ),
      ),
    );
    out.bands.push(
      standing(
        face + facing * (CANOPY.out + 0.02),
        p.z,
        ground + CANOPY.h + 0.1,
        ground + CANOPY.h + 0.4,
        0.06,
        CANOPY.d,
        light,
      ),
      standing(
        canopyX,
        p.z,
        ground + CANOPY.h - 0.04,
        ground + CANOPY.h,
        CANOPY.out - 0.4,
        CANOPY.d - 0.4,
        palette.ink.clone().multiplyScalar(0.55),
      ),
    );
    for (const along of [-2.2, 0, 2.2]) {
      out.glows.push({
        x: canopyX,
        y: ground + CANOPY.h - 0.4,
        z: p.z + along,
        color: palette.ink,
        size: 2.2,
        seed: (along + 2.2) / 4.4,
      });
    }

    // The HOTEL sign: a blade out from the face, on the side nearer up the
    // valley, its letters in neon down both sides.
    // Clear of the canopy below it, and out over the street.
    const blade = {
      x: face + facing * 1.6,
      z: p.z + TOWER / 2 - 0.9,
      top: eave - 0.4,
    };
    const bottom = blade.top - 0.3 - 5 * LETTER.h - 4 * LETTER.gap;
    out.bodies.push(
      standing(
        blade.x,
        blade.z,
        bottom - 0.3,
        blade.top,
        3.1,
        0.35,
        palette.night,
      ),
    );
    const neon = palette.magenta.clone().lerp(palette.ink, 0.25);
    "HOTEL".split("").forEach((letter, i) => {
      const y = blade.top - 0.3 - (i + 1) * LETTER.h - i * LETTER.gap;
      for (const toward of [-1, 1]) {
        for (const [u0, v0, u1, v1] of NEON[letter]) {
          // Read left to right from whichever side it's seen from.
          const a = toward * (u0 - LETTER.w / 2);
          const b = toward * (u1 - LETTER.w / 2);
          out.bands.push({
            x: blade.x + (a + b) / 2,
            y: y + (v0 + v1) / 2,
            z: blade.z + toward * 0.22,
            w: Math.abs(b - a),
            h: v1 - v0,
            d: 0.08,
            color: neon,
          });
        }
      }
    });
    out.glows.push(
      ...[0.2, 0.5, 0.8].map((t) => ({
        x: blade.x,
        y: bottom + t * (blade.top - bottom),
        z: blade.z + 0.6,
        color: palette.magenta,
        size: 6,
        seed: t,
      })),
    );

    return standing(p.x, p.z, foot, p.y - 0.3, 2 * reach, span, light);
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
    rally = {
      x: p.x,
      z: p.z,
      level: c.top,
      halfWidth: (COURT.width * SCALE) / 2,
      halfLength: (COURT.length * SCALE) / 2,
      netHeight: COURT.netHeight * SCALE,
    };

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
        out.floodlights.push({
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
