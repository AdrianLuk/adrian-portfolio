import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from "three";
import type { Pose } from "./flight";
import { CAMERA } from "./pose";
import { SITE_PLAN, type SitePlan } from "./rigs";
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

/** A lit site from its plan, standing where it stands. */
export type Site = Omit<SitePlan, "z"> & { position: Vector3 };

/** Height of a site's light above the valley floor. */
const SITE_HEIGHT = 24;

/** How far a site stands off the valley's centre line. */
const SITE_OFFSET = 30;

/** A point `height` above the valley floor at depth z, `offset` off its line. */
function above(z: number, height: number, offset = 0) {
  const x = valleyCentre(z) + offset;
  return new Vector3(x, valleyHeight(x, z) + height, z);
}

function site({ z, ...plan }: SitePlan): Site {
  return { ...plan, position: above(z, SITE_HEIGHT, plan.side * SITE_OFFSET) };
}

/** The four lit sites, from their plan in ./rigs. */
export const SITES: readonly Site[] = SITE_PLAN.map(site);

/** The outpost at the route's end, on the valley's centre line. */
export const OUTPOST = above(-1130, 14);

/** Stops along the route: the settled view, each site, the outpost. */
export const ROUTE_STOPS = SITES.length + 2;

/** How far short of a site the camera stops to frame it. */
const STOP_LEAD = 80;

/** Height above the floor the camera stops at, and cruises at in between. */
const STOP_HEIGHT = 16;
const CRUISE_HEIGHT = 24;

/** World units between the points the route's spline passes through. */
const SPACING = 60;

/**
 * Over the plate: how far in front of it the climb is halfway (and how far
 * above the halfway height), how high over its centre the camera passes, and
 * how far beyond it the camera levels out, a little above cruising height.
 */
const CLIMB = { ahead: 45, lift: 4, over: 24, beyond: 60, extra: 6 };

/** How far below a site's light the camera aims, so its ground shows. */
const AIM_BELOW = 8;

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

  // Up and over the plate, then down the valley.
  const overY = plateCentre.y + CLIMB.over;
  let from = plateCentre.z - CLIMB.beyond;
  points.push(
    new Vector3(
      settled.position.x,
      (settled.position.y + overY) / 2 + CLIMB.lift,
      plateCentre.z + CLIMB.ahead,
    ),
    new Vector3(plateCentre.x / 2, overY, plateCentre.z),
    above(from, CRUISE_HEIGHT + CLIMB.extra),
  );

  /**
   * Cruises on down the valley and stops `STOP_LEAD` short of `target`,
   * framed `ndcX` across the screen.
   */
  function stopBefore(target: Vector3, ndcX: number) {
    const stopZ = target.z + STOP_LEAD;
    for (let z = from - SPACING; z > stopZ + SPACING / 2; z -= SPACING) {
      points.push(above(z, CRUISE_HEIGHT));
    }
    const at = above(stopZ, STOP_HEIGHT);
    stopPoints.push(points.length);
    points.push(at);
    views.push(framing(at, target, ndcX, aspect));
    from = stopZ;
  }

  for (const s of SITES) {
    const aim = s.position.clone().setY(s.position.y - AIM_BELOW);
    stopBefore(aim, s.side * siteScreenX(aspect));
  }
  // To the right, clear of the contact copy, which sits on the left.
  stopBefore(OUTPOST, siteScreenX(aspect));

  const curve = new CatmullRomCurve3(points, false, "centripetal");
  const perSegment = 12;
  curve.arcLengthDivisions = (points.length - 1) * perSegment;
  const lengths = curve.getLengths((points.length - 1) * perSegment);
  const total = lengths[lengths.length - 1];
  /** Fraction of the route's length at each stop. */
  const stopFractions = stopPoints.map((i) => lengths[i * perSegment] / total);

  return {
    /** The camera at `stop` (0 to ROUTE_STOPS - 1; fractions in between). */
    poseAt(stop: number): Pose {
      const s = Math.min(ROUTE_STOPS - 1, Math.max(0, stop));
      const k = Math.min(ROUTE_STOPS - 2, Math.floor(s));
      const f = s - k;
      const u =
        stopFractions[k] + (stopFractions[k + 1] - stopFractions[k]) * f;
      const position =
        f === 0 ? points[stopPoints[k]].clone() : curve.getPointAt(u);
      const eased = f * f * (3 - 2 * f);
      const quaternion = views[k].clone().slerp(views[k + 1], eased);
      return { position, quaternion };
    },
  };
}

export type Route = ReturnType<typeof createRoute>;
