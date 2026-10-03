import {
  AmbientLight,
  InstancedMesh,
  DirectionalLight,
  FogExp2,
  Material,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { createGlowPoints, type Glow } from "./glow-points";
import { createMist } from "./mist";
import { createNamePlate, type PlacedWord } from "./name-plate";
import { nameGlyphs } from "./name-glyphs";
import { FOG_DENSITY, palette } from "./palette";
import { fitWord, unitsPerPixel, type PxRect } from "./plate-fit";
import { CAMERA, settledCameraHeight } from "./pose";
import { moteCountFor, pixelRatioFor } from "./quality";
import { seededRandom } from "./noise";
import type { SharedUniforms } from "./shared";
import { createSky } from "./sky";
import { createStructures } from "./structures";
import { createTerrain } from "./terrain-mesh";
import { valleyHeight } from "./terrain";

/** The canvas size and the headline's word boxes, in canvas pixels. */
export type Measurement = {
  width: number;
  height: number;
  words: { text: string; rect: PxRect }[];
};

export type WorldOptions = {
  /** False under prefers-reduced-motion: render on demand, never loop. */
  motion: boolean;
  measure: () => Measurement;
  /** Called after the first frame of the settled pose has rendered. */
  onFrame: () => void;
  /** The GPU dropped the context: the canvas is blank until it is restored. */
  onLost: () => void;
};

export type World = {
  /** Re-measures the headline and re-poses (after a resize or reflow). */
  layout(): void;
  setMotion(motion: boolean): void;
  dispose(): void;
};

/** The moment the still frame shows: beams crossed, motes mid-rise. */
const STILL_TIME = 11.5;

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

  const sky = createSky(shared);
  const structures = createStructures();
  const plate = createNamePlate(shared);
  const lights = createGlowPoints(structures.glows, shared);
  scene.add(
    ...sky.objects,
    createTerrain(),
    ...structures.meshes,
    lights.points,
    ...createMist(shared),
    plate.group,
    new AmbientLight(palette.violet, 0.5),
  );
  const moon = new DirectionalLight(palette.ink, 0.55);
  moon.position.set(-0.4, 0.9, 0.6);
  scene.add(moon);

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

  function render() {
    if (!posed || !compiled) return;
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
    for (const glow of [lights, plate.flares, motes])
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

    camera.position.set(0, settledCameraHeight(placed), 0);
    camera.rotation.set(-CAMERA.pitch, 0, 0);
    plate.place(placed, camera);
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

  return {
    layout,
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
