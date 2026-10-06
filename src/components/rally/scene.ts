import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  Quaternion,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { layoutCourt } from "../world/court";
import { createGlowPoints, type Glow } from "../world/glow-points";
import { createBalls } from "../world/landmarks";
import { palette } from "../world/palette";
import { pixelRatioFor } from "../world/quality";
import type { SharedUniforms } from "../world/shared";
import { createSky } from "../world/sky";
import type { Box } from "../world/skyline";
import { createVeils } from "../world/veil";
import { REACH, type Game, type Side } from "./rules";

/**
 * The Rally game drawn in Three.js: the Juice Bros court from the world, in
 * feet, lit by its floodlights, seen from a fixed camera raised behind the
 * player's baseline. The player stands in cyan, the world's light; the AI in
 * magenta. The scene draws only when asked: the page steps the game and
 * calls `draw` each frame while it plays, and once when anything changes.
 */

export type RallyView = {
  /** Draws the game as it stands now. */
  draw(game: Game): void;
  /** The ball's trail and the hits' flashes: off in slow mode. */
  setEffects(on: boolean): void;
  /** Re-sizes and re-fits the camera, after a resize. */
  layout(): void;
  dispose(): void;
};

export type RallyViewOptions = {
  /** The GPU dropped the context: the canvas is blank until it's restored. */
  onLost: () => void;
  /** The context is back: draw again. */
  onRestored: () => void;
};

/** How many of the ball's last places its trail shows. */
const TRAIL = 9;
/** How long a hit's flash lasts, in milliseconds. */
const FLASH_MS = 260;
const BALL_RADIUS = 0.42;

/** What the camera must keep in frame: both baselines, room round them, and the ball's height. */
const FRAME_POINTS = [
  [-13, 0, 27],
  [13, 0, 27],
  [-11, 0, -23],
  [11, 0, -23],
  [0, 9, -23],
].map(([x, y, z]) => new Vector3(x, y, z));

/**
 * Fits the fixed camera to the canvas's shape: raised behind the player's
 * baseline, looking down the court, with the narrowest view that keeps the
 * whole court in frame. A portrait phone stands it further back and higher.
 */
function fitCamera(camera: PerspectiveCamera, aspect: number) {
  const portrait = aspect < 1;
  camera.position.set(0, portrait ? 30 : 19, portrait ? 46 : 41);
  camera.lookAt(0, 0, portrait ? -2 : -3);
  camera.aspect = aspect;
  const p = new Vector3();
  for (let fov = 24; fov <= 90; fov += 1) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const fits = FRAME_POINTS.every((point) => {
      p.copy(point).project(camera);
      return Math.abs(p.x) <= 0.94 && Math.abs(p.y) <= 0.94;
    });
    if (fits) return;
  }
}

/** A player: a column of light, the paddle's reach as a ring round it, and the paddle. */
function createFigure(color: Color) {
  const group = new Group();
  const body = new Mesh(
    new CapsuleGeometry(0.55, 3.6, 4, 12),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.38 }),
  );
  body.position.y = 2.4;
  const ring = new Mesh(
    new RingGeometry(REACH - 0.14, REACH, 48).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.45 }),
  );
  ring.position.y = 0.07;
  const paddle = new Mesh(
    new BoxGeometry(0.75, 1, 0.12),
    new MeshBasicMaterial({ color: color.clone().lerp(palette.ink, 0.35) }),
  );
  group.add(body, ring, paddle);
  return { group, paddle };
}

/**
 * Builds the scene on `canvas` and resolves once its shaders have compiled.
 * Null when WebGL is unavailable.
 */
export async function createRallyView(
  canvas: HTMLCanvasElement,
  options: RallyViewOptions,
): Promise<RallyView | null> {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true });
  } catch {
    return null;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(palette.night);

  const shared: SharedUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
  };
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.5, 2000);

  // The court, as the world lays it out, in Juice Bros' violet.
  const court = layoutCourt({ x: 0, z: 0, level: 0, scale: 1, color: palette.violet });
  const boxes: Box[] = [court.plinth, ...court.surfaces, ...court.lines, ...court.posts, court.tape];
  const lamps: Glow[] = [];
  for (const u of [-1, 1]) {
    for (const v of [-1, 1]) {
      const x = u * 12;
      const z = v * 19;
      boxes.push({ x, y: 9, z, w: 0.4, h: 18, d: 0.4, color: palette.dusk });
      lamps.push({ x: x - u * 0.8, y: 17.6, z, color: palette.ink, size: 2.4, seed: 0 });
    }
  }
  const unit = new BoxGeometry(1, 1, 1);
  const courtMesh = new InstancedMesh(unit, new MeshBasicMaterial(), boxes.length);
  const m = new Matrix4();
  const q = new Quaternion();
  boxes.forEach((b, i) => {
    courtMesh.setMatrixAt(i, m.compose(new Vector3(b.x, b.y, b.z), q, new Vector3(b.w, b.h, b.d)));
    courtMesh.setColorAt(i, b.color);
  });
  courtMesh.computeBoundingSphere();
  const floodlights = createGlowPoints(lamps, shared, { intensity: 1.2 });

  const figures: Record<Side, ReturnType<typeof createFigure>> = {
    player: createFigure(palette.cyan),
    ai: createFigure(palette.magenta),
  };

  const [ball] = createBalls([{ x: 0, y: 0, z: 0, r: BALL_RADIUS, color: palette.violet }]);
  const shadow = new Mesh(
    new CircleGeometry(BALL_RADIUS, 24).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: palette.night, transparent: true, opacity: 0.7 }),
  );
  shadow.position.y = 0.06;

  const trail = createGlowPoints(
    Array.from({ length: TRAIL }, (_, i) => ({
      x: 0,
      y: 0,
      z: 0,
      color: palette.violet.clone().lerp(palette.ink, 0.3),
      size: 0.9 * (1 - i / TRAIL),
      seed: 0,
    })),
    shared,
    { intensity: 0.55 },
  );
  const flash = createGlowPoints(
    [{ x: 0, y: 0, z: 0, color: palette.ink, size: 4, seed: 0 }],
    shared,
  );

  // The world's night sky over the court, and dark ground round it to the horizon.
  const sky = createSky(shared);
  const ground = new Mesh(
    new CircleGeometry(900, 48).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: palette.night.clone().lerp(palette.dusk, 0.5) }),
  );
  ground.position.y = -0.02;

  scene.add(
    ...sky.objects,
    ground,
    courtMesh,
    createVeils([court.net]),
    floodlights.points,
    figures.player.group,
    figures.ai.group,
    shadow,
    ball,
    trail.points,
    flash.points,
  );

  let effects = true;
  const history: Vector3[] = [];
  let flashAt = -Infinity;
  let last: Game | null = null;

  function layout() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const ratio = pixelRatioFor(window.devicePixelRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    shared.uPixelRatio.value = ratio;
    for (const glow of [floodlights, trail, flash]) glow.setViewportHeight(height);
    fitCamera(camera, width / height);
    sky.follow(camera.position.x, camera.position.y, camera.position.z);
    if (last) draw(last);
  }

  /** Where a player holds the paddle: out towards the ball when it's near, at their side otherwise. */
  function placePaddle(side: Side, game: Game) {
    const at = game[side];
    const { paddle } = figures[side];
    const near = Math.hypot(game.ball.x - at.x, game.ball.z - at.z) < 10;
    const reach = REACH * 0.8;
    const dx = near ? Math.max(-reach, Math.min(reach, game.ball.x - at.x)) : 1.3;
    const toNet = side === "player" ? -1 : 1;
    paddle.position.set(dx, near ? Math.max(1, Math.min(5, game.ball.y)) : 2.8, toNet * 0.9);
  }

  function draw(game: Game) {
    last = game;
    for (const side of ["player", "ai"] as const) {
      figures[side].group.position.set(game[side].x, 0, game[side].z);
      placePaddle(side, game);
    }
    const { x, y, z } = game.ball;
    ball.position.set(x, y + BALL_RADIUS, z);
    shadow.position.set(x, 0.06, z);
    shadow.scale.setScalar(Math.max(0.5, 1 - y / 14));

    const inPlay = game.phase === "rally";
    if (inPlay && !game.paused) {
      history.unshift(new Vector3(x, y + BALL_RADIUS, z));
      history.length = Math.min(history.length, TRAIL);
    } else if (!inPlay) {
      history.length = 0;
    }
    const positions = trail.points.geometry.getAttribute("position");
    for (let i = 0; i < TRAIL; i++) {
      const p = history[i] ?? history[history.length - 1] ?? ball.position;
      positions.setXYZ(i, p.x, p.y, p.z);
    }
    positions.needsUpdate = true;
    trail.points.visible = effects && inPlay && history.length > 1;

    const now = performance.now();
    if (game.events.some((e) => e.type === "hit" || e.type === "serve")) {
      flashAt = now;
      const at = flash.points.geometry.getAttribute("position");
      at.setXYZ(0, x, y + BALL_RADIUS, z);
      at.needsUpdate = true;
    }
    const fade = 1 - (now - flashAt) / FLASH_MS;
    flash.points.visible = effects && fade > 0;
    flash.setIntensity(Math.max(0, fade));

    renderer.render(scene, camera);
  }

  const onContextLost = (event: Event) => {
    event.preventDefault();
    options.onLost();
  };
  const onContextRestored = () => {
    layout();
    options.onRestored();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  function dispose() {
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    scene.traverse((object) => {
      if (object instanceof InstancedMesh) object.dispose();
      if (object instanceof Mesh || object instanceof Points) {
        object.geometry.dispose();
        const materials: Material[] = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    renderer.dispose();
    renderer.forceContextLoss();
  }

  try {
    layout();
    await renderer.compileAsync(scene, camera);
  } catch {
    dispose();
    return null;
  }

  return {
    draw,
    setEffects(on) {
      effects = on;
      if (last) draw(last);
    },
    layout,
    dispose,
  };
}
