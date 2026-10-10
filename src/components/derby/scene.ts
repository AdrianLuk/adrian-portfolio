import {
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  Curve,
  Group,
  LatheGeometry,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { ADRIAN, adrianTextures, createMii, displayFont, ROBOT } from "../mii";
import { REDUCED_MOTION } from "../reduced-motion";
import { DIAMOND, MOUND_FEET } from "../world/diamond";
import { palette } from "../world/palette";
import { derbyView, fieldPoint, homeRunView } from "../world/route";
import type { DiamondStage } from "../world/scene";
import type { Shot } from "./replay";
import { resultBeat, WINDUP, type Game } from "./rules";
import {
  ballAt,
  BALL_RADIUS,
  between,
  batAt,
  BAT_PROFILE,
  HANDS,
  homeRunFlight,
  RELEASE,
  type Point,
} from "./swing";

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
  /** Draws the game as it stands now: from the Derby's view, or from `shot` (the Play of the Game's camera). */
  draw(game: Game, shot?: Shot | null): void;
  /** Takes the game off the field, and frees its GPU memory. */
  dispose(): void;
};

/** How fast the ball spins, radians a second. */
const SPIN = 30;
/** The longest step the figures' motions take between draws, in seconds. */
const MAX_STEP = 0.05;
/** How long before the pitch Curvebot starts its throw, in seconds of game time: the arm comes through as the ball leaves. */
const THROW_LEAD = 0.15;
/** Where Adrian stands: a stride back from his hands, square to the plate. */
const STANCE = 1;
/** Up, for aiming the Play of the Game's camera. */
const UP = new Vector3(0, 1, 0);

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

/** How long a home run's tracer and label take to fade as the beat ends, in seconds of game time. */
const FADE = 0.35;
/** How many steps the tracer's tube is built in, and round. */
const TRACER_STEPS = 120;
const TRACER_SIDES = 8;
/** The tracer's bright core and its glow, in feet across. */
const TRACER_CORE = 0.6;
const TRACER_GLOW = 2;
/** The distance label's height, in the sprite's screen units (it keeps its size at any distance). */
const LABEL_HEIGHT = 0.07;

/**
 * A path through `points`, equal steps in time: `getPointAt` is its share
 * of the way through them, not of its length, so the tube drawn along it
 * runs to the ball at the same share of the flight.
 */
class TracerPath extends Curve<Vector3> {
  constructor(private readonly points: readonly Point[]) {
    super();
  }

  getPoint(t: number, target = new Vector3()) {
    const at = Math.min(1, Math.max(0, t)) * (this.points.length - 1);
    const i = Math.min(this.points.length - 2, Math.floor(at));
    const { x, y, z } = between(this.points[i], this.points[i + 1], at - i);
    return target.set(x, y, z);
  }

  getUtoTmapping(u: number) {
    return u;
  }
}

/**
 * A home run's tracer, as broadcasts draw them: a line of the Diamond's
 * cyan light, a bright core in a soft glow. It drops into the seats, which
 * hide its end, as a ball landing there would be.
 */
function createTracer() {
  const group = new Group();
  const tubes = [
    { radius: TRACER_GLOW / 2, color: palette.cyan, opacity: 0.3 },
    { radius: TRACER_CORE / 2, color: palette.ink, opacity: 0.95 },
  ].map(({ radius, color, opacity }) => {
    const tube = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({
        color,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    tube.renderOrder = 10;
    group.add(tube);
    return { tube, radius, opacity };
  });
  group.visible = false;
  return {
    group,
    /** Lays the tracer along a new flight. */
    trace(points: readonly Point[]) {
      const curve = new TracerPath(points);
      for (const { tube, radius } of tubes) {
        tube.geometry.dispose();
        tube.geometry = new TubeGeometry(
          curve,
          TRACER_STEPS,
          radius,
          TRACER_SIDES,
          false,
        );
      }
    },
    /** Draws it on a share `drawn` of the way along, at `fade` of its light. */
    draw(drawn: number, fade: number) {
      group.visible = drawn > 0 && fade > 0;
      const count = Math.round(drawn * TRACER_STEPS) * TRACER_SIDES * 6;
      for (const { tube, opacity } of tubes) {
        tube.geometry.setDrawRange(0, count);
        (tube.material as MeshBasicMaterial).opacity = opacity * fade;
      }
    },
  };
}

/**
 * A home run's distance where it lands, as broadcasts label it: "432 FT" in
 * the display face, on a pill of the night, on a stage of this `scale`
 * (world units to the foot). Over everything, the seats included.
 */
function createLabel(font: string, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
    fog: false,
  });
  const sprite = new Sprite(material);
  sprite.renderOrder = 11;
  // Standing on the spot it labels, reaching back over the field: the wide
  // shot (see `homeRunView`) has the ball land right of its climb, toward
  // the frame's edge.
  sprite.center.set(0.9, -0.15);
  sprite.visible = false;
  const hex = (color: Color) => `#${color.getHexString()}`;
  return {
    sprite,
    /**
     * Sizes it for a screen of this shape: a share of the screen's height,
     * less on one taller than it is wide, so it keeps to a share of the
     * width there. Its own size on screen whatever the stage's scale (a
     * sprite that keeps its size still takes its parent's).
     */
    fit(aspect: number) {
      const height = LABEL_HEIGHT * Math.min(1, aspect * 1.4);
      sprite.scale
        .set((height * canvas.width) / canvas.height, height, 1)
        .divideScalar(scale);
    },
    /** Shows `text` standing on `at`. */
    show(text: string, at: Point) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.roundRect(
        8,
        8,
        canvas.width - 16,
        canvas.height - 16,
        (canvas.height - 16) / 2,
      );
      ctx.fillStyle = hex(palette.night);
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 6;
      ctx.strokeStyle = hex(palette.cyan);
      ctx.stroke();
      ctx.fillStyle = hex(palette.ink);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 84px ${font}`;
      ctx.fillText(
        text,
        canvas.width / 2,
        canvas.height / 2 + 4,
        canvas.width - 80,
      );
      texture.needsUpdate = true;
      sprite.position.set(at.x, at.y, at.z);
    },
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
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

  // The bat, along the pivot's +x from the hands: its knob, handle, barrel
  // and rounded end turned from ./swing's outline, in the ball's own light.
  const bat = new Mesh(
    new LatheGeometry(
      BAT_PROFILE.map(({ fromHands, radius }) => new Vector2(radius, fromHands)),
      16,
    ).rotateZ(-Math.PI / 2),
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

  const ball = createBaseball();
  const shadow = new Mesh(
    new CircleGeometry(BALL_RADIUS, 20).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: palette.night, transparent: true, opacity: 0.6 }),
  );

  const tracer = createTracer();
  const label = createLabel(await displayFont(), stage.field.scale);

  group.add(
    batter.group,
    pivot,
    curvebot.group,
    ball,
    shadow,
    tracer.group,
    label.sprite,
  );

  /** The home run the wide shot and the tracer are for, and the screen's shape the shot was fitted to. */
  let traced: { hit: Game["hit"]; aspect: number } | null = null;

  /**
   * A home run, from the moment the bat meets it: the camera cuts to the
   * wide shot of its flight, its tracer draws on behind the ball (all at
   * once under reduced motion) and its distance stands where it lands; as
   * the beat ends they fade, and before the next pitch the camera cuts back.
   */
  function showHomeRun(game: Game) {
    const flight = homeRunFlight(game, RELEASE);
    const flying = flight !== null && flight.drawn > 0;
    if (!flying) {
      if (traced) stage.cut(null);
      traced = null;
      tracer.group.visible = label.sprite.visible = false;
      return;
    }
    const { aspect } = stage.camera;
    if (traced?.hit !== game.hit || traced.aspect !== aspect) {
      if (traced?.hit !== game.hit) {
        tracer.trace(flight.points);
        const landing = flight.points[flight.points.length - 1];
        label.show(`${game.hit!.distance} FT`, landing);
      }
      traced = { hit: game.hit, aspect };
      label.fit(aspect);
      stage.cut(homeRunView(aspect, stage.field, flight.points));
    }
    const fade = Math.min(
      1,
      Math.max(0, (resultBeat(game) - game.clock) / FADE),
    );
    tracer.draw(reduced.matches ? 1 : flight.drawn, fade);
    label.sprite.visible = flight.drawn === 1 || reduced.matches;
    label.sprite.material.opacity = fade;
  }

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

  /** Whether the last draw was from the Play of the Game's own camera. */
  let filmed = false;

  /**
   * The Play of the Game's own camera (see ./replay), cut to as a home
   * run's wide shot is, in the Derby's field of view; null cuts back,
   * unless the wide shot has the camera by then.
   */
  function film(shot: Shot | null) {
    if (shot) {
      const { field, camera } = stage;
      const at = ({ x, y, z }: Point) => fieldPoint(field, x, y, z);
      const position = at(shot.position);
      const look = new Matrix4().lookAt(position, at(shot.target), UP);
      stage.cut({
        pose: { position, quaternion: new Quaternion().setFromRotationMatrix(look) },
        fovY: derbyView(camera.aspect, field).fovY,
      });
    } else if (filmed && !traced) {
      stage.cut(null);
    }
    filmed = shot !== null;
  }

  function draw(game: Game, shot: Shot | null = null) {
    const dt = moveFigures(game);
    last = game;
    const { turn, lift } = batAt(game, RELEASE);
    pivot.rotation.set(0, turn, lift);
    const at = ballAt(game, RELEASE);
    ball.visible = shadow.visible = at !== null;
    if (at) {
      ball.position.set(at.x, at.y, at.z);
      if (!reduced.matches) ball.rotation.x -= SPIN * dt;
      shadow.position.set(at.x, 0.05, at.z);
      shadow.scale.setScalar(Math.max(0.4, 1 - at.y / 60));
    }
    showHomeRun(game);
    film(shot);
    stage.draw();
  }

  // No glows of its own: nothing to size to the canvas.
  const guest = { group, setViewportHeight() {} };

  function dispose() {
    stage.cut(null);
    stage.release(guest);
    label.dispose();
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
