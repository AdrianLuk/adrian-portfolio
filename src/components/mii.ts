import {
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  AdditiveBlending,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  Shape,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  BoxGeometry,
  type Texture,
} from "three";
import { palette } from "./world/palette";

/**
 * A Mii-style figure built from light, in feet: the shape and motion of the
 * Juice Bros Rally game's Mii (`juice-bros/src/components/apps/rally/mii.ts`),
 * restyled for the world. Each part is solid and dark, tinted toward the
 * figure's colour and edged by a rim of it, so it reads on any court and
 * nothing shows through it; hands, shoes and what it holds are mostly lit.
 * Adrian has his buzz cut, glasses and ADRIAN across his back; a robot (the
 * Rally game's Dinkbot, the Derby's Curvebot) a visor and an antenna, and
 * no face or name. Nothing is drawn from a photo.
 *
 * It faces -z; its right is +x. Every motion is procedural: a bob and
 * stride while it runs, a shoulder turn on a swing, arms up for a point won
 * and a droop for one lost, a pitcher's throw, and both hands held on a
 * point (a batter's grip).
 */

export type Build = {
  /** Against a standard figure: height, leg length, torso width and depth, limb thickness. */
  height: number;
  legs: number;
  width: number;
  depth: number;
  limbs: number;
};

/** Adrian's build in the Juice Bros game, pushed stockier so it reads at phone size. */
export const ADRIAN: Build = { height: 0.9, legs: 1.1, width: 1.3, depth: 1.2, limbs: 1.35 };
/** A robot's: a standard figure. */
export const ROBOT: Build = { height: 1, legs: 1, width: 1, depth: 1, limbs: 1 };

export type Mii = {
  group: Group;
  /** Starts a swing: a forehand (+1) or a backhand (-1). */
  swing(side: 1 | -1): void;
  cheer(): void;
  slump(): void;
  /** Starts a pitcher's throw with the right arm. */
  throw(): void;
  /** Holds both hands on `point` (in the figure's own frame), or lets go (null). */
  reachFor(point: Vector3 | null): void;
  /** Holds still, in a neutral pose: no stride, bob, cheer, slump or throw. For reduced motion. */
  setStill(still: boolean): void;
  /**
   * Advances the motions by `dt` seconds. `speed` is how fast the figure
   * moves (feet a second); `ball` is where the ball is in the figure's own
   * frame, or null when it's far.
   */
  update(dt: number, speed: number, ball: { x: number; y: number; z: number } | null): void;
  dispose(): void;
};

export type MiiOptions = {
  color: Color;
  build: Build;
  /** Upper case, across the back. */
  name?: string;
  /** A robot: a visor and an antenna in place of a face, hair and glasses. */
  robot?: boolean;
  /** A paddle in the right hand. */
  paddle?: boolean;
  /** The name's and the buzz cut's textures, drawn by `nameTexture` and `stubbleTexture` in the browser. */
  textures?: { name?: Texture; hair?: Texture };
};

/** The head: big, as a Mii's is. */
const HEAD_R = 1.15;
/** How long a swing, a cheer, a slump and a throw last, in seconds. */
const SWING = 0.3;
const CHEER = 1.2;
const SLUMP = 1.1;
const THROW = 0.5;
/** From the shoulder to the middle of the hand, in feet. */
const ARM = 1;
/** The paddle's reach, round the player, in feet (the Rally game's REACH). */
const REACH = 3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Eases `from` toward `to` at `rate` per second. */
const ease = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));

/**
 * A part's material: dark (the night, tinted 14% toward `color`), edged by a
 * fresnel rim of `color`, lit through by `core`. Opaque and depth-writing.
 */
function figureMaterial(color: Color, core = 0, rim = 1.25, map: Texture | null = null) {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uDark: { value: palette.night.clone().lerp(color, 0.14) },
      uCore: { value: core },
      uRim: { value: rim },
      uMap: { value: map },
      uUseMap: { value: map ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uDark;
      uniform float uCore;
      uniform float uRim;
      uniform sampler2D uMap;
      uniform float uUseMap;
      varying vec3 vN;
      varying vec3 vV;
      varying vec2 vUv;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        vec3 base = uUseMap > 0.5 ? texture2D(uMap, vUv).rgb : uDark;
        gl_FragColor = vec4(mix(base, uColor, clamp(uCore + uRim * pow(f, 2.2), 0.0, 1.0)), 1.0);
      }
    `,
  });
}

/** The name across the back, in `font`, in the world's ink. Browser only. */
export function nameTexture(text: string, font: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 300;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `#${palette.ink.getHexString()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 150px ${font}`;
  ctx.fillText(text, 256, 160, 490);
  return new CanvasTexture(canvas);
}

/**
 * A buzz cut: short strokes of `color` over near-black, so the hair reads as
 * a dark mass edged in light. A fixed sequence, so every visit draws the
 * same hair. Browser only.
 */
export function stubbleTexture(color: Color) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, 0, 256, 256);
  const [r, g, b] = [color.r, color.g, color.b].map((c) => Math.round(c * 255));
  ctx.strokeStyle = `rgba(${r},${g},${b},0.45)`;
  ctx.lineWidth = 1.2;
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 1400; i++) {
    const x = random() * 256;
    const y = random() * 256;
    const a = Math.PI / 2 + (random() - 0.5) * 0.8;
    const l = 3 + random() * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(4, 2);
  return texture;
}

/**
 * Adrian's name and buzz cut, in `color`: the name in the site's display
 * face, once it has loaded. Browser only.
 */
export async function adrianTextures(color: Color) {
  const font = await displayFont();
  return { name: nameTexture("ADRIAN", font), hair: stubbleTexture(color) };
}

/** The site's display face, for drawing into a texture, once it has loaded. Browser only. */
export async function displayFont() {
  const font =
    getComputedStyle(document.body).getPropertyValue("--font-display").trim() ||
    "sans-serif";
  await document.fonts.load(`800 150px ${font}`).catch(() => {});
  return font;
}

/** A rounded rectangle from `bottom` up to `top`, `width` across, rounder at the top. */
function roundedRect(width: number, top: number, bottom: number, r: number) {
  const x = width / 2;
  const rt = r * 1.5;
  const shape = new Shape();
  shape.moveTo(-x + r, bottom);
  shape.lineTo(x - r, bottom);
  shape.absarc(x - r, bottom + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x, top - rt);
  shape.absarc(x - rt, top - rt, rt, 0, Math.PI / 2, false);
  shape.lineTo(-x + rt, top);
  shape.absarc(-x + rt, top - rt, rt, Math.PI / 2, Math.PI, false);
  shape.lineTo(-x, bottom + r);
  shape.absarc(-x + r, bottom + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

export function createMii({
  color,
  build,
  name,
  robot = false,
  paddle = false,
  textures = {},
}: MiiOptions): Mii {
  const { height: h, legs: legScale, width: w, depth: d, limbs } = build;
  const body = figureMaterial(color);
  const bright = figureMaterial(color.clone().lerp(palette.ink, 0.35), 0.75, 1);

  const group = new Group();
  /** Everything that bobs and hops: the whole figure off the ground. */
  const lift = new Group();
  lift.name = "body";
  /** Everything that turns with a swing: torso, arms and head. */
  const upper = new Group();
  upper.name = "upper";
  group.add(lift);

  if (paddle) {
    const ring = new Mesh(
      new RingGeometry(REACH - 0.14, REACH, 48).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    ring.position.y = 0.07;
    group.add(ring);
  }

  const legLength = 1.5 * h * legScale;
  const hipY = legLength;
  const legR = 0.24 * limbs;
  const leg = (x: number, label: string) => {
    const pivot = new Group();
    pivot.name = label;
    pivot.position.set(x * w, hipY, 0);
    const limb = new Mesh(new CapsuleGeometry(legR, legLength - legR * 2, 4, 10), body);
    limb.position.y = -legLength / 2;
    const shoe = new Mesh(new SphereGeometry(0.28, 12, 8), bright);
    shoe.scale.set(1, 0.6, 1.5);
    shoe.position.set(0, -legLength + 0.1, -0.12);
    pivot.add(limb, shoe);
    lift.add(pivot);
    return pivot;
  };
  const legLeft = leg(-0.3, "legLeft");
  const legRight = leg(0.3, "legRight");

  upper.position.y = hipY;
  lift.add(upper);
  const torso = new Mesh(new CapsuleGeometry(0.62, 0.8, 6, 20), body);
  torso.scale.set(w, 1, d);
  torso.position.y = 0.85;
  upper.add(torso);
  if (name && textures.name) {
    // About a quarter larger than the Juice Bros strip, so it reads on a phone.
    const strip = new Mesh(
      new CylinderGeometry(0.63, 0.63, 0.72, 16, 1, true, -0.85, 1.7),
      new MeshBasicMaterial({
        map: textures.name,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    strip.position.y = 0.15;
    torso.add(strip);
  }

  const armR = 0.17 * limbs;
  const arm = (x: number, label: string, handLabel: string) => {
    const pivot = new Group();
    pivot.name = label;
    pivot.position.set(x * 0.72 * w, 1.42, 0);
    const limb = new Mesh(new CapsuleGeometry(armR, 0.7, 4, 8), body);
    limb.position.y = -0.5;
    const hand = new Mesh(new SphereGeometry(0.2 + 0.03 * limbs, 12, 8), bright);
    hand.name = handLabel;
    hand.position.y = -ARM;
    pivot.add(limb, hand);
    upper.add(pivot);
    return pivot;
  };
  const armLeft = arm(-1, "armLeft", "handLeft");
  const armRight = arm(1, "armRight", "handRight");

  if (paddle) {
    const held = new Group();
    const face = new ExtrudeGeometry(roundedRect(0.68, 1.26, 0.28, 0.16), {
      depth: 0.06,
      bevelEnabled: false,
      curveSegments: 10,
    });
    face.rotateZ(Math.PI).translate(0, 0, -0.03);
    held.add(new Mesh(face, bright));
    const grip = new Mesh(new CylinderGeometry(0.068, 0.072, 0.5, 10), body);
    grip.position.y = -0.04;
    held.add(grip);
    held.position.y = -1.05;
    armRight.add(held);
  }

  const head = new Group();
  head.name = "head";
  head.position.y = 1.85 + HEAD_R * 0.85;
  upper.add(head);
  if (robot) {
    // A rounded box of a head, a lit visor where a face would be, an antenna.
    const skull = new Mesh(
      new CapsuleGeometry(HEAD_R * 0.8, HEAD_R * 0.5, 6, 20).rotateZ(Math.PI / 2),
      body,
    );
    skull.scale.set(1, 1.15, 1.05);
    const visor = new Mesh(new BoxGeometry(1.6, 0.34, 0.2), bright);
    visor.position.set(0, 0.05, -0.9);
    const stalk = new Mesh(new CylinderGeometry(0.05, 0.05, 0.7, 6), body);
    stalk.position.y = 1.25;
    const tip = new Mesh(new SphereGeometry(0.16, 10, 8), bright);
    tip.position.y = 1.65;
    head.add(skull, visor, stalk, tip);
  } else {
    // Big, round and deep, the top a little flat; a dark stubbly buzz cut down to the nape.
    head.scale.set(1.05, 1, 1.025);
    const skull = new Mesh(new SphereGeometry(HEAD_R, 40, 28), body);
    skull.scale.y = 0.97;
    const hair = new Mesh(
      new SphereGeometry(HEAD_R * 1.03, 40, 16, 0, Math.PI * 2, 0, 1.45),
      figureMaterial(color, 0, 0.9, textures.hair ?? null),
    );
    hair.rotation.x = 0.45;
    hair.scale.y = 0.97;
    head.add(skull, hair);
    for (const x of [-1, 1]) {
      const ear = new Mesh(new SphereGeometry(0.22, 10, 8), body);
      ear.scale.set(0.63, 1.05, 0.84);
      ear.position.set(x * HEAD_R * 0.97, -0.1, 0.05);
      head.add(ear);
    }
    // Glasses: rectangular frames, and temples back over the ears, so they show from behind.
    const frame = figureMaterial(palette.ink, 1, 0);
    for (const x of [-1, 1]) {
      const rim = roundedRect(0.64, 0.21, -0.21, 0.08);
      rim.holes.push(roundedRect(0.48, 0.13, -0.13, 0.05));
      const lens = new Mesh(
        new ExtrudeGeometry(rim, { depth: 0.05, bevelEnabled: false, curveSegments: 6 }),
        frame,
      );
      lens.position.set(x * 0.42, 0.05, -1.14);
      lens.rotation.y = Math.atan2(x * 0.42, -1.14);
      const path = [0.62, 0.95, 1.3, 1.62].map(
        (a) => new Vector3(x * Math.sin(a) * 1.2, 0.1, -Math.cos(a) * 1.2),
      );
      path.push(new Vector3(x * Math.sin(1.72) * 1.16, -0.2, -Math.cos(1.72) * 1.16));
      const temple = new Mesh(new TubeGeometry(new CatmullRomCurve3(path), 24, 0.07, 6), frame);
      head.add(lens, temple);
    }
    const bridge = new Mesh(new BoxGeometry(0.22, 0.05, 0.05), frame);
    bridge.position.set(0, 0.12, -1.17);
    head.add(bridge);
  }

  let stride = 0;
  let running = 0;
  let swingT = Infinity;
  let swingSide: 1 | -1 = 1;
  let cheerT = Infinity;
  let slumpT = Infinity;
  let throwT = Infinity;
  let still = false;
  let grip: Vector3 | null = null;

  const down = new Vector3(0, -1, 0);
  const toGrip = new Vector3();
  const aimed = new Quaternion();

  /** Points `pivot`'s arm at the grip, its length stretched to reach it, Mii-style. */
  function hold(pivot: Group, dt: number) {
    group.updateWorldMatrix(true, true);
    toGrip.copy(grip!);
    group.localToWorld(toGrip);
    upper.worldToLocal(toGrip).sub(pivot.position);
    const length = toGrip.length();
    aimed.setFromUnitVectors(down, toGrip.normalize());
    pivot.quaternion.slerp(aimed, 1 - Math.exp(-30 * dt));
    pivot.scale.y = ease(pivot.scale.y, length / ARM, 30, dt);
  }

  function update(
    dt: number,
    speed: number,
    ball: { x: number; y: number; z: number } | null,
  ) {
    swingT += dt;
    cheerT += dt;
    slumpT += dt;
    throwT += dt;
    if (still) {
      // A neutral stance: no stride, bob, cheer, slump or throw.
      running = 0;
      cheerT = slumpT = throwT = Infinity;
    }
    running = still ? 0 : ease(running, clamp(speed / 9, 0, 1), 12, dt);
    stride += dt * (4 + 8 * running);

    // Running: legs stride, arms pump against them, the body bobs.
    const s = Math.sin(stride) * running;
    legLeft.rotation.x = s * 0.7;
    legRight.rotation.x = -s * 0.7;
    let hop = Math.abs(Math.sin(stride)) * 0.14 * running;
    let left = { x: -s * 0.6, z: -0.12 };
    let right = { x: s * 0.6 + 0.35, z: 0.25 };

    // Ready for the ball: the paddle arm reaches toward it, forehand or backhand.
    if (ball) {
      const up = clamp((ball.y - 2.5) / 3, 0, 1);
      right =
        ball.x >= -0.3
          ? { x: 0.5 + up * 1.2, z: 0.35 + clamp(ball.x / 3, 0, 1) * 0.9 }
          : { x: 0.9 + up * 1.0, z: -0.2 - clamp(-ball.x / 3, 0, 1) * 0.7 };
    }

    // A swing: the shoulders turn through the ball.
    let turn = 0;
    if (swingT < SWING) {
      const t = swingT / SWING;
      turn = swingSide * (0.7 - 1.6 * t) * Math.sin(Math.PI * Math.min(1, t * 1.2));
      right.x += 0.6 * Math.sin(Math.PI * t);
    }
    upper.rotation.y = ease(upper.rotation.y, turn, 30, dt);

    // A throw: the arm back behind the head, then over the top and through.
    if (throwT < THROW) {
      const t = throwT / THROW;
      right = t < 0.3 ? { x: -2.6, z: 0.3 } : { x: 1.8, z: 0.1 };
      left = { x: 1.2, z: -0.3 };
    }

    // A point won: arms up, a few hops. A point lost: head and shoulders drop.
    let droop = 0;
    if (cheerT < CHEER) {
      hop += Math.abs(Math.sin(cheerT * Math.PI * 3)) * 0.6 * (1 - cheerT / CHEER);
      left = { x: 0.2, z: -2.6 };
      right = { x: 0.2, z: 2.6 };
    } else if (slumpT < SLUMP) {
      droop = Math.sin(Math.PI * (slumpT / SLUMP));
      left = { x: -0.1, z: -0.05 };
      right = { x: 0.1, z: 0.1 };
    }
    lift.position.y = hop;
    head.rotation.x = ease(head.rotation.x, -0.45 * droop, 14, dt);
    upper.rotation.x = ease(upper.rotation.x, -0.15 * droop, 14, dt);
    for (const [pivot, to] of [
      [armLeft, left],
      [armRight, right],
    ] as const) {
      if (grip) {
        hold(pivot, dt);
        continue;
      }
      pivot.scale.y = ease(pivot.scale.y, 1, 18, dt);
      pivot.rotation.x = ease(pivot.rotation.x, to.x, 18, dt);
      pivot.rotation.z = ease(pivot.rotation.z, to.z, 18, dt);
    }
  }

  return {
    group,
    swing(side) {
      swingSide = side;
      swingT = 0;
    },
    cheer() {
      cheerT = 0;
      slumpT = Infinity;
    },
    slump() {
      slumpT = 0;
      cheerT = Infinity;
    },
    throw() {
      throwT = 0;
    },
    reachFor(point) {
      grip = point && point.clone();
    },
    setStill(on) {
      still = on;
    },
    update,
    dispose() {
      const materials = new Set<Material>();
      group.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          materials.add(object.material as Material);
        }
      });
      for (const material of materials) material.dispose();
      textures.name?.dispose();
      textures.hair?.dispose();
    },
  };
}
