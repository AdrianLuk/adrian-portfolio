import {
  InstancedMesh,
  FogExp2,
  Material,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { bakePlateEnvironment } from "./environment";
import { createFlightPath, type FlightPath, type FlightRig } from "./flight";
import { createGlowPoints, type Glow } from "./glow-points";
import { createGroundPools } from "./ground-pools";
import { createMist } from "./mist";
import { createNamePlate, type PlacedWord } from "./name-plate";
import { nameGlyphs } from "./name-glyphs";
import { FOG_DENSITY, palette } from "./palette";
import { fitWord, unitsPerPixel, type PxRect } from "./plate-fit";
import { CAMERA, settledCameraHeight } from "./pose";
import {
  moteCountFor,
  pixelRatioFor,
  plateFinishFor,
  tierFor,
} from "./quality";
import { seededRandom } from "./noise";
import type { SharedUniforms } from "./shared";
import { createSky } from "./sky";
import { createStructures } from "./structures";
import { createTerrain } from "./terrain-mesh";
import { valleyCentre, valleyHeight } from "./terrain";

/** The canvas size and the headline's word boxes, in canvas pixels. */
export type Measurement = {
  width: number;
  height: number;
  words: { text: string; rect: PxRect }[];
};

export type WorldOptions = {
  /** False under prefers-reduced-motion: render on demand, never loop. */
  motion: boolean;
  /**
   * The opening flight's state, read on every frame (the GSAP timeline
   * animates it in place); SETTLED_RIG holds the settled pose.
   */
  rig: Readonly<FlightRig>;
  measure: () => Measurement;
  /** Called after the first frame has rendered. */
  onFrame: () => void;
  /** The GPU dropped the context: the canvas is blank until it is restored. */
  onLost: () => void;
};

/** Where a credit card stands on the canvas, in canvas pixels. */
export type CreditPlacement = { x: number; y: number; scale: number };

export type World = {
  /** Re-measures the headline and re-poses (after a resize or reflow). */
  layout(): void;
  setMotion(motion: boolean): void;
  /**
   * Where credit `index` stands now. The first call anchors it in the world
   * where the camera sees `spot` (normalised device coordinates); later calls
   * follow that anchor as the camera flies on. Null until the plate is posed,
   * or once the anchor is behind the camera.
   */
  placeCredit(
    index: number,
    spot: { x: number; y: number },
  ): CreditPlacement | null;
  dispose(): void;
};

/** Lets the browser paint and handle input before the next setup step. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The moment the still frame shows: beams crossed, motes mid-rise. */
const STILL_TIME = 11.5;

/** How far ahead a credit is anchored when it appears, in world units. */
const CREDIT_DEPTH = 420;

const BEACON_INTENSITY = 3;

/**
 * The first lit site, glowing on the horizon down the valley once the camera
 * has settled: the scroll route's first stop.
 */
function createSiteBeacon(shared: SharedUniforms) {
  const z = -420;
  const x = valleyCentre(z);
  return createGlowPoints(
    [
      {
        x,
        y: valleyHeight(x, z) + 24,
        z,
        color: palette.cyan,
        size: 12,
        seed: 0.5,
      },
    ],
    shared,
    { intensity: 0 },
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
  const motes = createGlowPoints(glows, shared, { drift: 26, intensity: 0.9 });
  motes.points.position.y = valleyHeight(0, -90);
  return motes;
}

/**
 * Builds the world on `canvas` and draws its first frame once every shader has
 * compiled (off the main thread where the browser allows). Resolves to null
 * when WebGL is unavailable, in which case the DOM headline simply stays.
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

  // Setup yields between its heavier steps, so no one task blocks input long.
  const sky = createSky(shared);
  const structures = createStructures();
  const terrain = createTerrain();
  await nextTask();

  // The plate is the hero object: large screens get its full finish, and only
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
  const beacon = createSiteBeacon(shared);
  const pools = createGroundPools(structures.pools.length + 3, 0.32);
  // Every material is self-lit or moonlit in its shader: the scene has no lights.
  scene.add(
    ...sky.objects,
    terrain,
    pools.mesh,
    ...structures.meshes,
    lights.points,
    beacon.points,
    ...createMist(shared),
    plate.group,
  );

  let motes: ReturnType<typeof createMotes> | null = null;
  let motesFor = 0;

  let motion = options.motion;
  let onScreen = true;
  let running = false;
  let loopStart: number | null = null;
  let firstFrame = true;
  /** True once every headline word stands on the plate; nothing draws before. */
  let posed = false;
  let compiled = false;
  let path: FlightPath | null = null;
  /** The settled pose the path was planned back from. */
  let pathFor = "";
  const canvasSize = { width: 1, height: 1 };
  const credits = new Map<number, Vector3>();

  /** Puts the camera where the rig says, and lights the arrival. */
  function pose() {
    if (!path) return;
    const { rig } = options;
    const { position, quaternion } = path.poseAt(rig);
    camera.position.copy(position);
    camera.quaternion.copy(quaternion);
    camera.updateMatrixWorld();
    plate.setArrival(rig.beams, rig.sweep);
    beacon.setIntensity(BEACON_INTENSITY * rig.beacon);
  }

  function render() {
    if (!posed || !compiled) return;
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
    const { width, height, words } = options.measure();
    if (width === 0 || height === 0) return;

    const ratio = pixelRatioFor(window.devicePixelRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    shared.uPixelRatio.value = ratio;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    canvasSize.width = width;
    canvasSize.height = height;
    for (const glow of [lights, plate.flares, beacon, motes])
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
    posed = placed.length > 0 && placed.length === shown.length;
    if (!posed) return;

    // The plate stands where the settled camera sees the headline; the flight
    // is planned back from that pose.
    camera.position.set(0, settledCameraHeight(placed), 0);
    camera.rotation.set(-CAMERA.pitch, 0, 0);
    plate.place(placed, camera);
    const centre = plate.centre();
    const key = [camera.position.y, centre.x, centre.y, centre.z].join();
    if (key !== pathFor) {
      path = createFlightPath(
        {
          position: camera.position.clone(),
          quaternion: camera.quaternion.clone(),
        },
        centre.clone(),
      );
      pathFor = key;
    }
    credits.clear();
    pools.set([...structures.pools, ...plate.pools()]);
    // The loop, when it runs, draws the new pose on its next frame.
    if (!running) render();
  }

  function loop(ms: number) {
    loopStart ??= ms;
    shared.uTime.value = STILL_TIME + (ms - loopStart) / 1000;
    render();
  }

  function sync() {
    running = motion && onScreen && !document.hidden && compiled;
    renderer.setAnimationLoop(running ? loop : null);
  }

  // Pause when the hero is scrolled away or the tab is hidden.
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
    options.onLost();
  };
  const onContextRestored = () => {
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
      if (object instanceof Mesh || object instanceof Points) {
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

  try {
    layout();
    await renderer.compileAsync(scene, camera);
  } catch {
    dispose();
    return null;
  }
  compiled = true;
  // Re-measure: the page may have reflowed while the shaders compiled.
  layout();
  sync();

  function placeCredit(index: number, spot: { x: number; y: number }) {
    if (!posed || !path) return null;
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
    return {
      x: ((ndc.x + 1) / 2) * canvasSize.width,
      y: ((1 - ndc.y) / 2) * canvasSize.height,
      // It grows as the camera closes on it, gently, so it stays readable.
      scale: Math.min(1.35, Math.max(1, Math.sqrt(CREDIT_DEPTH / depth))),
    };
  }

  return {
    layout,
    placeCredit,
    setMotion(next) {
      motion = next;
      if (!motion) {
        shared.uTime.value = STILL_TIME;
        loopStart = null;
      }
      sync();
      if (!running) render();
    },
    dispose,
  };
}
