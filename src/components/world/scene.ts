import {
  InstancedMesh,
  FogExp2,
  Line,
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Points,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { courtLook, RALLY_BALL, rallyBall } from "./court-look";
import { bakePlateEnvironment } from "./environment";
import { createFlightPath, type FlightPath, type Pose } from "./flight";
import { createGlowPoints, type Glow } from "./glow-points";
import { createGroundPools, type Pool } from "./ground-pools";
import { createMist } from "./mist";
import { createNamePlate, type PlacedWord } from "./name-plate";
import { createPrecipitation } from "./precipitation";
import { nameGlyphs } from "./name-glyphs";
import { createBalls } from "./landmarks";
import { FOG_DENSITY, fogColor, palette, tintFog } from "./palette";
import { fitWord, unitsPerPixel, type PxRect } from "./plate-fit";
import { CAMERA, settledCameraHeight, settledYaw } from "./pose";
import type { CameraDirector, CameraLean } from "../camera-director";
import { nominalRoute } from "./nominal-route";
import {
  courtPose,
  createRoute,
  SITES,
  skylinePose,
  type Route,
} from "./route";
import { COURT_STOP, transit } from "./transit";
import {
  drawsInSoftware,
  holdsFrame,
  moteCountFor,
  pixelRatioFor,
  plateFinishFor,
  precipitationCountFor,
  tierFor,
} from "./quality";
import { seededRandom } from "./noise";
import type { SharedUniforms } from "./shared";
import { createSky } from "./sky";
import { magentaWash } from "./skyline";
import { skylineLook } from "./skyline-look";
import { createStructures } from "./structures";
import { createTerrain, setTerrainWeather } from "./terrain-mesh";
import { valleyHeight } from "./terrain";
import type { Weather } from "./weather";

/** The canvas size and the headline's word boxes, in canvas pixels. */
export type Measurement = {
  width: number;
  height: number;
  words: { text: string; rect: PxRect }[];
};

/** What every view of the world needs. */
export type ViewOptions = {
  /** False under prefers-reduced-motion: render on demand, never loop. */
  motion: boolean;
  /**
   * Toronto's weather. Snow or rain falls only while the world moves; the
   * ground shows it either way (settled snow, a wet floor).
   */
  weather: Weather;
  /** Called after the first frame has rendered. */
  onFrame: () => void;
  /** The GPU dropped the context: the canvas is blank until it is restored. */
  onLost: () => void;
};

/**
 * What the world shows. hero: the home page's, the name plate posed on the
 * headline that `measure` finds, the camera on the opening flight and then
 * the scroll route. court: the Juice Bros Case study's, the camera still and
 * low behind the court's near baseline (Lit site 3). skyline: the Resume
 * page's, the camera still and low down the valley from downtown, looking
 * back up at Toronto's skyline. Away from the hero, the plate and the lit
 * sites are out of sight.
 */
export type WorldView =
  | { kind: "hero"; measure: () => Measurement }
  | { kind: "court" }
  | { kind: "skyline" };

/**
 * The world: one scene, which any of its views can show, so changing view
 * compiles nothing.
 */
export type WorldOptions = ViewOptions & {
  /**
   * Where the camera is and how the world is lit, asked on every frame; the
   * world hands it the paths each layout measures.
   */
  director: CameraDirector;
  /** The view it opens on; null draws nothing until it is given one. */
  view: WorldView | null;
};

type NamePlate = ReturnType<typeof createNamePlate>;

/** Where a credit card stands on the canvas, in canvas pixels. */
export type CreditPlacement = { x: number; y: number; scale: number };

/** A view of the world on a canvas. */
export type View = {
  /** Re-measures and re-poses (after a resize or reflow). */
  layout(): void;
  setMotion(motion: boolean): void;
  dispose(): void;
};

export type World = View & {
  /**
   * Where credit `index` stands now. The first call anchors it in the world
   * where the camera sees `spot` (normalised device coordinates); later calls
   * follow a damped share of that anchor's motion as the camera flies and
   * banks, so the card sits in the scene but stays readable. Null until the
   * plate is posed,
   * or once the anchor is behind the camera.
   */
  placeCredit(
    index: number,
    spot: { x: number; y: number },
  ): CreditPlacement | null;
  /**
   * Where lit site `index` stands on the canvas, seen from the scroll route
   * at stop `at` (by default, where the camera is now). Null until the plate
   * is posed, or while the site is behind the camera.
   */
  placeSite(index: number, at?: number): { x: number; y: number } | null;
  /**
   * Shows another view (null: none, the world parked and drawing nothing),
   * re-measured and re-posed at once.
   */
  setView(view: WorldView | null): void;
  /** Changes the weather in place: the ground, the pools and what falls. */
  setWeather(weather: Weather): void;
};

/**
 * Whether `gl` draws in software (see `drawsInSoftware`). Chrome masks the
 * renderer's name behind WEBGL_debug_renderer_info, which Firefox, whose
 * name is already readable, has deprecated: asked for only when masked.
 */
function inSoftware(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  let name: unknown = gl.getParameter(gl.RENDERER);
  if (name === "WebKit WebGL") {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    if (info) name = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
  }
  return drawsInSoftware(typeof name === "string" ? name : null, () => {
    const probe = document.createElement("canvas");
    const options: WebGLContextAttributes = {
      failIfMajorPerformanceCaveat: true,
    };
    const accepted =
      probe.getContext("webgl2", options) ?? probe.getContext("webgl", options);
    accepted?.getExtension("WEBGL_lose_context")?.loseContext();
    return !accepted;
  });
}

/** Lets the browser paint and handle input before the next setup step. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The moment the still frame shows: beams crossed, motes mid-rise. */
const STILL_TIME = 11.5;

/**
 * How far the camera turns toward the pointer at the screen's edge, in
 * radians (under two degrees across, half that up and down), and how long it
 * takes to ease most of the way there, in seconds. A frame drawn after a
 * longer gap than LEAN_GAP (a still frame, say) takes the lean at once.
 */
const LEAN = { yaw: 0.03, pitch: 0.015 };
const LEAN_EASE = 0.4;
const LEAN_GAP = 0.25;
const UP = new Vector3(0, 1, 0);

/** How far ahead a credit is anchored when it appears, in world units. */
const CREDIT_DEPTH = 420;

/**
 * How much of its anchor's motion a credit follows: enough to sit in the
 * scene as the camera flies and banks, little enough to stay readable.
 */
const CREDIT_PARALLAX = 0.3;

/** A beacon's full intensity: each site burns at the share the director says. */
const BEACON_INTENSITY = 3;

/**
 * The lit sites' lights, one each so each brightens on its own: the first
 * glows on the horizon down the valley once the camera has settled.
 */
function createSiteLights(shared: SharedUniforms) {
  return SITES.map((site) =>
    createGlowPoints(
      [
        {
          ...site.position,
          color: palette[site.light],
          size: 12,
          seed: 0.5,
        },
      ],
      shared,
      { intensity: 0 },
    ),
  );
}

function createMotes(shared: SharedUniforms, width: number, height: number) {
  const random = seededRandom(0xd07e5);
  const glows: Glow[] = [];
  for (let i = 0, n = moteCountFor(width, height); i < n; i++) {
    // Kept beyond the hero copy's depth so none swells into a blur over the text.
    const z = -45 - random() * 150;
    const x = (random() * 2 - 1) * (25 + -z * 0.55);
    glows.push({
      x,
      // y is the mote's phase in its rise; the shader lifts it off the ground.
      y: random() * 26,
      z,
      color: palette.magenta,
      size: 0.22 + random() * 0.3,
      seed: random(),
    });
  }
  return createGlowPoints(glows, shared, { drift: 26, intensity: 0.9 });
}

/**
 * On a wet floor, light pools stretch towards the camera like reflections,
 * and brighten a little.
 */
const WET_POOLS = { width: 0.75, depth: 1.6, intensity: 0.42 };
const POOL_INTENSITY = 0.32;

function wetPools(pools: readonly Pool[]) {
  return pools.map((p) => ({
    ...p,
    width: p.width * WET_POOLS.width,
    depth: p.depth * WET_POOLS.depth,
  }));
}

/**
 * Builds the world on `canvas` and draws its first frame once every shader
 * (of every view, the name plate's included) has compiled, off the main
 * thread where the browser allows. Resolves to null when WebGL is
 * unavailable, in which case the DOM headline, or the page's still backdrop,
 * simply stays.
 */
export async function createWorld(
  canvas: HTMLCanvasElement,
  options: WorldOptions,
): Promise<World | null> {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true });
  } catch {
    return null;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(palette.night);
  const software = inSoftware(renderer.getContext());

  const shared: SharedUniforms = {
    uTime: { value: STILL_TIME },
    uPixelRatio: { value: 1 },
  };

  const scene = new Scene();
  const fog = new FogExp2(fogColor, FOG_DENSITY);
  scene.fog = fog;
  const camera = new PerspectiveCamera(CAMERA.fovY, 1, 0.5, 2600);
  camera.rotation.order = "YXZ";
  /** The camera's double, for seeing from elsewhere on the route. */
  const probe = camera.clone();

  // Setup yields between its heavier steps, so no one task blocks input long.
  const sky = createSky(shared);
  const structures = createStructures(shared);
  let { weather, view } = options;
  const wet = () => weather === "rain";
  const terrain = createTerrain(weather);
  await nextTask();

  // The plate is the hero object, built whatever the view, so showing the
  // hero later compiles nothing: large screens get its full finish, and only
  // they bake (and reflect) an environment.
  const finish = plateFinishFor(
    tierFor(window.innerWidth, window.devicePixelRatio),
  );
  const bake = () =>
    finish.envSize > 0 ? bakePlateEnvironment(renderer, finish.envSize) : null;
  let environment = bake();
  await nextTask();

  const plate = createNamePlate(shared, {
    envMap: environment?.texture ?? null,
    finish,
  });
  const lights = createGlowPoints(structures.glows, shared);
  const floodlights = createGlowPoints(structures.floodlights, shared);
  const sites = createSiteLights(shared);
  // The rally ball, in the scene from the start (hidden, so it compiles with
  // the rest) and shown only by the court's look.
  const [rally] = createBalls([
    { x: 0, y: 0, z: 0, r: RALLY_BALL.radius, color: palette.violet },
  ]);
  rally.visible = false;
  /**
   * The court's look and the Skyline's, as the director last blended them
   * (see ./court-look, ./skyline-look).
   */
  let look = courtLook(0);
  let skyline = skylineLook(0);
  const pools = createGroundPools(structures.pools.length + 3, poolIntensity());
  function poolIntensity() {
    return wet() ? WET_POOLS.intensity : POOL_INTENSITY;
  }
  // Every material is self-lit or moonlit in its shader: the scene has no lights.
  scene.add(
    ...sky.objects,
    terrain,
    pools.mesh,
    ...structures.meshes,
    lights.points,
    floodlights.points,
    rally,
    ...sites.map((s) => s.points),
    ...createMist(shared),
    plate.group,
  );

  let motes: ReturnType<typeof createMotes> | null = null;
  let motesFor = 0;
  let falling: ReturnType<typeof createPrecipitation> | null = null;
  let fallingFor = 0;
  let fallingKind: Weather = "clear";
  let settled: Pose | null = null;

  let motion = options.motion;
  let onScreen = true;
  /** Whether the last frame drawn had the camera landed (see `holds`). */
  let landed = false;
  /** While the frame is held, the last held frame's time (see `loop`). */
  let heldAt: number | null = null;
  let running = false;
  let loopStart: number | null = null;
  let firstFrame = true;
  /**
   * True once the camera is posed: for the hero, once every headline word
   * stands on the plate. Nothing draws before.
   */
  let posed = false;
  let compiled = false;
  /** True while the GPU context is lost: nothing draws until it is back. */
  let lost = false;
  let path: FlightPath | null = null;
  let route: Route | null = null;
  /** The settled pose (and screen shape) the paths were planned from. */
  let pathFor = "";
  const canvasSize = { width: 1, height: 1 };
  const credits = new Map<number, Vector3>();

  /** The camera's lean toward the pointer, easing after the director's. */
  const lean = { x: 0, y: 0, at: 0 };

  function easeLean(toward: CameraLean, now: number) {
    const gap = (now - lean.at) / 1000;
    lean.at = now;
    const k = gap > LEAN_GAP ? 1 : 1 - Math.exp(-gap / LEAN_EASE);
    lean.x += (toward.x - lean.x) * k;
    lean.y += (toward.y - lean.y) * k;
    // Settled: exactly upright again, so the pose is drawn as it is.
    if (Math.abs(lean.x - toward.x) < 1e-4) lean.x = toward.x;
    if (Math.abs(lean.y - toward.y) < 1e-4) lean.y = toward.y;
  }

  function placeCamera({ position, quaternion }: Pose) {
    camera.position.copy(position);
    camera.quaternion.copy(quaternion);
    camera.updateMatrixWorld();
  }

  /**
   * Puts the camera where the director says, and lights the arrival and the
   * sites as it says. Where it has nothing to say, the camera holds the pose
   * its layout gave it, and the lights stay as they are.
   */
  function pose() {
    const now = performance.now();
    const { pose, lights, lean: toward } = options.director.frame(now);
    easeLean(toward, now);
    if (pose) {
      placeCamera(pose);
      // Turned from the pose afresh each frame, so the lean never builds up.
      if (lean.x || lean.y) {
        camera.rotateOnWorldAxis(UP, -lean.x * LEAN.yaw);
        camera.rotateX(-lean.y * LEAN.pitch);
        camera.updateMatrixWorld();
      }
    }
    if (!lights) return;
    plate.setArrival(lights.beams, lights.sweep);
    sites.forEach((site, i) =>
      site.setIntensity(BEACON_INTENSITY * lights.sites[i]),
    );
    look = courtLook(lights.court);
    skyline = skylineLook(lights.skyline);
    showLook();
  }

  /**
   * Lights the court as its look says: the floodlights up, the fog toward
   * violet, the rally ball in (only while the world moves: under reduced
   * motion the court is one still frame, with no ball), and what falls out.
   * Likewise the Skyline's: the CN Tower's wash and the fog toward magenta.
   */
  function showLook() {
    floodlights.setIntensity(look.floodlights);
    tintFog(look.fog, skyline.fog);
    fog.color.copy(fogColor);
    magentaWash.value = skyline.wash;
    rally.visible = motion && look.ball > 0;
    if (rally.visible) {
      const at = rallyBall(structures.court, shared.uTime.value);
      rally.position.set(at.x, at.y, at.z);
      rally.scale.setScalar(look.ball);
    }
    showFalling();
  }

  function render() {
    if (!view || !posed || !compiled || lost) return;
    pose();
    plate.sweep(shared.uTime.value);
    sky.follow(camera.position.x, camera.position.y, camera.position.z);
    renderer.render(scene, camera);
    landed = options.director.flying() === null;
    if (firstFrame) {
      firstFrame = false;
      options.onFrame();
    }
  }

  function layout() {
    if (!view) return;
    const { width, height, words } =
      view.kind === "hero"
        ? view.measure()
        : { width: canvas.clientWidth, height: canvas.clientHeight, words: [] };
    if (width === 0 || height === 0) return;

    const ratio = pixelRatioFor(window.devicePixelRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    shared.uPixelRatio.value = ratio;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    canvasSize.width = width;
    canvasSize.height = height;
    for (const glow of [
      lights,
      floodlights,
      plate.flares,
      ...sites,
      motes,
      falling,
    ])
      glow?.setViewportHeight(height);

    // Motes scale with the canvas area; rebuild only when the count bucket moves.
    const count = moteCountFor(width, height);
    if (count !== motesFor) {
      if (motes) {
        scene.remove(motes.points);
        motes.points.geometry.dispose();
        (motes.points.material as Material).dispose();
      }
      motes = createMotes(shared, width, height);
      motes.setViewportHeight(height);
      scene.add(motes.points);
      motesFor = count;
    }

    // Snow or rain, likewise: rebuilt only when its count bucket (or the
    // weather) changes. Kept, hidden, through a clear spell.
    const fallCount = precipitationCountFor(weather, width, height);
    if (
      weather !== "clear" &&
      (fallCount !== fallingFor || weather !== fallingKind)
    ) {
      if (falling) {
        scene.remove(falling.object);
        falling.object.geometry.dispose();
        (falling.object.material as Material).dispose();
      }
      falling = createPrecipitation(weather, fallCount, shared);
      falling.setViewportHeight(height);
      scene.add(falling.object);
      fallingFor = fallCount;
      fallingKind = weather;
    }
    showFalling();

    const home = view.kind === "hero";
    posed = home
      ? placePlate(plate, words, width, height)
      : placeStill(view.kind === "court" ? courtPose : skylinePose);
    if (!posed) return;
    // The director takes the paths this layout measured, and the Transit
    // maths. Home's paths come only from home's own layout; away from it, the
    // nominal route flies the court and the Skyline (see ./nominal-route).
    options.director.layout({
      opening: home ? path : null,
      route: home ? route : nominalRoute(camera.aspect),
      skyline: skylinePose(camera.aspect),
      court: courtPose(camera.aspect),
      courtStop: COURT_STOP,
      transit,
    });
    // The motes rise round where the camera stands.
    const { x, z } = camera.position;
    motes?.points.position.set(x, valleyHeight(x, z - 90), z);
    // The loop, when it runs, draws the new pose on its next frame (unless
    // it holds the last one, which a resize has cleared).
    if (!running || holds()) render();
  }

  /**
   * Nothing falls under reduced motion, or in the clear, or at the court or
   * the Skyline (it fades out as their looks come in): the ground shows it.
   */
  function showFalling() {
    if (!falling) return;
    const fade = Math.min(look.falling, skyline.falling);
    falling.setFade(fade);
    falling.object.visible = motion && weather !== "clear" && fade > 0;
  }

  /** Lays the light pools on the floor, stretched on a wet one. */
  function setPools(lit: readonly Pool[]) {
    pools.set(wet() ? wetPools(lit) : lit);
  }

  /** A still view's pose (the court's, the Skyline's), for the screen's shape. */
  function placeStill(poseFor: (aspect: number) => Pose) {
    placeCamera(poseFor(camera.aspect));
    setPools(structures.pools);
    return true;
  }

  /**
   * Stands the plate where the DOM headline is, and the settled camera before
   * it; true once every word is on it.
   */
  function placePlate(
    plate: NamePlate,
    words: Measurement["words"],
    width: number,
    height: number,
  ) {
    const perPx = unitsPerPixel(CAMERA.fovY, CAMERA.plateDepth, height);
    const shown = words.filter((w) => w.rect.width > 0);
    const placed: PlacedWord[] = [];
    for (const { text, rect } of shown) {
      const glyphs = nameGlyphs.words[text as keyof typeof nameGlyphs.words];
      if (!glyphs) continue;
      placed.push({
        text,
        advance: glyphs.advance,
        fit: fitWord(
          rect,
          glyphs.advance,
          nameGlyphs,
          { width, height },
          perPx,
        ),
      });
    }
    // A partial plate is worse than none: keep the DOM headline instead.
    if (placed.length === 0 || placed.length !== shown.length) return false;

    // The plate stands where the settled camera sees the headline; the flight
    // is planned back from that pose.
    const yaw = settledYaw(camera.aspect);
    camera.position.set(0, settledCameraHeight(placed, yaw), 0);
    camera.rotation.set(-CAMERA.pitch, -yaw, 0, "YXZ");
    plate.place(placed, camera);
    const centre = plate.centre();
    const key = [
      camera.position.y,
      centre.x,
      centre.y,
      centre.z,
      camera.aspect,
    ].join();
    if (key !== pathFor) {
      settled = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
      };
      path = createFlightPath(settled, centre.clone());
      route = createRoute(settled, centre.clone(), camera.aspect);
      pathFor = key;
    }
    credits.clear();
    setPools([...structures.pools, ...plate.pools()]);
    return true;
  }

  /** Whether the world holds its last frame now (see `holdsFrame`). */
  const holds = () =>
    holdsFrame({
      software,
      atStillPlace: view?.kind === "court" || view?.kind === "skyline",
      flying: options.director.flying() !== null,
      landed,
      awaitingPage: options.director.awaitingPage(),
    });

  function loop(ms: number) {
    loopStart ??= ms;
    if (holds()) {
      // The canvas keeps showing the last frame drawn, and the world's clock
      // stands still, so it moves on from there once it draws again.
      if (heldAt !== null) loopStart += ms - heldAt;
      heldAt = ms;
      return;
    }
    heldAt = null;
    shared.uTime.value = STILL_TIME + (ms - loopStart) / 1000;
    render();
  }

  function sync() {
    running =
      motion && onScreen && !document.hidden && compiled && !lost && !!view;
    renderer.setAnimationLoop(running ? loop : null);
  }

  // Pause when the tab is hidden, or the canvas is scrolled away (under
  // reduced motion it scrolls with the hero; while the camera flies it is
  // held fixed behind the whole page, so it stays in view).
  const intersection = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  });
  intersection.observe(canvas);
  document.addEventListener("visibilitychange", sync);

  // three.js keeps the context restorable; until it is, the headline returns.
  const onContextLost = () => {
    renderer.setAnimationLoop(null);
    running = false;
    firstFrame = true;
    landed = false;
    lost = true;
    options.onLost();
  };
  const onContextRestored = () => {
    lost = false;
    // The baked environment lived in a render target, which the loss wiped.
    environment?.dispose();
    environment = bake();
    plate.setEnvironment(environment?.texture ?? null);
    layout();
    sync();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  function dispose() {
    renderer.setAnimationLoop(null);
    intersection.disconnect();
    document.removeEventListener("visibilitychange", sync);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    scene.traverse((object) => {
      if (object instanceof InstancedMesh) object.dispose();
      if (
        object instanceof Mesh ||
        object instanceof Points ||
        object instanceof Line
      ) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    environment?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  /**
   * Fits the scene to its view: the plate shows only in the hero's, and the
   * lit sites, home's scroll cues, stay dark away from it.
   */
  function showView() {
    plate.group.visible = view?.kind === "hero";
    if (view?.kind !== "hero") for (const site of sites) site.setIntensity(0);
  }

  /**
   * Compiles every shader the scene has, the ones hidden in this view or this
   * weather included, so nothing compiles when either changes.
   */
  async function compileAll() {
    const hidden: Object3D[] = [];
    scene.traverse((object) => {
      if (object.visible) return;
      hidden.push(object);
      object.visible = true;
    });
    try {
      await renderer.compileAsync(scene, camera);
    } finally {
      for (const object of hidden) object.visible = false;
    }
  }

  try {
    showView();
    layout();
    await compileAll();
  } catch {
    dispose();
    return null;
  }
  compiled = true;
  // Re-measure: the page may have reflowed while the shaders compiled.
  layout();
  sync();

  /** Puts the camera's double at `pose`, seeing as the camera does. */
  function aimProbe({ position, quaternion }: Pose) {
    probe.position.copy(position);
    probe.quaternion.copy(quaternion);
    probe.fov = camera.fov;
    probe.aspect = camera.aspect;
    probe.updateProjectionMatrix();
    probe.updateMatrixWorld();
  }

  function placeCredit(index: number, spot: { x: number; y: number }) {
    if (!posed || !path || view?.kind !== "hero") return null;
    // Seen from where the director has the camera now, without moving it:
    // only drawing does.
    aimProbe(options.director.frame(performance.now()).pose ?? camera);
    let anchor = credits.get(index);
    if (!anchor) {
      const tan = Math.tan(((probe.fov / 2) * Math.PI) / 180);
      anchor = probe.localToWorld(
        new Vector3(
          spot.x * tan * probe.aspect * CREDIT_DEPTH,
          spot.y * tan * CREDIT_DEPTH,
          -CREDIT_DEPTH,
        ),
      );
      credits.set(index, anchor);
    }
    const depth = -anchor.clone().applyMatrix4(probe.matrixWorldInverse).z;
    if (depth <= probe.near) return null;
    const ndc = anchor.clone().project(probe);
    const x = spot.x + (ndc.x - spot.x) * CREDIT_PARALLAX;
    const y = spot.y + (ndc.y - spot.y) * CREDIT_PARALLAX;
    return {
      x: ((x + 1) / 2) * canvasSize.width,
      y: ((1 - y) / 2) * canvasSize.height,
      // It grows a little as the camera closes on it.
      scale: Math.min(1.12, Math.max(1, Math.sqrt(CREDIT_DEPTH / depth))),
    };
  }

  /**
   * Where site `index` stands on the canvas, in canvas pixels, seen from the
   * route at stop `at` (the camera's own stop by default). Null until the
   * plate is posed, or while the site is behind the camera.
   */
  function placeSite(index: number, at = options.director.stop()) {
    if (!posed || !route || view?.kind !== "hero") return null;
    aimProbe(route.poseAt(at));
    const ndc = SITES[index].position.clone().project(probe);
    if (ndc.z >= 1) return null;
    return {
      x: ((ndc.x + 1) / 2) * canvasSize.width,
      y: ((1 - ndc.y) / 2) * canvasSize.height,
    };
  }

  return {
    layout,
    placeCredit,
    placeSite,
    setMotion(next) {
      motion = next;
      showFalling();
      if (!motion) {
        shared.uTime.value = STILL_TIME;
        loopStart = null;
      }
      sync();
      if (!running) render();
    },
    setView(next) {
      view = next;
      posed = false;
      credits.clear();
      showView();
      layout();
      sync();
    },
    setWeather(next) {
      if (next === weather) return;
      weather = next;
      setTerrainWeather(terrain, weather);
      pools.setIntensity(poolIntensity());
      // Re-lays the pools, wet or dry, and brings in what falls.
      layout();
    },
    dispose,
  };
}
