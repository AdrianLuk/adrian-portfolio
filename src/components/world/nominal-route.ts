import { Euler, Quaternion, Vector3 } from "three";
import { CAMERA, settledYaw } from "./pose";
import { createRoute, type Route } from "./route";

/**
 * A stand-in for home's scroll route on a visit that hasn't shown home: a
 * Transit between the court and the Outpost still runs along the route, but
 * the route exists only once home's headline is measured. From the second
 * Lit site on, the route doesn't depend on home's layout (only on the
 * screen's shape), so a route planned from a typical settled view flies
 * those legs exactly as home's own would. Home's route replaces it once
 * home is laid out.
 */

/** A typical settled view: its height, and the plate's centre across. */
const NOMINAL = { height: 21, plateX: -18 };

let built: { aspect: number; route: Route } | null = null;

/** The nominal route for a screen of this shape, built once for it. */
export function nominalRoute(aspect: number): Route {
  if (built?.aspect !== aspect) {
    const quaternion = new Quaternion().setFromEuler(
      new Euler(-CAMERA.pitch, -settledYaw(aspect), 0, "YXZ"),
    );
    const position = new Vector3(0, NOMINAL.height, 0);
    const plateCentre = new Vector3(NOMINAL.plateX, 0, -CAMERA.plateDepth)
      .applyQuaternion(quaternion)
      .add(position);
    built = {
      aspect,
      route: createRoute({ position, quaternion }, plateCentre, aspect),
    };
  }
  return built.route;
}
