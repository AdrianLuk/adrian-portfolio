import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Pose } from "./flight";
import { nameGlyphs } from "./name-glyphs";
import {
  fitWord,
  unitsPerPixel,
  type PxRect,
  type Viewport,
  type WordFit,
} from "./plate-fit";
import { valleyHeight } from "./terrain";

/**
 * The settled camera: on the valley's centre line, pitched a little down the
 * valley, with the plate standing `plateDepth` ahead on the floor. Its height
 * depends on the layout: it rises until the plate's lowest baseline, placed
 * where the DOM headline sits, rests on the ground. On a portrait screen it
 * also turns `portraitYaw` to the right, so the first lit site's shield, on
 * the valley's right, stands whole in the narrow frame (the plate turns with
 * it, so it stays on the headline).
 */
export const CAMERA = {
  fovY: 40,
  /** Radians, looking down. */
  pitch: (7 * Math.PI) / 180,
  plateDepth: 90,
  /** Radians, turned right, on a screen taller than it is wide. */
  portraitYaw: (4 * Math.PI) / 180,
} as const;

/** How far right the settled camera turns for a screen of this shape, in radians. */
export function settledYaw(aspect: number) {
  return aspect < 1 ? CAMERA.portraitYaw : 0;
}

/**
 * Camera height for which the lowest word's baseline, at its midpoint, sits on
 * the terrain. With the camera at (0, h, 0), pitched down by p and turned right
 * by t, a camera-space point (x, y, -d) lands at world y = h + y cos p - d sin p,
 * and, before the turn, z = -y sin p - d cos p.
 */
export function settledCameraHeight(
  words: readonly { fit: WordFit; advance: number }[],
  yaw = 0,
) {
  const { fit, advance } = words.reduce((a, b) => (b.fit.y < a.fit.y ? b : a));
  const { pitch, plateDepth } = CAMERA;
  const x = fit.x + (advance * fit.scale) / 2;
  const z = -fit.y * Math.sin(pitch) - plateDepth * Math.cos(pitch);
  const turnedX = x * Math.cos(yaw) - z * Math.sin(yaw);
  const turnedZ = x * Math.sin(yaw) + z * Math.cos(yaw);
  return (
    valleyHeight(turnedX, turnedZ) -
    fit.y * Math.cos(pitch) +
    plateDepth * Math.sin(pitch)
  );
}

/**
 * Home's settled view, for the headline's words where the page set them
 * (canvas pixels, on a canvas `viewport` in size): each word's fit on the
 * plate, the settled camera's pose, `onPlate` (a point in the plate's own
 * frame, x right and y up from the view's axis, in the world), the plate's
 * extent in that frame (its ends, lowest baseline and highest cap), and its
 * centre in the world. Null if there are no words, or one the plate can't set.
 */
export function settle(
  words: readonly { text: string; rect: PxRect }[],
  viewport: Viewport,
) {
  const perPx = unitsPerPixel(CAMERA.fovY, CAMERA.plateDepth, viewport.height);
  const placed: { text: string; advance: number; fit: WordFit }[] = [];
  for (const { text, rect } of words) {
    const glyphs = nameGlyphs.words[text as keyof typeof nameGlyphs.words];
    if (!glyphs) return null;
    const fit = fitWord(rect, glyphs.advance, nameGlyphs, viewport, perPx);
    placed.push({ text, advance: glyphs.advance, fit });
  }
  if (placed.length === 0) return null;

  const yaw = settledYaw(viewport.width / viewport.height);
  const position = new Vector3(0, settledCameraHeight(placed, yaw), 0);
  const quaternion = new Quaternion().setFromEuler(
    new Euler(-CAMERA.pitch, -yaw, 0, "YXZ"),
  );
  const frame = new Matrix4().compose(position, quaternion, new Vector3(1, 1, 1));
  const onPlate = (x: number, y: number) =>
    new Vector3(x, y, -CAMERA.plateDepth).applyMatrix4(frame);

  const plate = {
    left: Math.min(...placed.map((p) => p.fit.x)),
    right: Math.max(...placed.map((p) => p.fit.x + p.advance * p.fit.scale)),
    base: Math.min(...placed.map((p) => p.fit.y)),
    capTop: Math.max(
      ...placed.map((p) => p.fit.y + nameGlyphs.capHeight * p.fit.scale),
    ),
  };
  const pose: Pose = { position, quaternion };
  return {
    placed,
    pose,
    onPlate,
    plate,
    centre: onPlate(
      (plate.left + plate.right) / 2,
      (plate.base + plate.capTop) / 2,
    ),
  };
}
