import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from "three";
import { LIT_SITES, type LitSite } from "../lit-sites";
import type { RallyCourt } from "./court-look";
import { diamondMiddle, type DiamondField } from "./diamond";
import type { Pose } from "./flight";
import { HONG_KONG_CENTRE, HONG_KONG_SHORE } from "./hong-kong";
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
  HARBOUR,
  valleyCentre,
  valleyHeight,
} from "./terrain";

/**
 * The scroll route, as pure maths: where the camera is and which way it looks
 * at each point of the home page's scroll. Unit tested without WebGL.
 *
 * From the settled view the camera climbs over the name plate and carries on
 * down the valley, stopping beside each lit site in turn (the Highlights, in
 * order), and ends looking across Victoria Harbour at Hong Kong. The route
 * is measured in stops: 0 is the settled view, 1 to 4 frame the four sites,
 * 5 Hong Kong; in between it flies at an even speed and turns smoothly from
 * one framing to the next, but for one look aside: between the last site and
 * Hong Kong it turns right to frame the Diamond, with no panel or stop of
 * its own.
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

/**
 * Hong Kong's middle, which the route's last stop looks at: a little above
 * the camera's own height, so the view looks up a touch, the city whole in
 * its upper half and Victoria Harbour across its lower.
 */
export const HONG_KONG = new Vector3(
  HONG_KONG_CENTRE.x,
  valleyHeight(HONG_KONG_CENTRE.x, HONG_KONG_CENTRE.z) + 13,
  HONG_KONG_CENTRE.z,
);

/** Stops along the route: the settled view, each site, Hong Kong. */
export const ROUTE_STOPS = SITES.length + 2;

/** How far short of a site the camera stops to frame it. */
const STOP_LEAD = 80;

/** Height above the floor the camera stops at, and cruises at in between. */
const STOP_HEIGHT = 16;

/**
 * How high the route's last stop stands over Tsim Sha Tsui's shore: lower
 * than the other stops, as from the promenade, so Hong Kong stands whole
 * above the frame's middle with Victoria Harbour below it.
 */
const SHORE_HEIGHT = 10;
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
 * The route's last stop, home's closing view, for a screen of this shape:
 * on Tsim Sha Tsui's shore, looking across Victoria Harbour at Hong Kong,
 * right of the contact copy on a wide screen and centred on a narrow one,
 * where the whole city must stand in the frame. It doesn't depend on the
 * layout, so it needs no route to find.
 */
export function hongKongPose(aspect: number): Pose {
  const position = above(HONG_KONG_SHORE.z, SHORE_HEIGHT);
  const ndcX = aspect >= 1 ? siteScreenX(aspect) : 0;
  return { position, quaternion: framing(position, HONG_KONG, ndcX, aspect) };
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

/**
 * Where the camera stands at the court for the Rally game, in the court's
 * feet from where its net crosses its centre line: as the game's own camera
 * stood, raised behind the player's baseline on the centre line, aiming
 * down the court; on a screen taller than it is wide, higher and further
 * back.
 */
const PLAY_VIEW = {
  landscape: { height: 19, back: 41, aim: -3 },
  portrait: { height: 30, back: 46, aim: -2 },
};

/**
 * What the Rally game's frame holds, in the court's feet: both baselines
 * with room round them, and the ball's height over the far one, each within
 * `edge` of the frame's middle (in normalised device coordinates). The
 * field of view widens to hold them, from `fovY` up to `fovMax` (vertical,
 * in degrees); past that, the camera backs off along its line of sight
 * instead, `backOff` of its distance at a time.
 */
export const PLAY_FRAME = {
  points: [
    [-13, 0, 27],
    [13, 0, 27],
    [-11, 0, -23],
    [11, 0, -23],
    [0, 9, -23],
  ],
  edge: 0.94,
  fovY: 24,
  fovMax: 60,
  backOff: 0.05,
} as const;

/** Where `point` lands across and up the frame of a camera at `pose`, in NDC. */
function ndc(pose: Pose, point: Vector3, fovY: number, aspect: number) {
  const local = point
    .clone()
    .sub(pose.position)
    .applyQuaternion(pose.quaternion.clone().invert());
  const tanY = Math.tan(((fovY / 2) * Math.PI) / 180);
  const depth = -local.z;
  return {
    x: local.x / (depth * tanY * aspect),
    y: local.y / (depth * tanY),
    depth,
  };
}

/**
 * The Rally game's view of the court on /play, for a screen of this shape:
 * a still camera raised behind the player's baseline, looking down the
 * court (its length runs down the valley, the player's half nearer home),
 * framed as the game's own camera framed it: the narrowest field of view
 * that holds the whole court and the ball over it (see PLAY_FRAME), the
 * camera backing off where that would be too wide. It doesn't depend on the
 * layout, so it needs no route to find, and it stands off the route.
 */
export function playView(
  aspect: number,
  court: RallyCourt,
): { pose: Pose; fovY: number } {
  const view = aspect < 1 ? PLAY_VIEW.portrait : PLAY_VIEW.landscape;
  const { scale } = court;
  /** A point in the court's feet, in the world. */
  const at = (x: number, y: number, z: number) =>
    new Vector3(court.x + x * scale, court.level + y * scale, court.z + z * scale);
  return fitted(
    at(0, 0, view.aim),
    at(0, view.height, view.back),
    PLAY_FRAME.points.map(([x, y, z]) => at(x, y, z)),
    PLAY_FRAME,
    aspect,
  );
}

/**
 * A still camera looking from `from` at `aim`, framed to hold every point
 * of `frame` within `fit.edge` of the frame's middle: the narrowest field
 * of view that does, from `fit.fovY` up to `fit.fovMax`; past that, backed
 * off along its line of sight, `fit.backOff` of its distance at a time.
 */
function fitted(
  aim: Vector3,
  from: Vector3,
  frame: readonly Vector3[],
  fit: { edge: number; fovY: number; fovMax: number; backOff: number },
  aspect: number,
): { pose: Pose; fovY: number } {
  for (let back = 1; ; back += fit.backOff) {
    const position = aim.clone().lerp(from, back);
    const look = new Matrix4().lookAt(position, aim, UP);
    const pose = {
      position,
      quaternion: new Quaternion().setFromRotationMatrix(look),
    };
    for (let fovY = fit.fovY; fovY <= fit.fovMax; fovY++) {
      const fits = frame.every((point) => {
        const { x, y, depth } = ndc(pose, point, fovY, aspect);
        return depth > 0 && Math.abs(x) <= fit.edge && Math.abs(y) <= fit.edge;
      });
      if (fits) return { pose, fovY };
    }
  }
}

/**
 * A point on the Diamond's field, in the Home Run Derby's feet from home
 * plate: -z out to centre field, x across it (to the right, looking out),
 * y up.
 */
export function fieldPoint(field: DiamondField, x: number, y: number, z: number) {
  // Turned so the field's -z runs out along its line to centre field.
  const turn = (-field.side * Math.PI) / 4;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return new Vector3(
    field.x + (x * cos + z * sin) * field.scale,
    field.level + y * field.scale,
    field.z + (-x * sin + z * cos) * field.scale,
  );
}

/**
 * Where the camera stands at the Diamond for the Home Run Derby, in the
 * field's feet (see `fieldPoint`): raised behind home plate on the line out
 * to centre field, aiming out along it; on a screen taller than it is wide,
 * higher and further back.
 */
const DERBY_VIEW = {
  landscape: { height: 32, back: 45, aim: -110 },
  portrait: { height: 40, back: 55, aim: -100 },
};

/**
 * What the Derby's frame holds, in the field's feet: home plate (drawn
 * far bigger than life) with the batter standing left of it, Curvebot on
 * the mound, and centre field's fence with room over it for a home run,
 * each within `edge` of the frame's middle, fitted as /play's frame is (see
 * PLAY_FRAME).
 */
export const DERBY_FRAME = {
  points: [
    [-20, 0, 6],
    [-20, 16, -9],
    [10, 0, 6],
    [0, 10, -60.5],
    [0, 20, -225],
  ],
  edge: 0.9,
  fovY: 30,
  fovMax: 60,
  backOff: 0.05,
} as const;

/**
 * The Home Run Derby's view of the Diamond, for a screen of this shape: a
 * still camera raised behind home plate, looking out over the mound to
 * centre field (see DERBY_FRAME). It doesn't depend on the layout, so it
 * needs no route to find, and it stands off the route.
 */
export function derbyView(
  aspect: number,
  field: DiamondField,
): { pose: Pose; fovY: number } {
  const view = aspect < 1 ? DERBY_VIEW.portrait : DERBY_VIEW.landscape;
  return fitted(
    fieldPoint(field, 0, 0, view.aim),
    fieldPoint(field, 0, view.height, view.back),
    DERBY_FRAME.points.map(([x, y, z]) => fieldPoint(field, x, y, z)),
    DERBY_FRAME,
    aspect,
  );
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
 * the copy (as Hong Kong does on home, about 0.45 across), with the
 * world's own field of view. On a narrow one the camera zooms out (`fovY`,
 * in degrees) and turns so the Rogers Centre and the CN Tower both stand in
 * the frame. Either way the tower's tip is in the frame, so the camera
 * looks up a little, and the water fills the foot of the frame. It doesn't
 * depend on the layout, so it needs no route to find, and it stands off the
 * route (the Transit eases onto it as it lands).
 */
export function skylineView(aspect: number): { pose: Pose; fovY: number } {
  const { z, inset, height, tipY } = SKYLINE_VIEW;
  const x = valleyCentre(z) - corridorHalfWidth(z) - bayWidth(z, HARBOUR) + inset;
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

/**
 * Home's route for one layout (the settled pose and the screen's shape): from
 * the settled view up and over the plate, then to each Lit site and on to
 * Hong Kong.
 */
export function createRoute(
  settled: Pose,
  plateCentre: Vector3,
  aspect: number,
) {
  // Up and over the plate, then down the valley.
  const overY = plateCentre.y + CLIMB.over;
  const climb = [
    new Vector3(
      settled.position.x,
      (settled.position.y + overY) / 2 + CLIMB.lift,
      plateCentre.z + CLIMB.ahead,
    ),
    new Vector3(plateCentre.x / 2, overY, plateCentre.z),
    above(plateCentre.z - CLIMB.beyond, CRUISE_HEIGHT + CLIMB.extra),
  ];
  const sites = SITES.map((s) => {
    const aim = s.position.clone().setY(s.position.y - AIM_BELOW);
    return stopPose(aim, s.side * siteScreenX(aspect), aspect);
  });
  // On a wide screen, to the right, clear of the contact copy on the left.
  const hongKong = hongKongPose(aspect);
  const middle = diamondMiddle();
  const diamond = new Vector3(
    middle.x,
    valleyHeight(middle.x, middle.z) + DIAMOND_AIM,
    middle.z,
  );
  const glance = DIAMOND_GLANCE[aspect >= 1 ? "wide" : "narrow"];
  return routeThrough([settled, ...sites, hongKong], climb, {
    after: SITES.length,
    ...glance,
    look: (from) => framing(from, diamond, glance.ndcX, aspect),
  });
}

/** How high over the stadium's middle the route looks, to frame its stands and towers. */
const DIAMOND_AIM = 3;

/**
 * When, through the leg from the last site to Hong Kong, home's route turns
 * right to frame the Diamond (`at`, as a fraction of the leg) and how long it
 * keeps it framed (to `until`), the turns in and out as long as the
 * route's pace allows: on a narrow screen further off, so the whole park
 * fits across the frame; on a wide one a little right of centre (`ndcX`),
 * which spares the turns a few degrees.
 */
export const DIAMOND_GLANCE = {
  narrow: { at: 0.38, until: 0.4, ndcX: 0 },
  wide: { at: 0.33, until: 0.36, ndcX: 0.15 },
};

/**
 * A look aside partway along one leg (the one leaving stop `after`): the
 * camera turns from that stop's view to `look`'s view from where it stands
 * by `at` (a fraction of the leg), keeps to it until `until`, then turns on
 * to the next stop's view.
 */
export type Glance = {
  after: number;
  look: (from: Vector3) => Quaternion;
  at: number;
  until: number;
};

/**
 * A scroll route through `stops`, in order down the valley: from the first,
 * through the `climb` points (if any), then cruising down the valley to each
 * next stop. It is measured in stops: 0 is the first, 1 the next, and so on.
 */
export function routeThrough(
  stops: readonly Pose[],
  climb: readonly Vector3[] = [],
  glance?: Glance,
) {
  const points: Vector3[] = [stops[0].position.clone(), ...climb];
  /** Index into `points` of each stop. */
  const stopPoints: number[] = [0];
  const views: Quaternion[] = [stops[0].quaternion.clone()];
  let from = points[points.length - 1].z;

  /** Cruises on down the valley to a stop. */
  function stopAt({ position, quaternion }: Pose) {
    for (let z = from - SPACING; z > position.z + SPACING / 2; z -= SPACING) {
      points.push(above(z, CRUISE_HEIGHT));
    }
    stopPoints.push(points.length);
    points.push(position.clone());
    views.push(quaternion.clone());
    from = position.z;
  }

  for (const stop of stops.slice(1)) stopAt(stop);

  const curve = new CatmullRomCurve3(points, false, "centripetal");
  const perSegment = 12;
  curve.arcLengthDivisions = (points.length - 1) * perSegment;
  const lengths = curve.getLengths((points.length - 1) * perSegment);
  const total = lengths[lengths.length - 1];
  /** Fraction of the route's length at each stop. */
  const stopFractions = stopPoints.map((i) => lengths[i * perSegment] / total);

  return {
    /** The camera at `stop` (0 to the last stop; fractions in between). */
    poseAt(stop: number): Pose {
      const s = Math.min(stops.length - 1, Math.max(0, stop));
      const k = Math.min(stops.length - 2, Math.floor(s));
      const f = s - k;
      const position = f === 0 ? points[stopPoints[k]].clone() : at(k, f);
      const quaternion =
        glance?.after === k
          ? glancing(glance, k, f, position)
          : views[k].clone().slerp(views[k + 1], ease(f));
      return { position, quaternion };
    },
  };

  /** Where the camera stands `f` through the leg leaving stop `k`. */
  function at(k: number, f: number) {
    const u = stopFractions[k] + (stopFractions[k + 1] - stopFractions[k]) * f;
    return curve.getPointAt(u);
  }

  /** The view `f` through the leg leaving stop `k`, with `glance` on it. */
  function glancing(g: Glance, k: number, f: number, position: Vector3) {
    if (f < g.at) {
      return views[k].clone().slerp(g.look(at(k, g.at)), ramp(f / g.at));
    }
    if (f <= g.until) return g.look(position);
    return g
      .look(at(k, g.until))
      .slerp(views[k + 1], ramp((f - g.until) / (1 - g.until)));
  }
}

/** Smoothstep: eases a turn in and out. */
function ease(f: number) {
  return f * f * (3 - 2 * f);
}

/**
 * Eases a turn in over its first 15% and out over its last, steady in
 * between: at its fastest only 1.18 times its mean pace (smoothstep's 1.5), so
 * the Diamond's longer turns keep to the route's pace.
 */
function ramp(f: number) {
  const r = 0.15;
  const v = 1 / (1 - r);
  if (f < r) return (v * f * f) / (2 * r);
  if (f > 1 - r) return 1 - (v * (1 - f) ** 2) / (2 * r);
  return v * (f - r / 2);
}

export type Route = ReturnType<typeof routeThrough>;
