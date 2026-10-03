import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from "three";
import type { Pose } from "./flight";
import { CAMERA } from "./pose";
import { valleyCentre, valleyHeight } from "./terrain";

/**
 * The scroll route, as pure maths: where the camera is and which way it looks
 * at each point of the home page's scroll. Unit tested without WebGL.
 *
 * From the settled view the camera climbs over the name plate and carries on
 * down the valley, stopping beside each lit site in turn (the Highlights, in
 * order), and ends at the outpost. The route is measured in stops: 0 is the
 * settled view, 1 to 4 frame the four sites, 5 the outpost; in between it
 * flies at an even speed and turns smoothly from one framing to the next.
 */

/**
 * Where a lit site stands, which side of the valley (+1 = right, +x), and
 * the light it burns (its panel's accent).
 */
export type Site = {
  position: Vector3;
  side: 1 | -1;
  light: "cyan" | "violet";
};

/** Height of a site's light above the valley floor. */
const SITE_HEIGHT = 24;

/** How far a site stands off the valley's centre line. */
const SITE_OFFSET = 30;

function site(z: number, side: 1 | -1, light: Site["light"]): Site {
  const x = valleyCentre(z) + side * SITE_OFFSET;
  return {
    position: new Vector3(x, valleyHeight(x, z) + SITE_HEIGHT, z),
    side,
    light,
  };
}

/**
 * The four lit sites, in the Highlights' order (Control D, Life House, Juice
 * Bros, BT Cup), alternating sides of the valley: on a wide screen the panels
 * alternate left and right, so each site stands on the side its panel leaves
 * clear. The first is the light on the horizon once the camera settles.
 */
export const SITES: readonly Site[] = [
  site(-420, 1, "cyan"),
  site(-600, -1, "cyan"),
  site(-780, 1, "violet"),
  site(-960, -1, "cyan"),
];

/** The outpost at the route's end, on the valley's centre line. */
export const OUTPOST = (() => {
  const z = -1130;
  const x = valleyCentre(z);
  return new Vector3(x, valleyHeight(x, z) + 14, z);
})();

/** Stops along the route: the settled view, each site, the outpost. */
export const ROUTE_STOPS = SITES.length + 2;

/**
 * What the scroll drives. at: the stop the camera is at (0, the settled view,
 * until the visitor scrolls); lit: how lit each site is, 0 to 1.
 */
export type RouteRig = { at: number; lit: number[] };

export const routeRig = (): RouteRig => ({ at: 0, lit: SITES.map(() => 0) });

/** How far short of a site the camera stops to frame it. */
const STOP_LEAD = 80;

/** Height above the floor the camera stops at, and cruises at in between. */
const STOP_HEIGHT = 16;
const CRUISE_HEIGHT = 24;

/** How far over the plate's centre the camera passes. */
const OVER_PLATE = 24;

/**
 * Where a framed site sits across the screen, in normalised device
 * coordinates: off to its own side on a wide screen, nearer the middle on a
 * narrow one, where the panel spans the screen anyway.
 */
function siteScreenX(aspect: number) {
  return aspect >= 1 ? 0.45 : 0.2;
}

const UP = new Vector3(0, 1, 0);

/** Looking from `from` at `at`, turned so `at` sits `ndcX` across the screen. */
function framing(from: Vector3, at: Vector3, ndcX: number, aspect: number) {
  const look = new Matrix4().lookAt(from, at, UP);
  const quaternion = new Quaternion().setFromRotationMatrix(look);
  const tanX = Math.tan(((CAMERA.fovY / 2) * Math.PI) / 180) * aspect;
  // Turning the view left moves what it sees right.
  const yaw = Math.atan(ndcX * tanX);
  return new Quaternion().setFromAxisAngle(UP, yaw).multiply(quaternion);
}

const cruise = (z: number, height: number) => {
  const x = valleyCentre(z);
  return new Vector3(x, valleyHeight(x, z) + height, z);
};

/** Builds the route for one layout (the settled pose and the screen's shape). */
export function createRoute(
  settled: Pose,
  plateCentre: Vector3,
  aspect: number,
) {
  const points: Vector3[] = [settled.position.clone()];
  /** Index into `points` of each stop. */
  const stopPoints: number[] = [0];
  const views: Quaternion[] = [settled.quaternion.clone()];

  // Up and over the plate, then down the valley to the first site.
  const overY = plateCentre.y + OVER_PLATE;
  points.push(
    new Vector3(
      settled.position.x,
      (settled.position.y + overY) / 2 + 4,
      plateCentre.z + 45,
    ),
    new Vector3(plateCentre.x * 0.5, overY, plateCentre.z),
    cruise(plateCentre.z - 60, CRUISE_HEIGHT + 6),
  );

  let from = plateCentre.z - 60;
  for (const s of SITES) {
    const stopZ = s.position.z + STOP_LEAD;
    for (let z = from - 60; z > stopZ + 30; z -= 60) {
      points.push(cruise(z, CRUISE_HEIGHT));
    }
    const at = cruise(stopZ, STOP_HEIGHT);
    stopPoints.push(points.length);
    points.push(at);
    // Aimed a little below the light, so the ground it stands on shows.
    const target = s.position.clone().setY(s.position.y - 8);
    views.push(framing(at, target, s.side * siteScreenX(aspect), aspect));
    from = stopZ;
  }

  const lastZ = OUTPOST.z + STOP_LEAD;
  for (let z = from - 60; z > lastZ + 30; z -= 60) {
    points.push(cruise(z, CRUISE_HEIGHT));
  }
  const end = cruise(lastZ, STOP_HEIGHT);
  stopPoints.push(points.length);
  points.push(end);
  // To the right, clear of the contact copy, which sits on the left.
  views.push(framing(end, OUTPOST, siteScreenX(aspect), aspect));

  const curve = new CatmullRomCurve3(points, false, "centripetal");
  const perSegment = 12;
  curve.arcLengthDivisions = (points.length - 1) * perSegment;
  const lengths = curve.getLengths((points.length - 1) * perSegment);
  const total = lengths[lengths.length - 1];
  /** Fraction of the route's length at each stop. */
  const stopAt = stopPoints.map((i) => lengths[i * perSegment] / total);

  return {
    /** The camera at `stop` (0 to ROUTE_STOPS - 1; fractions in between). */
    poseAt(stop: number): Pose {
      const s = Math.min(ROUTE_STOPS - 1, Math.max(0, stop));
      const k = Math.min(ROUTE_STOPS - 2, Math.floor(s));
      const f = s - k;
      const u = stopAt[k] + (stopAt[k + 1] - stopAt[k]) * f;
      const position =
        f === 0 ? points[stopPoints[k]].clone() : curve.getPointAt(u);
      const eased = f * f * (3 - 2 * f);
      const quaternion = views[k].clone().slerp(views[k + 1], eased);
      return { position, quaternion };
    },
  };
}

export type Route = ReturnType<typeof createRoute>;
