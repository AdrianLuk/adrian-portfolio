import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  Points,
  RingGeometry,
  Vector3,
} from "three";
import { litSite } from "../lit-sites";
import { createGlowPoints } from "../world/glow-points";
import { createBalls } from "../world/landmarks";
import { palette } from "../world/palette";
import type { CourtStage } from "../world/scene";
import { dragOnCourt } from "./drag";
import { REACH, type Game, type Side, type Vec } from "./rules";

/**
 * The Rally game drawn into the world, on the Juice Bros court itself, in
 * feet: the world stands it there, and its camera, raised behind the
 * player's baseline, frames it. The player stands in cyan, the world's
 * light; the AI in magenta. It draws only when asked: the page steps the
 * game and calls `draw` each frame while it plays, and once when anything
 * changes.
 */

export type RallyView = {
  /** Draws the game as it stands now. */
  draw(game: Game): void;
  /** The ball's trail and the hits' flashes: off in slow mode. */
  setEffects(on: boolean): void;
  /**
   * How far a touch drag moves the player, in feet, from where they're
   * heading (`from`): as far as moves their image with the finger (`by`, in
   * normalised device coordinates; see ./drag). Null past the horizon.
   */
  drag(from: Vec, by: { x: number; y: number }): Vec | null;
  /** Takes the game off the court, and frees its GPU memory. */
  dispose(): void;
};

/** How many of the ball's last places its trail shows. */
const TRAIL = 9;
/** How long a hit's flash lasts, in milliseconds. */
const FLASH_MS = 260;
const BALL_RADIUS = 0.42;

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
 * Builds the game's objects and puts them on the world's court once their
 * shaders have compiled: the court's own rally ball steps off for the
 * game's.
 */
export async function createRallyView(stage: CourtStage): Promise<RallyView> {
  const { shared } = stage;
  const { scale } = stage.court;
  // In Juice Bros' light, as its Landmark burns it.
  const light = palette[litSite("juice-bros").light];
  const group = new Group();

  const figures: Record<Side, ReturnType<typeof createFigure>> = {
    player: createFigure(palette.cyan),
    ai: createFigure(palette.magenta),
  };

  const [ball] = createBalls([{ x: 0, y: 0, z: 0, r: BALL_RADIUS, color: light }]);
  const shadow = new Mesh(
    new CircleGeometry(BALL_RADIUS, 24).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: palette.night, transparent: true, opacity: 0.7 }),
  );
  shadow.position.y = 0.06;

  // A glow's size is in world units, which the court's scale doesn't reach.
  const trail = createGlowPoints(
    Array.from({ length: TRAIL }, (_, i) => ({
      x: 0,
      y: 0,
      z: 0,
      color: light.clone().lerp(palette.ink, 0.3),
      size: 0.9 * (1 - i / TRAIL) * scale,
      seed: 0,
    })),
    shared,
    { intensity: 0.55 },
  );
  const flash = createGlowPoints(
    [{ x: 0, y: 0, z: 0, color: palette.ink, size: 4 * scale, seed: 0 }],
    shared,
  );

  group.add(
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

    stage.draw();
  }

  const guest = {
    group,
    setViewportHeight(height: number) {
      for (const glow of [trail, flash]) glow.setViewportHeight(height);
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

  return {
    draw,
    setEffects(on) {
      effects = on;
      if (last) draw(last);
    },
    drag: (from, by) => dragOnCourt(stage.camera, stage.court, from, by),
    dispose,
  };
}
