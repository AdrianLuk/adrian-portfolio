import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Line,
  LineBasicMaterial,
  Material,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  type Object3D,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { figureMaterial } from "../mii";
import { palette } from "../world/palette";
import { shootoutView } from "../world/route";
import type { ArenaStage } from "../world/scene";
import { VICTORIA_HARBOUR } from "../world/terrain";
import { BOT, doomed, type Game, type Sight } from "./rules";
import { harbourPads, shootoutSpots, type PlacedSpot } from "./spots";

/**
 * The Shootout drawn into the world, in the world's own units round the
 * Arena's stage roof: the training bots on their spots, the lit pads on
 * Victoria Harbour, and the six-shooter in the lower right of the frame,
 * which follows the camera. The camera itself is the world's, turned where
 * the visitor aims (through the stage's `aim`). It draws only when asked:
 * the page steps the game and calls `draw` each frame while it plays.
 */

export type Direction = "ahead" | "left" | "right" | "behind";

export type ShootoutView = {
  /** Where bots can pop up, as the game's rules count them. */
  spots: PlacedSpot[];
  /** Turns the aim `yaw` radians to the left and `pitch` up. */
  look(yaw: number, pitch: number): void;
  /** Radians the aim turns per pixel dragged, for the screen's height and field of view. */
  perPixel(): number;
  /** Aims at the next bot in view, to the right of the aim (round again from the left); false if none is. */
  snapToNext(game: Game): boolean;
  /** Back to facing Hong Kong. */
  resetAim(): void;
  /** What a shot fired now hits, with a phone's aim assist if `assist`, and which bots are in view. */
  sight(assist: boolean): Sight;
  /** Which way a spot is from where the visitor aims. */
  directionOf(spot: number): Direction;
  /** Where each locked-on bot's chest is on screen, in CSS pixels, while the ultimate runs, and whether firing now takes it down. */
  reticles(game: Game): { id: number; x: number; y: number; lock: number; doomed: boolean }[];
  /** Draws the game as it stands, `dt` seconds on; `recoil` kicks the gun and the view on a shot. */
  draw(game: Game, dt: number, recoil: boolean): void;
  /** Takes the game out of the world, and frees its GPU memory. */
  dispose(): void;
};

/** Up, and across, for turning the aim. */
const UP = new Vector3(0, 1, 0);

/** The bots: drawn 1.6 times life size, so they read on a phone; the chest, where a lock or a burst sits, over the feet. */
const SCALE = 1.6;
const CHEST = 1.35 * SCALE;
/** The big round head, twice a life-size one, as a Mii's is. */
const HEAD = 2.1;
/** The outline's width: a share of the distance, so it keeps its width on screen at any distance. */
const OUTLINE_WIDTH = 0.0028;

/** How far the aim may tip down and up from level, radians: down to the shore, never into the deck. */
const PITCH = { down: 0.6, up: 0.8 };

/** How near on screen a near miss must pass a bot's chest, in CSS pixels, for a phone's aim assist to count it: small, as a far bot's head is a few pixels across. */
const ASSIST_PX = 10;

/** How the six-shooter stands off the eye, in the camera's frame: lower right, nearer the middle on a narrow screen. 3 times life size at 3 times the distance, so it looks the same and stays past the camera's near plane. */
const GUN = {
  scale: 3 * 0.6,
  landscape: new Vector3(0.2, -0.17, -0.5).multiplyScalar(3),
  portrait: new Vector3(0.1, -0.21, -0.5).multiplyScalar(3),
};

/** A strafing bot's pace, radians a second of its own time. */
const STRAFE_PACE = 1.4;

/** How long a downed bot's burst flies, a tracer shows and the muzzle flashes, in seconds. */
const BURST = 0.7;
const TRACER = 0.1;
const FLASH = 0.05;

/**
 * The bots' red outline: an inverted hull, each vertex pushed out along its
 * normal by a share of its depth, so the outline is about as wide on screen
 * at 20 m as at 150 m, as an enemy's is in Overwatch.
 */
function outlineMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: palette.neonRed.clone() },
      uWidth: { value: OUTLINE_WIDTH },
    },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        mv.xyz += n * uWidth * max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
    side: BackSide,
  });
}

/** A part's outline: its copy, normals out from its middle so box corners don't crack, never hit by a shot. */
function outlineOf(geometry: BufferGeometry, material: Material) {
  const g = geometry.clone();
  const position = g.getAttribute("position");
  const normals = new Float32Array(position.count * 3);
  g.computeBoundingBox();
  const middle = g.boundingBox!.getCenter(new Vector3());
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).sub(middle).normalize();
    normals.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute("normal", new BufferAttribute(normals, 3));
  const mesh = new Mesh(g, material);
  mesh.raycast = () => {};
  return mesh;
}

/** A soft round dot, for the bursts and the muzzle flash. */
function dotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.35, "rgba(255,255,255,0.7)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/**
 * A training bot, in metres at life size, facing +z: armour plates over
 * machined limbs, a red chest core and back vents, and a big round head
 * (HEAD times life size) with a wraparound red visor, two eyes, ear pods and
 * an aerial. Each part is tagged head or body for a shot; each has the red
 * outline. Built once, then baked into one mesh per material for its head
 * and for its body, and one outline each (about a dozen draws a bot, not a
 * hundred); every bot is a clone, sharing its geometry and materials.
 */
function createTrainingBot(outline: Material) {
  const plate = figureMaterial(palette.ink, 0.08, 1.1);
  const shell = figureMaterial(palette.violet.clone().lerp(palette.ink, 0.4), 0, 1.1);
  const joint = figureMaterial(palette.dusk, 0, 0.8);
  const red = new MeshBasicMaterial({ color: palette.neonRed });
  const eye = new MeshBasicMaterial({ color: palette.ink });
  const root = new Group();
  type Placed = { rx?: number; rz?: number; sx?: number; sy?: number; sz?: number; lined?: boolean };
  const add = (
    parent: Object3D,
    geometry: BufferGeometry,
    material: Material,
    [x, y, z]: readonly [number, number, number],
    part: "head" | "body",
    { rx = 0, rz = 0, sx = 1, sy = 1, sz = 1, lined = true }: Placed = {},
  ) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    mesh.scale.set(sx, sy, sz);
    mesh.userData.part = part;
    if (lined) mesh.add(outlineOf(geometry, outline));
    parent.add(mesh);
    return mesh;
  };
  const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
  const tube = (top: number, bottom: number, h: number, sides = 16) =>
    new CylinderGeometry(top, bottom, h, sides);
  const ball = (r: number, w = 16, h = 12) => new SphereGeometry(r, w, h);
  /** A limb: a tapered tube with a rounded cap at each end, as one piece. */
  const limb = (top: number, bottom: number, h: number) => {
    const g = new LatheGeometry(
      [
        new Vector2(0, -h / 2 - bottom * 0.6),
        new Vector2(bottom * 0.75, -h / 2 - bottom * 0.35),
        new Vector2(bottom, -h / 2),
        new Vector2(top, h / 2),
        new Vector2(top * 0.75, h / 2 + top * 0.35),
        new Vector2(0, h / 2 + top * 0.6),
      ],
      16,
    );
    g.computeVertexNormals();
    return g;
  };

  // Legs: boots with toe caps, greaved shins, knee caps, plated thighs.
  for (const s of [-1, 1]) {
    add(root, box(0.15, 0.08, 0.28), joint, [s * 0.12, 0.04, 0.04], "body");
    add(root, ball(0.075, 12, 8), plate, [s * 0.12, 0.07, 0.16], "body", { sy: 0.6 });
    add(root, limb(0.065, 0.055, 0.36), shell, [s * 0.12, 0.31, 0], "body");
    add(root, box(0.1, 0.26, 0.04), plate, [s * 0.12, 0.33, 0.065], "body", { rx: 0.06 });
    add(root, ball(0.07), joint, [s * 0.12, 0.53, 0], "body");
    add(root, limb(0.085, 0.068, 0.32), shell, [s * 0.12, 0.74, 0], "body");
    add(root, box(0.05, 0.22, 0.13), plate, [s * 0.2, 0.76, 0], "body");
  }
  // Hips, a ribbed waist, a V-shaped chest with its red core, a pack with red vents.
  add(root, tube(0.17, 0.15, 0.15, 8), plate, [0, 0.97, 0], "body", { sz: 0.7 });
  add(root, tube(0.12, 0.12, 0.12, 16), joint, [0, 1.1, 0], "body", { sz: 0.8 });
  add(root, tube(0.25, 0.17, 0.36, 8), plate, [0, 1.36, 0], "body", { sz: 0.62 });
  add(root, tube(0.05, 0.05, 0.03, 20), red, [0, 1.33, 0.13], "body", { rx: Math.PI / 2, lined: false });
  add(root, box(0.28, 0.3, 0.12), shell, [0, 1.38, -0.17], "body");
  for (const s of [-1, 1]) {
    add(root, box(0.045, 0.2, 0.02), red, [s * 0.075, 1.38, -0.235], "body", { lined: false });
  }
  // Shoulders, arms held a little out, armoured forearms, hands.
  for (const s of [-1, 1]) {
    add(root, ball(0.1), plate, [s * 0.29, 1.5, 0], "body", { sy: 0.8 });
    add(root, limb(0.05, 0.045, 0.22), shell, [s * 0.32, 1.31, 0], "body", { rz: s * 0.08 });
    add(root, limb(0.06, 0.046, 0.2), shell, [s * 0.345, 1.03, 0.04], "body", { rx: -0.2 });
    add(root, box(0.07, 0.15, 0.05), plate, [s * 0.36, 1.02, 0.08], "body", { rx: -0.2 });
    add(root, box(0.07, 0.08, 0.08), joint, [s * 0.355, 0.86, 0.08], "body", { rx: -0.2 });
  }
  // A neck, then the big round head on it.
  add(root, tube(0.05, 0.06, 0.08), joint, [0, 1.58, 0], "body");
  const head = new Group();
  head.position.set(0, 1.6, 0);
  head.scale.setScalar(HEAD);
  root.add(head);
  add(head, ball(0.13, 24, 18), plate, [0, 0.11, 0], "head", { sz: 1.04 });
  add(head, new CylinderGeometry(0.131, 0.131, 0.05, 32, 1, true, -1.15, 2.3), red, [0, 0.105, 0.002], "head", {
    sz: 1.04,
    lined: false,
  });
  for (const s of [-1, 1]) {
    add(head, ball(0.014, 10, 8), eye, [s * 0.042, 0.108, 0.133], "head", { sy: 1.3, sz: 0.4, lined: false });
    add(head, tube(0.04, 0.045, 0.04, 16), shell, [s * 0.128, 0.1, -0.005], "head", { rz: Math.PI / 2 });
  }
  add(head, ball(0.075, 16, 10), shell, [0, 0.03, 0.05], "head", { sy: 0.5, sx: 1.15 });
  add(head, tube(0.004, 0.004, 0.08, 6), joint, [0.06, 0.27, -0.04], "head", { rz: -0.25, lined: false });
  add(head, ball(0.012, 8, 6), red, [0.07, 0.31, -0.04], "head", { lined: false });
  return bake(root);
}

/** Merges a figure's meshes, in its own frame, into one per part (head or body) and material. */
function bake(root: Group) {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const sets = new Map<string, { part: string; material: Material; geometries: BufferGeometry[] }>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    // An outline takes its part from the mesh it outlines.
    const part = (object.userData.part ?? object.parent?.userData.part) as string;
    const material = object.material as Material;
    const key = `${part}:${material.uuid}`;
    const set = sets.get(key) ?? { part, material, geometries: [] };
    sets.set(key, set);
    set.geometries.push(object.geometry.clone().applyMatrix4(toRoot.clone().multiply(object.matrixWorld)));
  });
  const baked = new Group();
  for (const { part, material, geometries } of sets.values()) {
    const mesh = new Mesh(mergeGeometries(geometries), material);
    mesh.userData.part = part;
    if (material instanceof ShaderMaterial && material.side === BackSide) mesh.raycast = () => {};
    baked.add(mesh);
    for (const g of geometries) g.dispose();
  }
  root.traverse((object) => {
    if (object instanceof Mesh) object.geometry.dispose();
  });
  return baked;
}

/**
 * The six-shooter, in the camera's frame (its barrel along -z): a long
 * barrel over its rod, a frame, a hammer, a violet grip, a trigger guard,
 * the cylinder with its six chambers lit spore pink, a cyan front sight and two
 * lines of cyan down the barrel, and a muzzle flash.
 */
function createSixShooter(flashMap: CanvasTexture) {
  const gun = new Group();
  const metal = figureMaterial(palette.fog.clone().lerp(palette.ink, 0.35), 0.3, 1.2);
  const dark = figureMaterial(palette.fog, 0.15, 0.9);
  const grip = figureMaterial(palette.violet, 0.3, 1);
  const cyan = new MeshBasicMaterial({ color: palette.cyan });
  const chambers = new MeshBasicMaterial({ color: palette.magenta });
  const add = (geometry: BufferGeometry, material: Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    gun.add(mesh);
    return mesh;
  };
  add(new CylinderGeometry(0.03, 0.034, 0.44, 14), metal, 0, 0.035, -0.34, Math.PI / 2);
  add(new BoxGeometry(0.045, 0.035, 0.3), dark, 0, -0.005, -0.3);
  add(new BoxGeometry(0.085, 0.12, 0.2), metal, 0, 0, -0.04);
  add(new BoxGeometry(0.05, 0.022, 0.24), dark, 0, 0.07, -0.08);
  add(new BoxGeometry(0.012, 0.03, 0.02), cyan, 0, 0.07, -0.55);
  add(new BoxGeometry(0.03, 0.05, 0.035), dark, 0, 0.075, 0.07, -0.5);
  add(new BoxGeometry(0.065, 0.2, 0.085), grip, 0, -0.13, 0.1, -0.38);
  add(new TorusGeometry(0.04, 0.007, 6, 16, Math.PI), dark, 0, -0.065, -0.02, 0, Math.PI);
  for (const s of [-1, 1]) add(new BoxGeometry(0.005, 0.005, 0.4), cyan, s * 0.033, 0.035, -0.33);
  const drum = new Group();
  drum.position.set(0, 0, -0.05);
  gun.add(drum);
  const cylinder = new Mesh(new CylinderGeometry(0.068, 0.068, 0.13, 18), metal);
  cylinder.rotation.x = Math.PI / 2;
  drum.add(cylinder);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const chamber = new Mesh(new CylinderGeometry(0.014, 0.014, 0.01, 10), chambers);
    chamber.rotation.x = Math.PI / 2;
    chamber.position.set(Math.cos(a) * 0.042, Math.sin(a) * 0.042, -0.066);
    drum.add(chamber);
  }
  const flash = new Sprite(
    new SpriteMaterial({
      map: flashMap,
      color: palette.magenta,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  flash.position.set(0, 0.035, -0.6);
  flash.scale.setScalar(0.28);
  gun.add(flash);
  gun.scale.setScalar(GUN.scale);
  return { gun, drum, flash, muzzle: new Vector3(0, 0.035, -0.6) };
}

/** The lit pads on Victoria Harbour: a dark disc on the water, its rim in the world's ink. */
function createPads() {
  const pads = new Group();
  const disc = new CylinderGeometry(2.4, 2.6, 0.4, 24);
  const ring = new TorusGeometry(2.5, 0.08, 6, 32).rotateX(Math.PI / 2);
  const dark = new MeshBasicMaterial({ color: palette.dusk.clone().lerp(palette.fog, 0.5) });
  const lit = new MeshBasicMaterial({ color: palette.ink });
  for (const p of harbourPads()) {
    const base = new Mesh(disc, dark);
    base.position.set(p.x, VICTORIA_HARBOUR.level + 0.1, p.z);
    const rim = new Mesh(ring, lit);
    rim.position.set(p.x, VICTORIA_HARBOUR.level + 0.3, p.z);
    pads.add(base, rim);
  }
  return pads;
}

/** A bot as drawn: its group on its spot, the model in it (scaled as it rises and ducks), the ring at its feet. */
type Drawn = {
  group: Group;
  model: Group;
  ring: Mesh;
  parts: Mesh[];
  /** Seconds since it went down, once it has: its burst flies, its ring fades. */
  down: number | null;
};

/** A downed bot's burst of light. */
type Burst = { points: Points; velocities: Vector3[]; age: number };

/** A shot's line of light, from the muzzle to what it hit. */
type Tracer = { line: Line; age: number };

/**
 * Builds the game's objects and puts them in the world once their shaders
 * have compiled.
 */
export async function createShootoutView(stage: ArenaStage): Promise<ShootoutView> {
  const group = new Group();
  const base = shootoutView(1).pose;
  const eye = base.position.clone();
  const spots = shootoutSpots(eye, stage.sees);

  const outline = outlineMaterial();
  const template = createTrainingBot(outline);
  const dot = dotTexture();
  const { gun, drum, flash, muzzle } = createSixShooter(dot);
  const pads = createPads();
  const ringGeometry = new RingGeometry(0.55, 0.68, 32).rotateX(-Math.PI / 2);
  const burstMaterial = new PointsMaterial({
    size: 1.1,
    map: dot,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const tracerMaterial = new LineBasicMaterial({ color: palette.magenta, transparent: true });
  group.add(pads, gun);

  /** The aim, absolute: yaw round the vertical, pitch up from level; facing Hong Kong to start. */
  const facing = new Euler().setFromQuaternion(base.quaternion, "YXZ");
  const aim = { yaw: facing.y, pitch: facing.x };
  const level = facing.x;
  let kick = 0;
  let shots = 0;
  let flashLeft = 0;

  const drawn = new Map<number, Drawn>();
  const bursts: Burst[] = [];
  const tracers: Tracer[] = [];

  /** The camera as the visitor aims it, for seeing what a shot hits and where bots stand on screen. */
  const probe = new PerspectiveCamera();
  const aimed = new Quaternion();
  function aimProbe() {
    aimed.setFromEuler(new Euler(aim.pitch, aim.yaw, 0, "YXZ"));
    probe.position.copy(eye);
    probe.quaternion.copy(aimed);
    probe.fov = stage.camera.fov;
    probe.aspect = stage.camera.aspect;
    probe.near = stage.camera.near;
    probe.far = stage.camera.far;
    probe.updateProjectionMatrix();
    probe.updateMatrixWorld();
  }

  /**
   * The world's canvas, in CSS pixels, from the screen's top: as tall as the
   * screen with a phone's address bar hidden (lvh), so taller than the
   * screen while it shows. A shot goes through its middle, not the screen's.
   */
  const screen = () => ({ width: window.innerWidth, height: window.innerWidth / stage.camera.aspect });

  /** Where `point` stands on screen, in CSS pixels, and whether it is in front. */
  function onScreen(point: Vector3) {
    const ndc = point.clone().project(probe);
    const { width, height } = screen();
    return {
      x: ((ndc.x + 1) / 2) * width,
      y: ((1 - ndc.y) / 2) * height,
      inView: ndc.z < 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1,
      front: ndc.z < 1,
    };
  }

  const chestOf = (d: Drawn) => d.group.position.clone().setY(d.group.position.y + CHEST);

  /** Where bot `bot` stands now: its spot, strafing across the line of sight. */
  function standBot(d: Drawn, bot: Game["bots"][number]) {
    const spot = spots[bot.spot].position;
    d.group.position.copy(spot);
    if (bot.strafe) {
      const across = new Vector3(eye.z - spot.z, 0, spot.x - eye.x).normalize();
      d.group.position.addScaledVector(across, Math.sin(bot.age * STRAFE_PACE + bot.strafeFrom) * bot.strafe);
    }
    d.group.rotation.y = Math.atan2(eye.x - d.group.position.x, eye.z - d.group.position.z);
  }

  function addBot(bot: Game["bots"][number]) {
    const botGroup = new Group();
    const model = template.clone();
    model.scale.set(SCALE, 0.01, SCALE);
    const ring = new Mesh(
      ringGeometry,
      new MeshBasicMaterial({ color: palette.neonRed, transparent: true, depthWrite: false }),
    );
    ring.position.y = 0.06;
    botGroup.add(model, ring);
    const parts: Mesh[] = [];
    model.traverse((object) => {
      if (object instanceof Mesh && object.userData.part) {
        object.userData.bot = bot.id;
        parts.push(object);
      }
    });
    group.add(botGroup);
    const d: Drawn = { group: botGroup, model, ring, parts, down: null };
    drawn.set(bot.id, d);
    return d;
  }

  function removeBot(id: number, d: Drawn) {
    group.remove(d.group);
    (d.ring.material as Material).dispose();
    drawn.delete(id);
  }

  /** A downed bot's burst: its light flies apart and falls. */
  function burst(at: Vector3) {
    const count = 30;
    const positions: number[] = [];
    const colors: number[] = [];
    const velocities: Vector3[] = [];
    for (let i = 0; i < count; i++) {
      positions.push(at.x, at.y, at.z);
      const c = i % 3 ? palette.neonRed : palette.ink;
      colors.push(c.r, c.g, c.b);
      velocities.push(
        new Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).multiplyScalar(9),
      );
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    const points = new Points(geometry, burstMaterial.clone());
    points.frustumCulled = false;
    group.add(points);
    bursts.push({ points, velocities, age: 0 });
  }

  function tracer(to: Vector3) {
    const from = gun.localToWorld(muzzle.clone());
    const line = new Line(new BufferGeometry().setFromPoints([from, to]), tracerMaterial.clone());
    group.add(line);
    tracers.push({ line, age: 0 });
  }

  const raycaster = new Raycaster();
  const middle = new Vector2(0, 0);

  function sight(assist: boolean): Sight {
    return {
      target(game) {
        aimProbe();
        raycaster.setFromCamera(middle, probe);
        raycaster.far = 2000;
        const live = game.bots.map((b) => drawn.get(b.id)).filter((d): d is Drawn => !!d && d.down === null);
        const [hit] = raycaster.intersectObjects(live.flatMap((d) => d.parts), false);
        if (hit) {
          tracer(hit.point);
          return { bot: hit.object.userData.bot as number, head: hit.object.userData.part === "head" };
        }
        tracer(raycaster.ray.at(600, new Vector3()));
        if (!assist) return null;
        // A near miss on a phone counts as a body shot: a headshot takes a real hit on the head.
        const { width, height } = screen();
        let best: { bot: number; px: number } | null = null;
        for (const bot of game.bots) {
          const d = drawn.get(bot.id);
          if (!d || d.down !== null) continue;
          const at = onScreen(chestOf(d));
          const px = Math.hypot(at.x - width / 2, at.y - height / 2);
          if (at.front && px <= ASSIST_PX && (!best || px < best.px)) best = { bot: bot.id, px };
        }
        return best && { bot: best.bot, head: false };
      },
      inView(id) {
        const d = drawn.get(id);
        if (!d) return false;
        aimProbe();
        return onScreen(chestOf(d)).inView;
      },
    };
  }

  /** Puts the six-shooter in the frame's lower right, kicked back by a shot. */
  function holdGun() {
    const offset = (stage.camera.aspect < 1 ? GUN.portrait : GUN.landscape).clone();
    offset.z += kick * 0.15;
    gun.position.copy(eye).add(offset.applyQuaternion(aimed));
    // Turned a little in toward the crosshair, so its side shows.
    gun.quaternion.copy(aimed).multiply(new Quaternion().setFromEuler(new Euler(kick * 0.32, 0.18, 0)));
    drum.rotation.z = shots * (Math.PI / 3);
    flash.visible = flashLeft > 0;
  }

  /** Turns the world's camera where the visitor aims, kicked up a touch by a shot. */
  function aimCamera() {
    aimProbe();
    const kicked = new Quaternion().setFromEuler(new Euler(aim.pitch + kick * 0.012, aim.yaw, 0, "YXZ"));
    stage.aim(kicked);
    holdGun();
  }

  function draw(game: Game, dt: number, recoil: boolean) {
    for (const event of game.events) {
      if (event.type === "shot") {
        shots++;
        flashLeft = FLASH;
        if (recoil) kick = 1;
      } else if (event.type === "ult-fire") {
        flashLeft = FLASH * 1.6;
        if (recoil) kick = 1.4;
        aimProbe();
        // A line of light to each bot it downs.
        for (const e of game.events) {
          if (e.type === "kill" && e.by === "ultimate") {
            const d = drawn.get(e.bot);
            if (d) tracer(chestOf(d));
          }
        }
      }
    }
    // Bots up: placed, rising and ducking; downed ones burst; gone ones go.
    const up = new Set(game.bots.map((b) => b.id));
    for (const bot of game.bots) {
      const d = drawn.get(bot.id) ?? addBot(bot);
      standBot(d, bot);
      const rising = Math.min(1, bot.age / BOT.rise);
      const ducking = Math.max(0, (bot.age - bot.life) / BOT.duck);
      d.model.scale.y = SCALE * Math.max(0.01, rising * (1 - ducking));
      (d.ring.material as MeshBasicMaterial).opacity = 1 - rising * 0.5;
    }
    const killed = new Set(game.events.flatMap((e) => (e.type === "kill" ? [e.bot] : [])));
    for (const [id, d] of drawn) {
      if (up.has(id)) continue;
      if (d.down === null && killed.has(id)) {
        d.down = 0;
        d.model.visible = false;
        burst(chestOf(d));
      }
      if (d.down === null) {
        removeBot(id, d);
        continue;
      }
      d.down += dt;
      (d.ring.material as MeshBasicMaterial).opacity = Math.max(0, 0.6 - d.down);
      if (d.down > BURST) removeBot(id, d);
    }
    for (const b of bursts) {
      b.age += dt;
      const position = b.points.geometry.getAttribute("position");
      b.velocities.forEach((v, i) => {
        v.y -= 12 * dt;
        position.setXYZ(i, position.getX(i) + v.x * dt, position.getY(i) + v.y * dt, position.getZ(i) + v.z * dt);
      });
      position.needsUpdate = true;
      (b.points.material as PointsMaterial).opacity = Math.max(0, 1 - b.age / BURST);
    }
    for (const b of bursts.filter((b) => b.age > BURST)) {
      group.remove(b.points);
      b.points.geometry.dispose();
      (b.points.material as Material).dispose();
      bursts.splice(bursts.indexOf(b), 1);
    }
    for (const t of tracers) {
      t.age += dt;
      (t.line.material as LineBasicMaterial).opacity = Math.max(0, 0.9 - (t.age / TRACER) * 0.9);
    }
    for (const t of tracers.filter((t) => t.age > TRACER)) {
      group.remove(t.line);
      t.line.geometry.dispose();
      (t.line.material as Material).dispose();
      tracers.splice(tracers.indexOf(t), 1);
    }
    kick = Math.max(0, kick - dt * 7);
    flashLeft -= dt;
    aimCamera();
    stage.draw();
  }

  function look(yaw: number, pitch: number) {
    aim.yaw += yaw;
    aim.pitch = Math.min(level + PITCH.up, Math.max(level - PITCH.down, aim.pitch + pitch));
    aimCamera();
    stage.draw();
  }

  function snapToNext(game: Game) {
    aimProbe();
    const { width } = screen();
    const seen = game.bots
      // Not the practice bot: N finds the bots that pop up.
      .filter((b) => spots[b.spot].kind !== "practice")
      .map((b) => drawn.get(b.id))
      .filter((d): d is Drawn => !!d && d.down === null)
      .map((d) => ({ d, at: onScreen(chestOf(d)) }))
      .filter(({ at }) => at.inView)
      .sort((a, b) => a.at.x - b.at.x);
    if (!seen.length) return false;
    // The next to the right of the crosshair, or round again from the left.
    const next = seen.find(({ at }) => at.x > width / 2 + 2) ?? seen[0];
    const to = chestOf(next.d).sub(eye).normalize();
    aim.yaw = Math.atan2(-to.x, -to.z);
    aim.pitch = Math.min(level + PITCH.up, Math.max(level - PITCH.down, Math.asin(to.y)));
    aimCamera();
    stage.draw();
    return true;
  }

  function directionOf(spot: number): Direction {
    aimProbe();
    const forward = new Vector3(0, 0, -1).applyQuaternion(aimed).setY(0).normalize();
    const to = spots[spot].position.clone().sub(eye).setY(0).normalize();
    const angle = Math.acos(Math.min(1, Math.max(-1, forward.dot(to))));
    if (angle < 0.6) return "ahead";
    if (angle > 2.1) return "behind";
    return forward.clone().cross(to).dot(UP) > 0 ? "left" : "right";
  }

  function reticles(game: Game) {
    if (!game.ult) return [];
    aimProbe();
    return game.bots.flatMap((bot) => {
      const d = drawn.get(bot.id);
      if (!d || bot.lock <= 0) return [];
      const at = onScreen(chestOf(d));
      return at.front ? [{ id: bot.id, x: at.x, y: at.y, lock: bot.lock, doomed: doomed(bot) }] : [];
    });
  }

  const guest = { group, setViewportHeight() {} };

  function dispose() {
    stage.aim(null);
    stage.release(guest);
    const materials = new Set<Material>();
    const geometries = new Set<BufferGeometry>();
    for (const root of [group, template]) {
      root.traverse((object) => {
        if (object instanceof Mesh || object instanceof Points || object instanceof Line || object instanceof Sprite) {
          geometries.add(object.geometry);
          materials.add(object.material as Material);
        }
      });
    }
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const m of [outline, burstMaterial, tracerMaterial]) m.dispose();
    dot.dispose();
  }

  // Compiled with everything it will draw in the scene: one bot, a burst, a tracer.
  const warm = template.clone();
  warm.position.set(eye.x, -500, eye.z);
  group.add(warm);
  aimProbe();
  holdGun();
  try {
    await stage.host(guest);
  } catch (error) {
    dispose();
    throw error;
  }
  group.remove(warm);
  flash.visible = false;
  aimCamera();
  stage.draw();

  return {
    spots,
    look,
    perPixel: () => (stage.camera.fov * Math.PI) / 180 / screen().height,
    snapToNext,
    resetAim() {
      aim.yaw = facing.y;
      aim.pitch = facing.x;
      aimCamera();
      stage.draw();
    },
    sight,
    directionOf,
    reticles,
    draw,
    dispose,
  };
}
