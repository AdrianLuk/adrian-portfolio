import type { WordFit } from "./plate-fit";
import { valleyHeight } from "./terrain";

/**
 * The settled camera: on the valley's centre line, pitched a little down the
 * valley, with the plate standing `plateDepth` ahead on the floor. Only its
 * height depends on the layout: it rises until the plate's lowest baseline,
 * placed where the DOM headline sits, rests on the ground.
 */
export const CAMERA = {
  fovY: 40,
  /** Radians, looking down. */
  pitch: (7 * Math.PI) / 180,
  plateDepth: 90,
} as const;

/**
 * Camera height for which the lowest word's baseline, at its midpoint, sits on
 * the terrain. With the camera at (0, h, 0) and pitched down by p, a camera-space
 * point (x, y, -d) lands at world y = h + y cos p - d sin p, z = -y sin p - d cos p.
 */
export function settledCameraHeight(
  words: readonly { fit: WordFit; advance: number }[],
) {
  const { fit, advance } = words.reduce((a, b) => (b.fit.y < a.fit.y ? b : a));
  const { pitch, plateDepth } = CAMERA;
  const x = fit.x + (advance * fit.scale) / 2;
  const z = -fit.y * Math.sin(pitch) - plateDepth * Math.cos(pitch);
  return (
    valleyHeight(x, z) - fit.y * Math.cos(pitch) + plateDepth * Math.sin(pitch)
  );
}
