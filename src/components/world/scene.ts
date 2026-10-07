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
import { bakePlateEnvironment } from "./environment";
import { createFlightPath, type FlightPath, type Pose } from "./flight";
import { createGlowPoints, type Glow } from "./glow-points";
import { createGroundPools, type Pool } from "./ground-pools";
import { createMist } from "./mist";
import { createNamePlate, type PlacedWord } from "./name-plate";
import { createPrecipitation } from "./precipitation";
import { nameGlyphs } from "./name-glyphs";
import { FOG_DENSITY, palette } from "./palette";
import { fitWord, unitsPerPixel, type PxRect } from "./plate-fit";
import { CAMERA, settledCameraHeight, settledYaw } from "./pose";
import { createRoute, outpostPose, SITES, type Route } from "./route";
import type { FlightRig, RouteRig } from "./rigs";
import {
  moteCountFor,
  pixelRatioFor,
  plateFinishFor,
  precipitationCountFor,
  tierFor,
} from "./quality";
import { seededRandom } from "./noise";
import type { SharedUniforms } from "./shared";
import { createSky } from "./sky";
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
 * the scroll route. outpost: the Resume page's, the camera still at the
 * route's last stop, the plate and the lit sites out of sight.
 */
export type WorldView =
  | { kind: "hero"; measure: () => Measurement }
  | { kind: "outpost" };

/**
 * The world: one scene, which any of its views can show, so changing view
 * compiles nothing.
 */
export type WorldOptions = ViewOptions & {
  /**
   * The opening flight's state, read on every frame (the GSAP timeline
   * animates it in place); SETTLED_RIG holds the settled pose.
   */
  rig: Readonly<FlightRig>;
  /**
   * The scroll route's state, read on every frame: the camera follows the
   * route once `at` leaves 0, and each site burns as brightly as it is lit.
   */
  route: Readonly<RouteRig>;
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
  /** Where the camera is now. */
  cameraPose(): Pose;
  /**
   * Hands the camera to `source`, read on every frame in place of the view's
   * own pose, until called with null.
   */
  steer(source: (() => Pose) | null): void;
  /**
   * The scroll route for the last hero layout measured, and its settled pose
   * (stop 0); null until a hero view has posed the plate.
   */
  route(): Route | null;
  settledPose(): Pose | null;
  /** The opening flight's path for that layout, likewise. */
  openingPath(): FlightPath | null;
};

/** Lets the browser paint and handle input before the next setup step. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The moment the still frame shows: beams crossed, motes mid-rise. */
const STILL_TIME = 11.5;

/** How far ahead a credit is anchored when it appears, in world units. */
const CREDIT_DEPTH = 420;

/**
 * How much of its anchor's motion a credit follows: enough to sit in the
 * scene as the camera flies and banks, little enough to stay readable.
 */
const CREDIT_PARALLAX = 0.3;

const BEACON_INTENSITY = 3;

/**
 * A site's light, as a share of BEACON_INTENSITY: how dim the sites further
 * down the valley wait, and how much brighter each burns once its panel is in.
 */
const SITE_LIGHT = { waiting: 0.35, lit: 0.9 };

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

  const shared: SharedUniforms = {
    uTime: { value: STILL_TIME },
    uPixelRatio: { value: 1 },
  };

  const scene = new Scene();
  scene.fog = new FogExp2(palette.fog, FOG_DENSITY);
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
  const sites = createSiteLights(shared);
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
    ...sites.map((s) => s.points),
    ...createMist(shared),
    plate.group,
  );

  let motes: ReturnType<typeof createMotes> | null = null;
  let motesFor = 0;
  let falling: ReturnType<typeof createPrecipitation> | null = null;
  let fallingFor = 0;
  let fallingKind: Weather = "clear";
  /** The camera's pose from outside the view (a transit between views). */
  let steering: (() => Pose) | null = null;
  let settled: Pose | null = null;

  let motion = options.motion;
  let onScreen = true;
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

  function placeCamera({ position, quaternion }: Pose) {
    camera.position.copy(position);
    camera.quaternion.copy(quaternion);
    camera.updateMatrixWorld();
  }

  /**
   * Puts the camera where it is steered, or else, for the hero, where the
   * rigs say (the opening's flight, then the scroll route once the visitor
   * scrolls), and lights the arrival and the sites. The Outpost's camera
   * holds the pose its layout gave it, and the sites, all behind it, stay
   * dark.
   */
  function pose() {
    const hero = view?.kind === "hero" && path && route;
    const { rig } = options;
    const { at, lit } = options.route;
    if (steering) placeCamera(steering());
    else if (hero) placeCamera(at > 0 ? route!.poseAt(at) : path!.poseAt(rig));
    if (!hero) return;
    plate.setArrival(rig.beams, rig.sweep);
    sites.forEach((site, i) => {
      // The first is the scroll cue, lit by the arrival; the rest wait dim.
      const waiting = i === 0 ? rig.beacon : rig.beacon * SITE_LIGHT.waiting;
      site.setIntensity(BEACON_INTENSITY * (waiting + SITE_LIGHT.lit * lit[i]));
    });
  }

  function render() {
    if (!view || !posed || !compiled || lost) return;
    pose();
    plate.sweep(shared.uTime.value);
    sky.follow(camera.position.x, camera.position.y, camera.position.z);
    renderer.render(scene, camera);
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
    for (const glow of [lights, plate.flares, ...sites, motes, falling])
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

    posed =
      view.kind === "hero"
        ? placePlate(plate, words, width, height)
        : placeOutpost();
    if (!posed) return;
    // The motes rise round where the camera stands.
    const { x, z } = camera.position;
    motes?.points.position.set(x, valleyHeight(x, z - 90), z);
    // The loop, when it runs, draws the new pose on its next frame.
    if (!running) render();
  }

  /** Nothing falls under reduced motion, or in the clear: the ground shows it. */
  function showFalling() {
    if (falling) falling.object.visible = motion && weather !== "clear";
  }

  /** Lays the light pools on the floor, stretched on a wet one. */
  function setPools(lit: readonly Pool[]) {
    pools.set(wet() ? wetPools(lit) : lit);
  }

  /** The Outpost's fixed pose, for the screen's shape. */
  function placeOutpost() {
    placeCamera(outpostPose(camera.aspect));
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
    const key = [camera.position.y, centre.x, centre.y, centre.z, camera.aspect]
      .join();
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

  function loop(ms: number) {
    loopStart ??= ms;
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
   * lit sites, all behind the Outpost's camera, stay dark there.
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

  function placeCredit(index: number, spot: { x: number; y: number }) {
    if (!posed || !path || view?.kind !== "hero") return null;
    pose();
    let anchor = credits.get(index);
    if (!anchor) {
      const tan = Math.tan(((camera.fov / 2) * Math.PI) / 180);
      anchor = camera.localToWorld(
        new Vector3(
          spot.x * tan * camera.aspect * CREDIT_DEPTH,
          spot.y * tan * CREDIT_DEPTH,
          -CREDIT_DEPTH,
        ),
      );
      credits.set(index, anchor);
    }
    const depth = -anchor.clone().applyMatrix4(camera.matrixWorldInverse).z;
    if (depth <= camera.near) return null;
    const ndc = anchor.clone().project(camera);
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
  function placeSite(index: number, at = options.route.at) {
    if (!posed || !route || view?.kind !== "hero") return null;
    const { position, quaternion } = route.poseAt(at);
    probe.position.copy(position);
    probe.quaternion.copy(quaternion);
    probe.aspect = camera.aspect;
    probe.updateProjectionMatrix();
    probe.updateMatrixWorld();
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
    cameraPose: () => ({
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
    }),
    steer(source) {
      steering = source;
      if (!running) render();
    },
    route: () => route,
    openingPath: () => path,
    settledPose: () =>
      settled && {
        position: settled.position.clone(),
        quaternion: settled.quaternion.clone(),
      },
    dispose,
  };
}
