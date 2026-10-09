import { Plane, Ray, Vector3, type Camera } from "three";
import type { RallyCourt } from "../world/court-look";
import type { Vec } from "./rules";

/** Where the court stands in the world, and its feet. */
export type CourtPlacement = Pick<RallyCourt, "x" | "z" | "level" | "scale">;

/**
 * How far a touch drag moves the player, in feet: as far as moves their
 * image on screen with the finger, so the player keeps pace with it at any
 * depth, though the court shrinks away from the camera. `from` is where
 * the player is heading (in feet, on the court's floor), `by` the finger's
 * movement in normalised device coordinates. Null where the finger would
 * take them past the horizon, off the court's floor.
 */
export function dragOnCourt(
  camera: Camera,
  court: CourtPlacement,
  from: Vec,
  by: { x: number; y: number },
): Vec | null {
  const start = new Vector3(
    court.x + from.x * court.scale,
    court.level,
    court.z + from.z * court.scale,
  );
  const target = start.clone().project(camera);
  target.x += by.x;
  target.y += by.y;
  // The ray through the moved image, from the camera onto the floor.
  const origin = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const direction = target.unproject(camera).sub(origin).normalize();
  const floor = new Plane(new Vector3(0, 1, 0), -court.level);
  const hit = new Ray(origin, direction).intersectPlane(floor, new Vector3());
  if (!hit) return null;
  return {
    x: (hit.x - start.x) / court.scale,
    z: (hit.z - start.z) / court.scale,
  };
}
