import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from "three";
import { LIT_SITES, type LitSite } from "../lit-sites";
import type { Pose } from "./flight";
import { CAMERA } from "./pose";
import {
  CN_TOWER,
  CN_TOWER_HEIGHT,
  ROGERS_CENTRE,
  ROGERS_CENTRE_RADIUS,
  ROGERS_CENTRE_STRAIGHT,
} from "./skyline";
import {
  bayWidth,
  corridorHalfWidth,
  valleyCentre,
  valleyHeight,
} from "./terrain";

/**
 * The scroll route, as pure maths: where the camera is and which way it looks
 * at each point of the home page's scroll. Unit tested without WebGL.
 *
 * From the settled view the camera climbs over the name plate and carries on
 * down the valley, stopping beside each lit site in turn (the Highlights, in
 * order), and ends at the Outpost. The route is measured in stops: 0 is the
 * settled view, 1 to 4 frame the four sites, 5 the Outpost; in between it
 * flies at an even speed and turns smoothly from one framing to the next.
 */

/** A Lit site, standing where it stands in the world. */
export type Site = Omit<LitSite, "z"> & { position: Vector3 };

/** Height of a site's light above the valley floor. */
const SITE_HEIGHT = 24;

/** How far a site stands off the valley's centre line. */
const SITE_OFFSET = 30;

/** A point `height` above the valley floor at depth z, `offset` off its line. */
function above(z: number, height: number, offset = 0) {
  const x = valleyCentre(z) + offset;
  return new Vector3(x, valleyHeight(x, z) + height, z);
}

function site({ z, ...plan }: LitSite): Site {
  return { ...plan, position: above(z, SITE_HEIGHT, plan.side * SITE_OFFSET) };
}

/** The Lit sites, in their order down the valley (../lit-sites). */
export const SITES: readonly Site[] = LIT_SITES.map(site);

/** The Outpost at the route's end, on the valley's centre line. */
export const OUTPOST = above(-1130, 14);

/** Stops along the route: the settled view, each site, the Outpost. */
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

/**
 * Where the camera stops to frame `target`: `STOP_LEAD` short of it down the
 * valley, with `target` sitting `ndcX` across the screen.
 */
function stopPose(target: Vector3, ndcX: number, aspect: number): Pose {
  const position = above(target.z + STOP_LEAD, STOP_HEIGHT);
  return { position, quaternion: framing(position, target, ndcX, aspect) };
}

/**
 * The route's last stop, the Outpost framed right of home's contact copy,
 * for a screen of this shape. It doesn't depend on the layout, so it needs
 * no route to find.
 */
export function outpostPose(aspect: number): Pose {
  return stopPose(OUTPOST, siteScreenX(aspect), aspect);
}

/** Which of the Lit sites is Juice Bros' court, where the Case study stands. */
export const COURT_SITE = SITES.findIndex((s) => s.highlight === "juice-bros");

/**
 * Where the camera stands at the court: how far behind the court's centre
 * (the net) and how far toward the valley's centre line from its axis (the
 * court stands near the edge of the valley's floor), how high above the
 * ground, and where the net sits down the screen, in normalised device
 * coordinates. Further back on a narrower screen (squarer than 6:5), so the
 * court's width fits.
 */
const COURT_VIEW = {
  wide: { back: 50, aside: 10, height: 6, netY: -0.62 },
  narrow: { back: 65, aside: 14, height: 8, netY: -0.7 },
};

/**
 * The court's own pose, for a screen of this shape: a still camera low
 * behind the court's near baseline, looking down the valley along it, with
 * the court in the lower third of the frame so the Case study's title and
 * links sit over the sky above it. It doesn't depend on the layout, so it
 * needs no route to find, and it stands off the route (the Transit eases
 * onto it as it lands).
 */
export function courtPose(aspect: number): Pose {
  const view = aspect >= 1.2 ? COURT_VIEW.wide : COURT_VIEW.narrow;
  const { position: light } = SITES[COURT_SITE];
  const x = light.x - view.aside;
  const z = light.z + view.back;
  const position = new Vector3(x, valleyHeight(x, z) + view.height, z);
  const net = light.clone().setY(light.y - SITE_HEIGHT);
  const look = new Matrix4().lookAt(position, net, UP);
  const tanY = Math.tan(((CAMERA.fovY / 2) * Math.PI) / 180);
  // Tilting the view up moves what it sees down the screen.
  const tilt = new Quaternion().setFromAxisAngle(
    new Vector3(1, 0, 0),
    Math.atan(-view.netY * tanY),
  );
  return {
    position,
    quaternion: new Quaternion().setFromRotationMatrix(look).multiply(tilt),
  };
}

/** The tip of the CN Tower's antenna, which the Skyline's camera looks up to. */
export const CN_TOWER_TOP = new Vector3(
  CN_TOWER.x,
  CN_TOWER.ground + CN_TOWER_HEIGHT,
  CN_TOWER.z,
);

/**
 * Where the camera stands at the Skyline: how far down the valley (where the
 * harbour's bay is widest), how far in from the bay's wall (on its beach,
 * the harbour's far shore) and how high above the ground, and where the CN
 * Tower's tip sits up the screen, in normalised device coordinates: on a
 * narrow screen, above the Resume page's title.
 */
const SKYLINE_VIEW = {
  z: -512,
  inset: 6,
  height: 6,
  tipY: { wide: 0.8, narrow: 0.8 },
};

/**
 * On a narrow screen, where the frame holds both the Rogers Centre and the
 * CN Tower: how far across the screen each reaches (in normalised device
 * coordinates, either side of its middle), and how far the tower's widest
 * part, its main pod, reaches from its axis.
 */
const NARROW_FIT = { edge: 0.85, towerReach: 9 };

/** The way (a turn about the vertical, from looking along -z) from `from` to `to`. */
const headingTo = (from: Vector3, to: { x: number; z: number }) =>
  Math.atan2(-(to.x - from.x), -(to.z - from.z));

/**
 * The Skyline's view, for a screen of this shape: a still camera low on the
 * harbour's far shore, looking across the water at Toronto's skyline, as
 * from the Islands: the Rogers Centre's dome, the CN Tower, the financial
 * core running on to the right. On a wide screen the tower stands right of
 * the copy (as the Outpost does on home, about 0.45 across), with the
 * world's own field of view. On a narrow one the camera zooms out (`fovY`,
 * in degrees) and turns so the Rogers Centre and the CN Tower both stand in
 * the frame. Either way the tower's tip is in the frame, so the camera
 * looks up a little, and the water fills the foot of the frame. It doesn't
 * depend on the layout, so it needs no route to find, and it stands off the
 * route (the Transit eases onto it as it lands).
 */
export function skylineView(aspect: number): { pose: Pose; fovY: number } {
  const { z, inset, height, tipY } = SKYLINE_VIEW;
  const x = valleyCentre(z) - corridorHalfWidth(z) - bayWidth(z) + inset;
  const position = new Vector3(x, valleyHeight(x, z) + height, z);
  const level = CN_TOWER_TOP.clone().setY(position.y);
  let fovY: number = CAMERA.fovY;
  let quaternion: Quaternion;
  if (aspect >= 1) {
    quaternion = framing(position, level, siteScreenX(aspect), aspect);
  } else {
    // From the dome's far side to the tower's pod, centred and fitted.
    const toDome = Math.hypot(
      ROGERS_CENTRE.x - position.x,
      ROGERS_CENTRE.z - position.z,
    );
    const left =
      headingTo(position, ROGERS_CENTRE) +
      Math.asin((ROGERS_CENTRE_RADIUS + ROGERS_CENTRE_STRAIGHT) / toDome);
    const right =
      headingTo(position, CN_TOWER) -
      Math.asin(NARROW_FIT.towerReach / position.distanceTo(level));
    const half = (left - right) / 2;
    const tanX = Math.tan(half) / NARROW_FIT.edge;
    fovY = Math.max(
      CAMERA.fovY,
      (2 * Math.atan(tanX / aspect) * 180) / Math.PI,
    );
    quaternion = new Quaternion().setFromAxisAngle(UP, (left + right) / 2);
  }
  const tanY = Math.tan(((fovY / 2) * Math.PI) / 180);
  // Tilting the view up moves what it sees down the screen.
  const rise = Math.atan(
    (CN_TOWER_TOP.y - position.y) / position.distanceTo(level),
  );
  const tilt = rise - Math.atan((aspect >= 1 ? tipY.wide : tipY.narrow) * tanY);
  return {
    pose: {
      position,
      quaternion: quaternion.multiply(
        new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), tilt),
      ),
    },
    fovY,
  };
}

/** The Skyline's pose, for a screen of this shape (see `skylineView`). */
export function skylinePose(aspect: number): Pose {
  return skylineView(aspect).pose;
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

  /** Cruises on down the valley to a stop. */
  function stopAt({ position, quaternion }: Pose) {
    for (let z = from - SPACING; z > position.z + SPACING / 2; z -= SPACING) {
      points.push(above(z, CRUISE_HEIGHT));
    }
    stopPoints.push(points.length);
    points.push(position);
    views.push(quaternion);
    from = position.z;
  }

  for (const s of SITES) {
    const aim = s.position.clone().setY(s.position.y - AIM_BELOW);
    stopAt(stopPose(aim, s.side * siteScreenX(aspect), aspect));
  }
  // To the right, clear of the contact copy, which sits on the left.
  stopAt(outpostPose(aspect));

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
