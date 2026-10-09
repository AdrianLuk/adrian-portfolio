import { WorldStill } from "./world-backdrop";

/**
 * The Resume page's first paint: the world as the camera holds it at the
 * Skyline. Neither dimmed nor scattered with motes, so the live world fades
 * in over a matching frame; it stays as it is without WebGL or while the GPU
 * context is lost.
 */
export function SkylineStill() {
  return <WorldStill name="skyline" />;
}
