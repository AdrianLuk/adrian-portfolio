import {
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  Points,
  SphereGeometry,
} from "three";
import { DIAMOND, MOUND_RISE } from "../world/diamond";
import { createGlowPoints } from "../world/glow-points";
import { palette } from "../world/palette";
import type { DiamondStage } from "../world/scene";
import type { Game } from "./rules";
import { ballAt, batAt, BAT_LENGTH, HANDS, PLATE, type Point } from "./swing";

/**
 * The Home Run Derby drawn into the world, on the Diamond's field itself, in
 * feet from home plate (-z out to centre field), life-size: the world
 * stands it there, and its camera, raised behind home plate, frames it. The
 * batter stands in cyan, the world's light; Curvebot in magenta, on the
 * mound. Where the ball and the bat are comes from ./swing. It draws only
 * when asked: the page steps the game and calls `draw` each frame while it
 * plays, and once when anything changes.
 */

export type DerbyView = {
  /** Draws the game as it stands now. */
  draw(game: Game): void;
  /** Takes the game off the field, and frees its GPU memory. */
  dispose(): void;
};

/** The ball, a little bigger than life (a real one is under 3 inches across), to read from behind the plate. */
const BALL_RADIUS = 0.35;

/** A figure `height` feet tall: a column of light. */
function createFigure(color: Color, height: number) {
  const radius = 0.8;
  const body = new Mesh(
    new CapsuleGeometry(radius, height - 2 * radius, 4, 12),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.45 }),
  );
  body.position.y = height / 2;
  return body;
}

/**
 * Builds the game's objects and puts them on the Diamond's field once their
 * shaders have compiled.
 */
export async function createDerbyView(stage: DiamondStage): Promise<DerbyView> {
  const { shared } = stage;
  const { scale } = stage.field;
  const group = new Group();
  // The mound's top, in feet: the Diamond draws it as a hill, far higher than life.
  const moundTop = (MOUND_RISE + 0.08) / scale;
  /** Where a pitch leaves Curvebot's hand: a stride off the rubber, at shoulder height. */
  const release: Point = { x: 0.6, y: moundTop + 5.5, z: -DIAMOND.mound + 5 };

  // A right-handed batter in the box on the plate's third-base side, just
  // behind their hands.
  const batter = createFigure(palette.cyan, 6);
  batter.position.set(HANDS.x - 1.1, 0, PLATE.z + 0.6);

  // The bat, along the pivot's +x from the hands, its barrel thicker than
  // its handle: a little thicker than life, in the ball's own light, to read.
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

  const curvebot = createFigure(palette.magenta, 6.2);
  curvebot.position.set(0, moundTop, -DIAMOND.mound);

  const ball = new Mesh(
    new SphereGeometry(BALL_RADIUS, 16, 12),
    new MeshBasicMaterial({ color: palette.ink }),
  );
  const shadow = new Mesh(
    new CircleGeometry(BALL_RADIUS, 20).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: palette.night, transparent: true, opacity: 0.6 }),
  );
  // A glow's size is in world units, which the field's scale doesn't reach.
  const glow = createGlowPoints(
    [{ x: 0, y: 0, z: 0, color: palette.ink, size: 3 * scale, seed: 0 }],
    shared,
    { intensity: 0.7 },
  );

  group.add(batter, pivot, curvebot, ball, shadow, glow.points);

  function draw(game: Game) {
    const { turn, lift } = batAt(game, release);
    pivot.rotation.set(0, turn, lift);
    const at = ballAt(game, release);
    ball.visible = shadow.visible = glow.points.visible = at !== null;
    if (at) {
      ball.position.set(at.x, at.y, at.z);
      shadow.position.set(at.x, 0.1, at.z);
      shadow.scale.setScalar(Math.max(0.4, 1 - at.y / 60));
      const g = glow.points.geometry.getAttribute("position");
      g.setXYZ(0, at.x, at.y, at.z);
      g.needsUpdate = true;
    }
    stage.draw();
  }

  const guest = {
    group,
    setViewportHeight(height: number) {
      glow.setViewportHeight(height);
    },
  };

  function dispose() {
    stage.release(guest);
    group.traverse((object) => {
      if (object instanceof Mesh || object instanceof Points) {
        object.geometry.dispose();
        const materials: Material[] = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
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
