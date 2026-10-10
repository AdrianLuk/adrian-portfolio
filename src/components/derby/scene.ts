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
  SphereGeometry,
  Vector3,
} from "three";
import { DIAMOND, MOUND_RISE } from "../world/diamond";
import { createGlowPoints } from "../world/glow-points";
import { palette } from "../world/palette";
import type { DiamondStage } from "../world/scene";
import { PITCH_TIME, type Game, type Hit } from "./rules";

/**
 * The Home Run Derby drawn into the world, on the Diamond's field itself, in
 * feet from home plate (-z out to centre field): the world stands it there,
 * and its camera, raised behind home plate, frames it. The batter stands in
 * cyan, the world's light; Curvebot in magenta, on the mound. It draws only
 * when asked: the page steps the game and calls `draw` each frame while it
 * plays, and once when anything changes.
 */

export type DerbyView = {
  /** Draws the game as it stands now. */
  draw(game: Game): void;
  /** Takes the game off the field, and frees its GPU memory. */
  dispose(): void;
};

/**
 * The Diamond draws its chalk about ten times life (home plate is some 18
 * feet deep), to read from home's route; the game's figures stand about
 * `FIGURE` times life beside it, so they read against it.
 */
const FIGURE = 2.5;
/** The ball, bigger still, to read from behind the plate. */
const BALL_RADIUS = 2;
/** Where a pitch crosses the plate: over its middle, the drawn plate's. */
const PLATE = new Vector3(0, 4, -9);
/** Where a pitch nobody hit ends up: in the catcher's mitt, behind the plate. */
const MITT = new Vector3(0, 3, 6);
/** How far a curveball breaks, across the plate, at its widest. */
const BREAK = 8;
/** How long the bat takes to come round from contact, in seconds of game time. */
const SWING = 0.1;

/**
 * Each outcome's flight off the bat: how long it takes, in seconds of game
 * time, and how high it rises, in feet. A fly-out comes down at the warning
 * track, where it's caught.
 */
const FLIGHT = {
  "home-run": { time: 2, peak: 80 },
  "fly-out": { time: 1.8, peak: 95 },
  foul: { time: 1.3, peak: 55 },
} as const;

/**
 * How far the fence stands from home plate at `angle` off the line to
 * centre field, in feet: from the foul poles' depth at 45° to centre
 * field's at 0, drawn as a straight run between (near enough for a ball
 * landing over it).
 */
const fenceAt = (angle: number) =>
  DIAMOND.centreField -
  (DIAMOND.centreField - DIAMOND.foulLine) *
    Math.min(1, Math.abs(angle) / (Math.PI / 4));

/**
 * How far a hit carries on the drawn field, in feet: the Diamond is about
 * half a real park, so a home run's real distance lands it in the outfield's
 * seats, its share past the fence as a real one's past a 330-foot fence; a
 * fly-out is caught at the warning track; a foul drops in foul ground.
 */
function drawnCarry(hit: Hit) {
  const fence = fenceAt(hit.angle);
  if (hit.outcome === "home-run") return (fence * hit.distance) / 330;
  if (hit.outcome === "fly-out") return fence - 12;
  return 0.55 * DIAMOND.foulLine;
}

/** Where the ball is at `t` seconds of game time since it left the bat. */
function inFlight(hit: Hit, t: number) {
  const flight = FLIGHT[hit.outcome as keyof typeof FLIGHT];
  const f = Math.min(1, t / flight.time);
  const carry = drawnCarry(hit) * f;
  return new Vector3(
    PLATE.x + Math.sin(hit.angle) * carry,
    PLATE.y * (1 - f) + 4 * flight.peak * f * (1 - f),
    PLATE.z - Math.cos(hit.angle) * carry,
  );
}

/**
 * Where a pitch released at `release` is `t` seconds after it left
 * Curvebot's hand, on to the mitt once past the plate.
 */
function pitched(game: Game, release: Vector3, t: number) {
  const f = t / PITCH_TIME[game.pitch];
  if (f >= 1) {
    return PLATE.clone().lerp(MITT, Math.min(1, (f - 1) * 4));
  }
  const at = release.clone().lerp(PLATE, f);
  if (game.pitch === "curveball") at.x += BREAK * Math.sin(Math.PI * f) * f;
  return at;
}

/**
 * Where the ball is now, or null while it's in Curvebot's glove, or once a
 * strike has settled in the mitt (right under the camera).
 */
function ballAt(game: Game, release: Vector3): Vector3 | null {
  if (game.phase === "pitch") return pitched(game, release, game.clock);
  if (game.phase !== "result" || !game.hit) return null;
  const { hit } = game;
  if (hit.outcome !== "strike") return inFlight(hit, game.clock);
  const t = hit.at + game.clock;
  return t < PITCH_TIME[game.pitch] * 1.25 ? pitched(game, release, t) : null;
}

/** A figure `height` feet tall in life: a column of light, `FIGURE` times that. */
function createFigure(color: Color, height: number) {
  const tall = height * FIGURE;
  const body = new Mesh(
    new CapsuleGeometry(FIGURE, tall - 2 * FIGURE, 4, 12),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.45 }),
  );
  body.position.y = tall / 2;
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
  /** Where a pitch leaves Curvebot's hand. */
  const release = new Vector3(0, moundTop + 5 * FIGURE, -DIAMOND.mound + 6);

  // A right-handed batter, in the box on the plate's third-base side: left
  // of it from behind.
  const batter = new Group();
  batter.position.set(-15, 0, PLATE.z);
  batter.add(createFigure(palette.cyan, 6));
  const bat = new Mesh(
    new BoxGeometry(0.4 * FIGURE, 0.4 * FIGURE, 3.4 * FIGURE).translate(
      0,
      0,
      -1.7 * FIGURE,
    ),
    new MeshBasicMaterial({ color: palette.cyan.clone().lerp(palette.ink, 0.4) }),
  );
  const pivot = new Group();
  pivot.position.set(0.8 * FIGURE, 3.6 * FIGURE, 0);
  pivot.add(bat);
  batter.add(pivot);

  const curvebot = createFigure(palette.magenta, 6.5);
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
    [{ x: 0, y: 0, z: 0, color: palette.ink, size: 8 * scale, seed: 0 }],
    shared,
    { intensity: 0.7 },
  );

  group.add(batter, curvebot, ball, shadow, glow.points);

  /**
   * The bat: held up and back over the shoulder until a swing, which meets
   * the ball as it's decided (halfway round), then follows through.
   */
  function placeBat(game: Game) {
    const swung = game.phase === "result" && game.hit?.error != null;
    const through = swung ? Math.min(1, 0.5 + game.clock / SWING / 2) : 0;
    pivot.rotation.set(0, Math.PI * 0.75 - through * Math.PI * 1.1, 0.9 * (1 - through));
  }

  function draw(game: Game) {
    placeBat(game);
    const at = ballAt(game, release);
    ball.visible = shadow.visible = glow.points.visible = at !== null;
    if (at) {
      ball.position.copy(at);
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
