import type { WordFit } from "./plate-fit";
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
