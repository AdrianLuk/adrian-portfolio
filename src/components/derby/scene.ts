import {
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { ADRIAN, adrianTextures, createMii, ROBOT } from "../mii";
import { REDUCED_MOTION } from "../reduced-motion";
import { DIAMOND, MOUND_FEET } from "../world/diamond";
import { palette } from "../world/palette";
import type { DiamondStage } from "../world/scene";
import { WINDUP, type Game } from "./rules";
import { ballAt, batAt, BAT_LENGTH, HANDS, type Point } from "./swing";

/**
 * The Home Run Derby drawn into the world, on the Diamond's field itself, in
 * feet from home plate (-z out to centre field): the world stands it there,
 * and its camera, behind the catcher, frames it. Adrian bats, a Mii built
 * from the world's cyan light (see ../mii), his hands on the bat; Curvebot,
 * a robot in magenta, pitches from the mound. Where the ball and the bat
 * are comes from ./swing; the ball is a baseball, white leather and red
 * seams, spinning on its way. It draws only when asked: the page steps the
 * game and calls `draw` each frame while it plays, and once when anything
 * changes.
 */

export type DerbyView = {
  /** Draws the game as it stands now. */
  draw(game: Game): void;
  /** Takes the game off the field, and frees its GPU memory. */
  dispose(): void;
};

/** The ball, a little bigger than life (a real one is under 3 inches across), to read from behind the plate. */
const BALL_RADIUS = 0.4;
/** How fast the ball spins, radians a second. */
const SPIN = 30;
/** The longest step the figures' motions take between draws, in seconds. */
const MAX_STEP = 0.05;
/** How long before the pitch Curvebot starts its throw, in seconds of game time: the arm comes through as the ball leaves. */
const THROW_LEAD = 0.15;
/** Where Adrian stands: a stride back from his hands, square to the plate. */
const STANCE = 1;

/**
 * A baseball's seam, on a sphere of `radius`: the curve a ball's two
 * figure-eight hides meet along (a + b = 1, so it lies on the sphere).
 */
function seamCurve(radius: number) {
  const a = 0.72;
  const b = 1 - a;
  const points = Array.from({ length: 120 }, (_, i) => {
    const t = (i / 120) * Math.PI * 2;
    return new Vector3(
      a * Math.cos(t) + b * Math.cos(3 * t),
      a * Math.sin(t) - b * Math.sin(3 * t),
      2 * Math.sqrt(a * b) * Math.sin(2 * t),
    ).multiplyScalar(radius);
  });
  return new CatmullRomCurve3(points, true);
}

/** A baseball: white leather with its red seam, a raised cord round it. */
function createBaseball() {
  const ball = new Group();
  const leather = new Mesh(
    new SphereGeometry(BALL_RADIUS, 24, 16),
    new MeshBasicMaterial({ color: "#f3efe4" }),
  );
  const seam = new Mesh(
    new TubeGeometry(seamCurve(BALL_RADIUS * 1.005), 160, BALL_RADIUS * 0.06, 5, true),
    new MeshBasicMaterial({ color: "#c8202b" }),
  );
  ball.add(leather, seam);
  return ball;
}

/**
 * Builds the game's objects and puts them on the Diamond's field once their
 * shaders have compiled.
 */
export async function createDerbyView(stage: DiamondStage): Promise<DerbyView> {
  const group = new Group();
  const reduced = window.matchMedia(REDUCED_MOTION);

  // Adrian, right-handed, square to the plate on its third-base side: facing
  // the plate (+x), his right side toward the catcher.
  const batter = createMii({
    color: palette.cyan,
    build: ADRIAN,
    name: "ADRIAN",
    textures: await adrianTextures(palette.cyan),
  });
  batter.group.position.set(HANDS.x - STANCE, 0, HANDS.z);
  batter.group.rotation.y = -Math.PI / 2;
  batter.group.updateMatrix();
  // His grip, in his own frame: both hands on the bat's handle.
  batter.reachFor(
    new Vector3(HANDS.x, HANDS.y, HANDS.z).applyMatrix4(
      new Matrix4().copy(batter.group.matrix).invert(),
    ),
  );

  // The bat, along the pivot's +x from the hands, its barrel thicker than
  // its handle, in the ball's own light.
  const bat = new Mesh(
    new CylinderGeometry(0.2, 0.08, BAT_LENGTH, 12)
      .rotateZ(-Math.PI / 2)
      .translate(BAT_LENGTH / 2, 0, 0),
    new MeshBasicMaterial({ color: palette.ink }),
  );
  const pivot = new Group();
  pivot.position.set(HANDS.x, HANDS.y, HANDS.z);
  // Turned round the batter, then lifted: +x turns toward -z as it comes round.
  pivot.rotation.order = "YZX";
  pivot.add(bat);

  // Curvebot on the mound, facing home.
  const curvebot = createMii({ color: palette.magenta, build: ROBOT, robot: true });
  curvebot.group.position.set(0, MOUND_FEET, -DIAMOND.mound);
  curvebot.group.rotation.y = Math.PI;
  /** Where a pitch leaves Curvebot's hand: its right arm, over the top. */
  const release: Point = { x: -0.7, y: MOUND_FEET + 3.9, z: -DIAMOND.mound + 0.6 };

  const ball = createBaseball();
  const shadow = new Mesh(
    new CircleGeometry(BALL_RADIUS, 20).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: palette.night, transparent: true, opacity: 0.6 }),
  );

  group.add(batter.group, pivot, curvebot.group, ball, shadow);

  let last: Game | null = null;
  let drawnAt = performance.now();
  /** The pitch Curvebot has thrown, so each is thrown once. */
  let thrown = 0;

  /** The figures, moved on by the time since the last draw (at half speed in slow mode, as the game). */
  function moveFigures(game: Game) {
    const now = performance.now();
    const dt = Math.min(MAX_STEP, (now - drawnAt) / 1000) * (game.slow ? 0.5 : 1);
    drawnAt = now;
    if (game !== last) {
      for (const event of game.events) {
        if (event.type === "swing") batter.swing(1);
        if (event.type === "outcome") {
          if (event.outcome === "strike") curvebot.cheer();
          else if (event.outcome === "home-run") curvebot.slump();
        }
      }
    }
    // The next pitch: the arm comes through as the ball leaves the hand.
    const next = game.pitches + 1;
    if (game.phase === "ready" || game.phase === "over") thrown = 0;
    else if (game.phase === "windup" && game.clock >= WINDUP - THROW_LEAD && thrown < next) {
      thrown = next;
      curvebot.throw();
    }
    for (const mii of [batter, curvebot]) {
      mii.setStill(reduced.matches);
      mii.update(game.paused ? 0 : dt, 0, null);
    }
    return game.paused ? 0 : dt;
  }

  function draw(game: Game) {
    const dt = moveFigures(game);
    last = game;
    const { turn, lift } = batAt(game, release);
    pivot.rotation.set(0, turn, lift);
    const at = ballAt(game, release);
    ball.visible = shadow.visible = at !== null;
    if (at) {
      ball.position.set(at.x, at.y, at.z);
      if (!reduced.matches) ball.rotation.x -= SPIN * dt;
      shadow.position.set(at.x, 0.05, at.z);
      shadow.scale.setScalar(Math.max(0.4, 1 - at.y / 60));
    }
    stage.draw();
  }

  // No glows of its own: nothing to size to the canvas.
  const guest = { group, setViewportHeight() {} };

  function dispose() {
    stage.release(guest);
    batter.dispose();
    curvebot.dispose();
    group.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        (object.material as Material).dispose();
      }
    });
  }

  try {
    await stage.host(guest);
  } catch (error) {
    dispose();
    throw error;
  }

  return { draw, dispose };
}
