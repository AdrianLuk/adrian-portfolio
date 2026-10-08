import { Euler, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  createCameraDirector,
  type CameraDirector,
  type CameraPaths,
} from "./camera-director";
import { createFlightTimeline } from "./flight-timeline";
import type { Place } from "./world-places";
import { createFlightPath, type Pose } from "./world/flight";
import { nominalRoute } from "./world/nominal-route";
import { CAMERA } from "./world/pose";
import { FLIGHT_START_RIG, TRANSIT_MAX_SECONDS } from "./world/rigs";
import { courtPose, createRoute, outpostPose } from "./world/route";
import { COURT_STOP, OUTPOST_STOP, transit } from "./world/transit";

/** A desktop layout's settled pose and plate (as in transit.test.ts). */
const settled: Pose = {
  position: new Vector3(0, 21, 0),
  quaternion: new Quaternion().setFromEuler(
    new Euler(-CAMERA.pitch, 0, 0, "YXZ"),
  ),
};
const plateCentre = new Vector3(-18, 0, -CAMERA.plateDepth)
  .applyQuaternion(settled.quaternion)
  .add(settled.position);
const aspect = 1.6;

const FRAME = 16;

/**
 * The most the camera ever moves in a frame of FRAME ms when nothing jumps:
 * a Transit finishing the Opening's swoop, quickened, moves it about 14 units
 * and turns it about 0.17 radians; the Opening itself, and the route, less.
 * A snap to another view is hundreds of units.
 */
const MOST = { distance: 20, angle: 0.25 };

/** A director with home's paths measured, and home's page scrolled to `page.stop`. */
function setup() {
  const route = createRoute(settled, plateCentre, aspect);
  const opening = createFlightPath(settled, plateCentre);
  const page = { stop: 0 };
  const paths: CameraPaths = {
    opening,
    route,
    outpost: outpostPose(aspect),
    outpostStop: OUTPOST_STOP,
    court: courtPose(aspect),
    courtStop: COURT_STOP,
    transit,
  };
  const director = createCameraDirector({ homeStop: () => page.stop });
  director.layout(paths);
  return { director, route, opening, page, paths };
}

/** The Opening's own timeline, paused, its values passed on as it is seeked. */
function openingTimeline(director: CameraDirector) {
  const rig = { ...FLIGHT_START_RIG };
  const timeline = createFlightTimeline({
    rig,
    credits: [],
    onComplete: () => director.openingLands(),
  });
  timeline.pause(0);
  return {
    rig,
    duration: timeline.duration(),
    at(seconds: number) {
      timeline.seek(seconds);
      director.openingAt(rig);
      if (seconds >= timeline.duration()) director.openingLands();
    },
  };
}

/**
 * Films `ms` of frames from `from`, calling `script` with each frame's time
 * first, and returns every pose drawn.
 */
function film(
  director: CameraDirector,
  from: number,
  ms: number,
  script: (now: number) => void = () => {},
) {
  const poses: Pose[] = [];
  for (let now = from; now <= from + ms; now += FRAME) {
    script(now);
    // As navigation's frame loop moves the Transit on, then the world draws.
    director.advance(now);
    const { pose } = director.frame(now);
    if (pose) poses.push(pose);
  }
  return poses;
}

/** Fails at the first frame the camera jumps. */
function expectNoJump(poses: readonly Pose[]) {
  for (let i = 1; i < poses.length; i++) {
    const moved = poses[i].position.distanceTo(poses[i - 1].position);
    const turned = poses[i].quaternion.angleTo(poses[i - 1].quaternion);
    expect({ frame: i, moved: moved <= MOST.distance }).toEqual({
      frame: i,
      moved: true,
    });
    expect({ frame: i, turned: turned <= MOST.angle }).toEqual({
      frame: i,
      turned: true,
    });
  }
}

function expectSamePose(a: Pose, b: Pose) {
  expect(a.position.distanceTo(b.position)).toBeLessThan(1e-6);
  expect(a.quaternion.angleTo(b.quaternion)).toBeLessThan(1e-6);
}

/** Flies `to` from `now` until the director lands, the page arriving after `arrives` ms. */
function flyTo(
  director: CameraDirector,
  to: Place,
  now: number,
  arrives = 300,
  script: (now: number) => void = () => {},
) {
  expect(director.fly(to, now)).toBe(true);
  const poses: Pose[] = [];
  let t = now;
  for (; director.flying() && t < now + 10_000; t += FRAME) {
    if (t >= now + arrives) director.show(to);
    script(t);
    director.advance(t);
    const { pose } = director.frame(t);
    if (pose) poses.push(pose);
  }
  return { poses, landedAt: t };
}

describe("the Camera director", () => {
  it("draws nothing until it knows the place and its paths", () => {
    const director = createCameraDirector({ homeStop: () => 0 });
    const nothing = { pose: null, lights: null, lean: { x: 0, y: 0 } };
    expect(director.frame(0)).toEqual(nothing);
    director.show("hero");
    expect(director.frame(16)).toEqual(nothing);
  });

  it("flies the Opening and lands it on the settled view, the first Lit site at full light", () => {
    const { director, opening, route } = setup();
    director.show("hero");
    director.openingStarts();
    const timeline = openingTimeline(director);
    timeline.at(3);
    expectSamePose(director.frame(0).pose!, opening.poseAt(timeline.rig));

    timeline.at(timeline.duration);
    const { pose, lights } = director.frame(16);
    expectSamePose(pose!, route.poseAt(0));
    expect(lights).toEqual({
      beams: 1,
      sweep: 0,
      sites: [1, 0.35, 0.35, 0.35],
      court: 0,
    });
  });

  it("lights each site as the scroll route says, and darkens them once it stops", () => {
    const { director, route } = setup();
    director.show("hero");
    director.openingLands();
    director.scrolled(1.5, [1, 0.5, 0, 0]);
    const { pose, lights } = director.frame(0);
    expectSamePose(pose!, route.poseAt(1.5));
    expect(lights!.sites[0]).toBeCloseTo(1.9);
    expect(lights!.sites[1]).toBeCloseTo(0.35 + 0.45);

    director.scrollStopped();
    expectSamePose(director.frame(16).pose!, route.poseAt(0));
    expect(director.frame(32).lights!.sites).toEqual([1, 0.35, 0.35, 0.35]);
  });

  it("holds the Outpost's pose at the Outpost, the sites dark, with no court look", () => {
    const { director } = setup();
    director.show("outpost");
    const { pose, lights } = director.frame(0);
    expectSamePose(pose!, outpostPose(aspect));
    expect(lights).toEqual({ beams: 0, sweep: 0, sites: [0, 0, 0, 0], court: 0 });
  });

  it("holds the court's pose at the court, its look full, the sites dark", () => {
    const { director } = setup();
    director.show("court");
    const { pose, lights, lean } = director.frame(0);
    expectSamePose(pose!, courtPose(aspect));
    expect(lights).toEqual({
      beams: 0,
      sweep: 0,
      sites: [0, 0, 0, 0],
      court: 1,
    });
    expect(lean).toEqual({ x: 0, y: 0 });
  });

  describe("never jumps at a handoff", () => {
    it("from the Opening to the scroll route", () => {
      const { director } = setup();
      director.show("hero");
      director.openingStarts();
      const timeline = openingTimeline(director);
      const end = timeline.duration * 1000;
      const poses = film(director, 0, end + 2000, (now) => {
        if (now <= end + FRAME) timeline.at(Math.min(now, end) / 1000);
        // The visitor scrolls a stop and a half in the two seconds after.
        else director.scrolled(((now - end) / 2000) * 1.5, [1, 0, 0, 0]);
      });
      expectNoJump(poses);
    });

    it("from the scroll route to a Transit down to the Outpost", () => {
      const { director, paths } = setup();
      director.show("hero");
      director.openingLands();
      director.scrolled(1.5, [1, 1, 0, 0]);
      const before = film(director, 0, 200);
      const { poses } = flyTo(director, "outpost", 216);
      const after = film(director, 216 + poses.length * FRAME, 200);
      expectNoJump([...before, ...poses, ...after]);
      expectSamePose(after.at(-1)!, paths.outpost);
    });

    it("from the scroll route to a Transit down to the court, landing on its pose", () => {
      const { director, paths } = setup();
      director.show("hero");
      director.openingLands();
      director.scrolled(1.5, [1, 1, 0, 0]);
      const before = film(director, 0, 200);
      const { poses } = flyTo(director, "court", 216);
      const after = film(director, 216 + poses.length * FRAME, 200);
      expectNoJump([...before, ...poses, ...after]);
      expectSamePose(after.at(-1)!, paths.court);
    });

    it("from the Opening to a Transit, leaving from the camera's live pose", () => {
      const { director, opening } = setup();
      director.show("hero");
      director.openingStarts();
      const timeline = openingTimeline(director);
      const before = film(director, 0, 3000, (now) => timeline.at(now / 1000));
      const live = opening.poseAt(timeline.rig);
      const { poses } = flyTo(director, "outpost", 3016);
      expectSamePose(poses[0], live);
      expect(poses[0].position.distanceTo(settled.position)).toBeGreaterThan(50);
      expectNoJump([...before, ...poses]);
    });

    it("from a Transit home to the scroll route, though the scroll route starts late", () => {
      const { director, route, page } = setup();
      director.show("outpost");
      const before = film(director, 0, 100);
      page.stop = 2.3;
      // Home arrives, rejoining the live world: the Opening never replays.
      const arrive = () => director.openingLands();
      const { poses, landedAt } = flyTo(director, "hero", 116, 300, arrive);
      // Its scroll route's chunk is slow: the camera holds where it landed.
      const waiting = film(director, landedAt, 500);
      expectSamePose(waiting.at(-1)!, route.poseAt(2.3));
      // The scroll route starts from the director's stop, and eases to the page's.
      const seed = director.stop();
      expect(seed).toBeCloseTo(2.3);
      const following = film(director, landedAt + 516, 300, (now) => {
        const f = (now - landedAt - 516) / 300;
        director.scrolled(seed + (2.4 - seed) * f, [1, 1, 1, 0]);
      });
      expectNoJump([...before, ...poses, ...waiting, ...following]);
    });

    it("from a Transit home to a scroll route already reporting, chasing a scroll that moved", () => {
      const { director, page, route } = setup();
      director.show("outpost");
      page.stop = 1;
      let scroll = 1;
      const { poses } = flyTo(director, "hero", 0, 300, (now) => {
        if (now < 300) return;
        director.openingLands();
        // The visitor scrolls on while the camera flies home.
        scroll = Math.min(2, 1 + (now - 300) / 1500);
        page.stop = scroll;
        director.scrolled(scroll, [1, 1, 0, 0]);
      });
      const after = film(director, poses.length * FRAME, 300, () =>
        director.scrolled(scroll, [1, 1, 0, 0]),
      );
      expectNoJump([...poses, ...after]);
      expectSamePose(after.at(-1)!, route.poseAt(2));
    });

    it("when Back turns a Transit round mid-flight", () => {
      const { director } = setup();
      director.show("hero");
      director.openingLands();
      expect(director.fly("outpost", 0)).toBe(true);
      const out = film(director, 0, 500);
      const turning = director.frame(500).pose!;
      // The Resume page never arrived; home is still the page on screen.
      const { poses } = flyTo(director, "hero", 500, 0);
      expectSamePose(poses[0], turning);
      expectNoJump([...out, ...poses]);
      expect(director.flying()).toBeNull();
    });
  });

  describe("the court's look", () => {
    /** The court's look in each frame of `ms` filmed from `from`. */
    function filmLook(
      director: CameraDirector,
      from: number,
      ms: number,
      script: (now: number) => void = () => {},
    ) {
      const looks: number[] = [];
      for (let now = from; now <= from + ms; now += FRAME) {
        script(now);
        director.advance(now);
        looks.push(director.frame(now).lights!.court);
      }
      return looks;
    }

    /** Fails if the look jumps between frames, or ever runs the wrong way. */
    function expectBlend(looks: number[], from: number, to: number) {
      expect(looks[0]).toBeCloseTo(from);
      expect(looks.at(-1)).toBe(to);
      for (let i = 1; i < looks.length; i++) {
        const step = looks[i] - looks[i - 1];
        expect(Math.abs(step)).toBeLessThan(0.08);
        expect(step * (to - from)).toBeGreaterThanOrEqual(0);
      }
    }

    it("blends in through a Transit to the court, full as the camera lands", () => {
      const { director } = setup();
      director.show("hero");
      director.openingLands();
      director.fly("court", 0);
      const looks = filmLook(director, 0, 3000, (now) => {
        if (now >= 300) director.show("court");
      });
      expect(director.flying()).toBeNull();
      expectBlend(looks, 0, 1);
      // Partway through the flight, partway in.
      expect(looks[40]).toBeGreaterThan(0.05);
      expect(looks[40]).toBeLessThan(0.95);
    });

    it("blends out through a Transit leaving the court, for home or the Outpost", () => {
      for (const to of ["hero", "outpost"] as const) {
        const { director } = setup();
        director.show("court");
        director.fly(to, 0);
        const looks = filmLook(director, 0, 3000, (now) => {
          if (now < 300) return;
          director.show(to);
          director.openingLands();
        });
        expect(director.flying()).toBeNull();
        expectBlend(looks, 1, 0);
      }
    });

    it("turns round with the camera when Back calls a Transit off mid-flight", () => {
      const { director } = setup();
      director.show("court");
      director.fly("outpost", 0);
      const out = filmLook(director, 0, 600);
      expect(out.at(-1)).toBeLessThan(0.9);
      // The Resume page never arrived: back to the court.
      director.fly("court", 616);
      const back = filmLook(director, 616, 3000);
      expect(director.flying()).toBeNull();
      expect(Math.abs(back[0] - out.at(-1)!)).toBeLessThan(0.08);
      expectBlend(back, back[0], 1);
    });

    it("leaves home's lights out of it", () => {
      const { director } = setup();
      director.show("hero");
      director.openingLands();
      director.fly("outpost", 0);
      const looks = filmLook(director, 0, 3000, (now) => {
        if (now >= 300) director.show("outpost");
      });
      expect(looks.every((look) => look === 0)).toBe(true);
    });
  });

  it("lands on the Outpost once the Resume page is in and the camera is there", () => {
    const { director } = setup();
    director.show("hero");
    director.openingLands();
    director.fly("outpost", 0);
    director.advance(TRANSIT_MAX_SECONDS * 1000 + 100);
    // The page is still on its way: the camera waits at the Outpost for it.
    expect(director.flying()).toBe("outpost");
    director.show("outpost");
    director.advance(TRANSIT_MAX_SECONDS * 1000 + 116);
    expect(director.flying()).toBeNull();
    expectSamePose(director.frame(TRANSIT_MAX_SECONDS * 1000 + 132).pose!, outpostPose(aspect));
  });

  describe("on a visit that never showed home", () => {
    /** A director holding a court or Outpost layout's paths: no Opening, the nominal route. */
    function away() {
      const home = setup();
      const director = createCameraDirector({ homeStop: () => home.page.stop });
      director.layout({ ...home.paths, opening: null, route: nominalRoute(aspect) });
      return { ...home, director };
    }

    it("flies between the court and the Outpost at once, either way, without a jump", () => {
      for (const [from, to] of [
        ["court", "outpost"],
        ["outpost", "court"],
      ] as const) {
        const { director, paths } = away();
        director.show(from);
        const before = film(director, 0, 100);
        const { poses, landedAt } = flyTo(director, to, 116);
        expect(landedAt - 116).toBeLessThan(TRANSIT_MAX_SECONDS * 1000 + 100);
        expectNoJump([...before, ...poses]);
        expectSamePose(director.frame(landedAt).pose!, paths[to]);
      }
    });

    it("flies home only on home's own paths, holding still until they are measured", () => {
      const { director, paths, route } = away();
      director.show("court");
      director.fly("hero", 0);
      // Home is in, but not yet laid out: the camera holds at the court.
      director.show("hero");
      director.openingLands();
      const holding = film(director, 0, 200);
      for (const pose of holding) expectSamePose(pose, courtPose(aspect));
      // Home's layout reports its paths: the camera flies home on them.
      director.layout(paths);
      const { poses } = flyTo(director, "hero", 216, 0);
      expectNoJump([...holding, ...poses]);
      expectSamePose(director.frame(5000).pose!, route.poseAt(0));
    });
  });

  it("lands on the court once the Case study is in and the camera is there, or gives up on it", () => {
    const { director } = setup();
    director.show("hero");
    director.openingLands();
    director.fly("court", 0);
    director.advance(TRANSIT_MAX_SECONDS * 1000 + 100);
    expect(director.flying()).toBe("court");
    director.show("court");
    director.advance(TRANSIT_MAX_SECONDS * 1000 + 116);
    expect(director.flying()).toBeNull();
    expectSamePose(director.frame(TRANSIT_MAX_SECONDS * 1000 + 132).pose!, courtPose(aspect));

    director.show("hero");
    director.fly("court", 10_000);
    director.advance(16_000);
    expect(director.flying()).toBe("court");
    director.advance(16_600);
    expect(director.flying()).toBeNull();
  });

  it("gives up on a page that never arrives, after the arrival limit", () => {
    const { director } = setup();
    director.show("hero");
    director.openingLands();
    director.fly("outpost", 0);
    director.advance(6000);
    expect(director.flying()).toBe("outpost");
    director.advance(6600);
    expect(director.flying()).toBeNull();
  });

  it("flies home to where the page is, though its scroll route is still easing there, and lands without a second leg", () => {
    const { director, page, route } = setup();
    director.show("outpost");
    director.fly("hero", 0);
    // Home arrives, and its scroll route starts before the Transit is
    // planned, and before Back has restored the page's scroll.
    director.show("hero");
    director.openingLands();
    expect(director.stop()).toBe(0);
    director.scrolled(0, [1, 0, 0, 0]);
    page.stop = 1.5;
    // Planned now, to the page's stop, while the route still eases from 0.
    director.advance(16);
    expect(director.stop()).toBeCloseTo(1.5);
    const duration = transit(route, { pose: outpostPose(aspect) }, 1.5).duration;
    const end = 16 + duration * 1000;
    const poses = film(director, 32, end - 32 + 300, (now) =>
      director.scrolled(Math.min(1.5, (now / 300) * 1.5), [1, 1, 0, 0]),
    );
    expectNoJump(poses);
    director.advance(end + FRAME);
    expect(director.flying()).toBeNull();
  });

  it("never plans a Transit from a frame drawn as home claims the world, before Back restores its scroll", () => {
    const { director, page } = setup();
    director.show("outpost");
    director.fly("hero", 0);
    director.show("hero");
    // The world draws as the page commits: the page is still at its top.
    director.frame(8);
    // Navigation's next frame, with the page's scroll restored.
    page.stop = 0.45;
    director.advance(16);
    expect(director.stop()).toBeCloseTo(0.45);
  });

  it("waits at the end of a Transit home until the scroll route catches up, rather than jump", () => {
    const { director, page, route } = setup();
    director.show("hero");
    director.openingLands();
    page.stop = 1.5;
    director.scrolled(0.5, [1, 0, 0, 0]);
    director.show("outpost");
    director.fly("hero", 0);
    director.show("hero");
    director.advance(0);
    // The flight is over, but the scroll route still reports where it was.
    director.advance(TRANSIT_MAX_SECONDS * 1000 + FRAME);
    expect(director.flying()).toBe("hero");
    expectSamePose(director.frame(TRANSIT_MAX_SECONDS * 1000 + 2 * FRAME).pose!, route.poseAt(1.5));
    director.scrolled(1.5, [1, 1, 0, 0]);
    director.advance(TRANSIT_MAX_SECONDS * 1000 + 3 * FRAME);
    expect(director.flying()).toBeNull();
  });

  it("lands at once when told to, home holding the stop it was flying to", () => {
    const { director, route, page } = setup();
    director.show("outpost");
    page.stop = 1.2;
    director.fly("hero", 0);
    director.show("hero");
    director.openingLands();
    director.advance(16);
    director.arrive();
    expect(director.flying()).toBeNull();
    expectSamePose(director.frame(32).pose!, route.poseAt(1.2));
  });

  describe("the lean toward the pointer", () => {
    const upright = { x: 0, y: 0 };

    it("leans home's landed camera toward the pointer, and back upright once it leaves", () => {
      const { director } = setup();
      director.show("hero");
      director.openingLands();
      director.pointerAt({ x: 0.5, y: -0.25 });
      expect(director.frame(0).lean).toEqual({ x: 0.5, y: -0.25 });
      director.pointerAt(null);
      expect(director.frame(16).lean).toEqual(upright);
    });

    it("holds the pointer to the screen's edges", () => {
      const { director } = setup();
      director.show("hero");
      director.openingLands();
      director.pointerAt({ x: 3, y: -2 });
      expect(director.frame(0).lean).toEqual({ x: 1, y: -1 });
    });

    it("stays upright through the Opening", () => {
      const { director } = setup();
      director.show("hero");
      director.pointerAt({ x: 1, y: 1 });
      expect(director.frame(0).lean).toEqual(upright);
    });

    it("stays upright through a Transit, and at the Outpost", () => {
      const { director } = setup();
      director.show("hero");
      director.openingLands();
      director.pointerAt({ x: 1, y: 1 });
      director.fly("outpost", 0);
      expect(director.frame(16).lean).toEqual(upright);
      director.show("outpost");
      director.arrive();
      expect(director.frame(32).lean).toEqual(upright);
    });

    it("stays upright through a Transit to the court, and at the court", () => {
      const { director } = setup();
      director.show("hero");
      director.openingLands();
      director.pointerAt({ x: 1, y: 1 });
      director.fly("court", 0);
      expect(director.frame(16).lean).toEqual(upright);
      director.show("court");
      director.arrive();
      expect(director.frame(32).lean).toEqual(upright);
    });
  });

  it("has nowhere to fly from before any place has been drawn", () => {
    const director = createCameraDirector({ homeStop: () => 0 });
    expect(director.fly("outpost", 0)).toBe(false);
    expect(director.flying()).toBeNull();
  });
});
