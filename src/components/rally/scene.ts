import {
  CircleGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  Points,
  Vector3,
} from "three";
import { litSite } from "../lit-sites";
import { ADRIAN, adrianTextures, createMii, ROBOT, type Mii } from "../mii";
import { REDUCED_MOTION } from "../reduced-motion";
import { createGlowPoints } from "../world/glow-points";
import { createBalls } from "../world/landmarks";
import { palette } from "../world/palette";
import type { CourtStage } from "../world/scene";
import { dragOnCourt } from "./drag";
import type { Game, Side, Vec } from "./rules";

/**
 * The Rally game drawn into the world, on the Juice Bros court itself, in
 * feet: the world stands it there, and its camera, raised behind the
 * player's baseline, frames it. The player is Adrian, a Mii built from the
 * world's cyan light, ADRIAN across his back; Dinkbot a robot in magenta
 * (see ../mii). Each runs, swings a forehand or a backhand at its hits, and
 * cheers or slumps at each point; under reduced motion both stand still. It
 * draws only when asked: the page steps the game and calls `draw` each
 * frame while it plays, and once when anything changes.
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

/** The longest step a figure's motions take between draws, in seconds. */
const MAX_STEP = 0.05;
/** How near the ball must be, in feet, for a player to reach for it. */
const NEAR = 10;

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

  const figures: Record<Side, Mii> = {
    player: createMii({
      color: palette.cyan,
      build: ADRIAN,
      name: "ADRIAN",
      paddle: true,
      textures: await adrianTextures(palette.cyan),
    }),
    ai: createMii({ color: palette.magenta, build: ROBOT, robot: true, paddle: true }),
  };
  // Dinkbot faces the player, down +z.
  figures.ai.group.rotation.y = Math.PI;
  const reduced = window.matchMedia(REDUCED_MOTION);

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
  let drawnAt = performance.now();

  /**
   * Moves the players on: where they stand, how fast they ran there, the
   * ball as each sees it (x to their right, z behind them), a swing at each
   * of their hits, and a cheer or a slump at each point (once per step, as
   * a game is drawn again when it pauses).
   */
  function movePlayers(game: Game, from: Game | null) {
    const now = performance.now();
    const dt = Math.min(MAX_STEP, (now - drawnAt) / 1000);
    drawnAt = now;
    const fresh = game !== from;
    for (const side of ["player", "ai"] as const) {
      const mii = figures[side];
      const at = game[side];
      const facing = side === "player" ? 1 : -1;
      const moved = from ? Math.hypot(at.x - from[side].x, at.z - from[side].z) : 0;
      const ball = {
        x: facing * (game.ball.x - at.x),
        y: game.ball.y,
        z: facing * (game.ball.z - at.z),
      };
      const near = Math.hypot(ball.x, ball.z) < NEAR;
      if (fresh) {
        for (const event of game.events) {
          if (event.type === "hit" && event.side === side) {
            mii.swing(ball.x >= -0.3 ? 1 : -1);
          } else if (event.type === "point") {
            if (event.winner === side) mii.cheer();
            else mii.slump();
          }
        }
      }
      mii.setStill(reduced.matches);
      mii.group.position.set(at.x, 0, at.z);
      mii.update(dt, dt > 0 ? moved / dt : 0, near ? ball : null);
    }
  }

  function draw(game: Game) {
    movePlayers(game, last);
    last = game;
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
    for (const mii of Object.values(figures)) mii.dispose();
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
