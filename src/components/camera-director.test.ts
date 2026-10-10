import { Euler, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  createCameraDirector,
  type CameraDirector,
  type CameraPaths,
} from "./camera-director";
import { createFlightTimeline } from "./flight-timeline";
import type { PlaceView } from "./world-places";
import { createFlightPath, type Pose } from "./world/flight";
import { nominalRoute } from "./world/nominal-route";
import { CAMERA } from "./world/pose";
import {
  ENCORE_FILL_SECONDS,
  ENCORE_SECONDS,
  FLIGHT_START_RIG,
  TRANSIT_MAX_SECONDS,
} from "./world/rigs";
import { layoutLandmarks } from "./world/landmarks";
import {
  arenaView,
  arenaWayIn,
  courtPose,
  createRoute,
  hongKongPose,
  playView,
  ROUTE_STOPS,
  skylinePose,
} from "./world/route";
import { COURT_STOP, transit, transitWithin } from "./world/transit";

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
/** /play's view of the court, and its field of view. */
const play = playView(aspect, layoutLandmarks().court);

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
    skyline: skylinePose(aspect),
    fovY: {
      world: CAMERA.fovY,
      skyline: CAMERA.fovY,
      play: play.fovY,
      encore: arenaView(aspect).fovY,
    },
    court: courtPose(aspect),
    play: play.pose,
    courtStop: COURT_STOP,
    transit,
    within: transitWithin,
    encore: (from) => arenaWayIn(aspect, from),
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
  to: PlaceView,
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
    const nothing = { pose: null, lights: null, lean: { x: 0, y: 0 }, fovY: null };
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
      skyline: 0,
      encore: 0,
      fill: 0,
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

  it("knows while a Transit waits for its page: until that page shows, and never once landed", () => {
    const { director } = setup();
    director.show("hero");
    director.openingLands();
    expect(director.awaitingPage()).toBe(false);
    expect(director.fly("court", 0)).toBe(true);
    // The router hasn't committed the Case study yet: home still shows.
    expect(director.awaitingPage()).toBe(true);
    director.show(null);
    expect(director.awaitingPage()).toBe(true);
    director.show("court");
    expect(director.awaitingPage()).toBe(false);
    director.arrive();
    expect(director.awaitingPage()).toBe(false);
  });

  it("holds the Skyline's pose at the Skyline, its look full, the sites dark, with no court look", () => {
    const { director } = setup();
    director.show("skyline");
    const { pose, lights } = director.frame(0);
    expectSamePose(pose!, skylinePose(aspect));
    expect(lights).toEqual({
      beams: 0,
      sweep: 0,
      sites: [0, 0, 0, 0],
      court: 0,
      skyline: 1,
      encore: 0,
      fill: 0,
    });
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
      skyline: 0,
      encore: 0,
      fill: 0,
    });
    expect(lean).toEqual({ x: 0, y: 0 });
  });

  it("holds /play's pose at /play, the court's look full, in the game's field of view", () => {
    const { director } = setup();
    director.show("play");
    const { pose, lights, lean, fovY } = director.frame(0);
    expectSamePose(pose!, play.pose);
    expect(lights).toEqual({
      beams: 0,
      sweep: 0,
      sites: [0, 0, 0, 0],
      court: 1,
      skyline: 0,
      encore: 0,
      fill: 0,
    });
    expect(lean).toEqual({ x: 0, y: 0 });
    expect(fovY).toBe(play.fovY);
  });

  describe("/play's view of the court", () => {
    it("flies there from home along the route, landing on its pose, widening to the game's field of view, without a jump", () => {
      const { director } = setup();
      director.show("hero");
      director.openingLands();
      const before = film(director, 0, 200);
      const fovs: number[] = [];
      const { poses, landedAt } = flyTo(director, "play", 216, 300, (now) =>
        fovs.push(director.frame(now).fovY!),
      );
      expect(landedAt - 216).toBeLessThan(TRANSIT_MAX_SECONDS * 1000 + 100);
      const after = film(director, landedAt, 200);
      expectNoJump([...before, ...poses, ...after]);
      expectSamePose(after.at(-1)!, play.pose);
      expect(fovs[0]).toBeCloseTo(CAMERA.fovY);
      expect(director.frame(landedAt).fovY).toBe(play.fovY);
      for (let i = 1; i < fovs.length; i++) {
        expect(Math.abs(fovs[i] - fovs[i - 1])).toBeLessThan(1.5);
      }
    });

    it("flies home from it along the route, the court's look blending out", () => {
      const { director, route } = setup();
      director.show("play");
      const before = film(director, 0, 100);
      const looks: number[] = [];
      const { poses, landedAt } = flyTo(director, "hero", 116, 300, (now) => {
        if (now >= 416) director.openingLands();
        looks.push(director.frame(now).lights!.court);
      });
      expectNoJump([...before, ...poses]);
      expectSamePose(director.frame(landedAt).pose!, route.poseAt(0));
      expect(looks[0]).toBeCloseTo(1);
      expect(director.frame(landedAt).lights!.court).toBe(0);
    });

    it("moves between the court's two views straight round the court, either way, its look full throughout, without a jump", () => {
      for (const [from, to] of [
        ["court", "play"],
        ["play", "court"],
      ] as const) {
        const { director, paths } = setup();
        director.show(from);
        const before = film(director, 0, 100);
        const looks: number[] = [];
        const { poses, landedAt } = flyTo(director, to, 116, 300, (now) =>
          looks.push(director.frame(now).lights!.court),
        );
        expectNoJump([...before, ...poses]);
        expectSamePose(director.frame(landedAt).pose!, paths[to]);
        for (const look of looks) expect(look).toBe(1);
        // Straight from one view to the other: never by the route.
        const trip = transitWithin(paths[from], paths[to]);
        expect(landedAt - 116).toBeGreaterThanOrEqual(trip.duration * 1000);
        expect(landedAt - 116).toBeLessThan(trip.duration * 1000 + 100);
        for (const pose of poses) {
          const onLine = pose.position
            .clone()
            .sub(paths[from].position)
            .cross(paths[to].position.clone().sub(paths[from].position))
            .length();
          expect(onLine).toBeLessThan(1e-3 * paths[from].position.distanceTo(paths[to].position) ** 2 + 1e-6);
        }
      }
    });

    it("blends the field of view between the court's two views, never jumping", () => {
      const { director } = setup();
      director.show("court");
      const fovs: number[] = [];
      const { landedAt } = flyTo(director, "play", 0, 300, (now) =>
        fovs.push(director.frame(now).fovY!),
      );
      expect(fovs[0]).toBeCloseTo(CAMERA.fovY);
      expect(director.frame(landedAt).fovY).toBe(play.fovY);
      for (let i = 1; i < fovs.length; i++) {
        expect(Math.abs(fovs[i] - fovs[i - 1])).toBeLessThan(1.5);
      }
    });

    it("turns round mid-move, back to courtside, from exactly where the camera is", () => {
      const { director, paths } = setup();
      director.show("court");
      expect(director.fly("play", 0)).toBe(true);
      const out = film(director, 0, 400, (now) => {
        if (now >= 200) director.show("play");
      });
      const turning = director.frame(400).pose!;
      const { poses, landedAt } = flyTo(director, "court", 400, 100);
      expectSamePose(poses[0], turning);
      expectNoJump([...out, ...poses]);
      expectSamePose(director.frame(landedAt).pose!, paths.court);
    });

    it("flies on to /play by the route when the camera is still on its way down to the court", () => {
      const { director, paths } = setup();
      director.show("hero");
      director.openingLands();
      director.fly("court", 0);
      const out = film(director, 0, 600, (now) => {
        if (now >= 300) director.show("court");
      });
      const { poses, landedAt } = flyTo(director, "play", 616, 100);
      expectNoJump([...out, ...poses]);
      expectSamePose(director.frame(landedAt).pose!, paths.play);
    });
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

    it("from the scroll route to a Transit down to the Skyline", () => {
      const { director, paths } = setup();
      director.show("hero");
      director.openingLands();
      director.scrolled(1.5, [1, 1, 0, 0]);
      const before = film(director, 0, 200);
      const { poses } = flyTo(director, "skyline", 216);
      const after = film(director, 216 + poses.length * FRAME, 200);
      expectNoJump([...before, ...poses, ...after]);
      expectSamePose(after.at(-1)!, paths.skyline);
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
      const { poses } = flyTo(director, "skyline", 3016);
      expectSamePose(poses[0], live);
      expect(poses[0].position.distanceTo(settled.position)).toBeGreaterThan(50);
      expectNoJump([...before, ...poses]);
    });

    it("from a Transit home to the scroll route, though the scroll route starts late", () => {
      const { director, route, page } = setup();
      director.show("skyline");
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
      director.show("skyline");
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
      expect(director.fly("skyline", 0)).toBe(true);
      const out = film(director, 0, 500);
      const turning = director.frame(500).pose!;
      // The Resume page never arrived; home is still the page on screen.
      const { poses } = flyTo(director, "hero", 500, 0);
      expectSamePose(poses[0], turning);
      expectNoJump([...out, ...poses]);
      expect(director.flying()).toBeNull();
    });
  });

  describe("a Recall", () => {
    it("from the court, /play or the Skyline flies home to the settled view, home arriving at its top, without a jump", () => {
      for (const from of ["court", "play", "skyline"] as const) {
        const { director, route } = setup();
        director.show(from);
        const before = film(director, 0, 100);
        // Home arrives at its top, rejoining the live world settled.
        const { poses, landedAt } = flyTo(director, "hero", 116, 300, (now) => {
          if (now >= 416) director.openingLands();
        });
        const after = film(director, landedAt, 200);
        expectNoJump([...before, ...poses, ...after]);
        expectSamePose(after.at(-1)!, route.poseAt(0));
      }
    });

    it("on home scrolls the camera back along the route to the settled view, without a jump", () => {
      const { director, route } = setup();
      director.show("hero");
      director.openingLands();
      const far = 4;
      director.scrolled(far, [1, 1, 1, 1]);
      const before = film(director, 0, 100);
      // The page scrolls smoothly back to its top, the scroll route easing after it.
      const back = film(director, 116, 1500, (now) => {
        const f = Math.min(1, (now - 116) / 1200);
        director.scrolled(far * (1 - f) ** 2, [1, 1, 1, 1].map((l) => l * (1 - f)));
      });
      expectNoJump([...before, ...back]);
      expectSamePose(back.at(-1)!, route.poseAt(0));
    });
  });

  /** A Place's look in each frame of `ms` filmed from `from`. */
  function filmLook(
    director: CameraDirector,
    from: number,
    ms: number,
    script: (now: number) => void = () => {},
    place: "court" | "skyline" = "court",
  ) {
    const looks: number[] = [];
    for (let now = from; now <= from + ms; now += FRAME) {
      script(now);
      director.advance(now);
      looks.push(director.frame(now).lights![place]);
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

  describe("the field of view", () => {
    /** A director whose Skyline zooms out, as on a phone. */
    function zoomed() {
      const setup_ = setup();
      setup_.director.layout({
        ...setup_.paths,
        fovY: { ...setup_.paths.fovY, skyline: 55 },
      });
      return setup_;
    }

    it("is the world's own at home and the court, and the Skyline's there", () => {
      const { director } = zoomed();
      director.show("hero");
      director.openingLands();
      expect(director.frame(0).fovY).toBe(CAMERA.fovY);
      director.show("court");
      expect(director.frame(0).fovY).toBe(CAMERA.fovY);
      director.show("skyline");
      expect(director.frame(0).fovY).toBe(55);
    });

    it("widens through a Transit to the Skyline and narrows through one leaving it, never jumping", () => {
      for (const [from, to, start, end] of [
        ["hero", "skyline", CAMERA.fovY, 55],
        ["skyline", "court", 55, CAMERA.fovY],
      ] as const) {
        const { director } = zoomed();
        director.show(from);
        director.openingLands();
        director.fly(to, 0);
        const fovs: number[] = [];
        for (let now = 0; now <= 3000; now += FRAME) {
          if (now >= 300) director.show(to);
          director.advance(now);
          fovs.push(director.frame(now).fovY!);
        }
        expect(director.flying()).toBeNull();
        expect(fovs[0]).toBeCloseTo(start);
        expect(fovs.at(-1)).toBe(end);
        for (let i = 1; i < fovs.length; i++) {
          expect(Math.abs(fovs[i] - fovs[i - 1])).toBeLessThan(1.5);
        }
      }
    });

    it("leaves the camera's field of view as it is before the paths are in", () => {
      const director = createCameraDirector({ homeStop: () => 0 });
      director.show("skyline");
      expect(director.frame(0).fovY).toBeNull();
    });
  });

  describe("the Skyline's look", () => {
    it("blends in through a Transit to the Skyline, full as the camera lands", () => {
      const { director } = setup();
      director.show("hero");
      director.openingLands();
      director.fly("skyline", 0);
      const looks = filmLook(
        director,
        0,
        3000,
        (now) => {
          if (now >= 300) director.show("skyline");
        },
        "skyline",
      );
      expect(director.flying()).toBeNull();
      expectBlend(looks, 0, 1);
      expect(looks[40]).toBeGreaterThan(0.05);
      expect(looks[40]).toBeLessThan(0.95);
    });

    it("blends out through a Transit leaving the Skyline, for home or the court", () => {
      for (const to of ["hero", "court"] as const) {
        const { director } = setup();
        director.show("skyline");
        director.fly(to, 0);
        const looks = filmLook(
          director,
          0,
          3000,
          (now) => {
            if (now < 300) return;
            director.show(to);
            director.openingLands();
          },
          "skyline",
        );
        expect(director.flying()).toBeNull();
        expectBlend(looks, 1, 0);
      }
    });

    it("hands over to the court's look between the two Places, one in as the other goes out", () => {
      const { director } = setup();
      director.show("skyline");
      director.fly("court", 0);
      const frames: { court: number; skyline: number }[] = [];
      for (let now = 0; now <= 3000; now += FRAME) {
        if (now >= 300) director.show("court");
        director.advance(now);
        const { court, skyline } = director.frame(now).lights!;
        frames.push({ court, skyline });
      }
      expect(frames[0]).toEqual({ court: 0, skyline: 1 });
      expect(frames.at(-1)).toEqual({ court: 1, skyline: 0 });
      for (const { court, skyline } of frames) {
        expect(court + skyline).toBeCloseTo(1);
      }
    });
  });

  describe("the court's look", () => {
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

    it("blends out through a Transit leaving the court, for home or the Skyline", () => {
      for (const to of ["hero", "skyline"] as const) {
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
      director.fly("skyline", 0);
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
      director.fly("skyline", 0);
      const looks = filmLook(director, 0, 3000, (now) => {
        if (now >= 300) director.show("skyline");
      });
      expect(looks.every((look) => look === 0)).toBe(true);
    });
  });

  it("lands on the Skyline once the Resume page is in and the camera is there", () => {
    const { director } = setup();
    director.show("hero");
    director.openingLands();
    director.fly("skyline", 0);
    director.advance(TRANSIT_MAX_SECONDS * 1000 + 100);
    // The page is still on its way: the camera waits at the Skyline for it.
    expect(director.flying()).toBe("skyline");
    director.show("skyline");
    director.advance(TRANSIT_MAX_SECONDS * 1000 + 116);
    expect(director.flying()).toBeNull();
    expectSamePose(director.frame(TRANSIT_MAX_SECONDS * 1000 + 132).pose!, skylinePose(aspect));
  });

  describe("on a visit that never showed home", () => {
    /** A director holding a court or Skyline layout's paths: no Opening, the nominal route. */
    function away() {
      const home = setup();
      const director = createCameraDirector({ homeStop: () => home.page.stop });
      director.layout({ ...home.paths, opening: null, route: nominalRoute(aspect) });
      return { ...home, director };
    }

    it("flies between the court and the Skyline at once, either way, without a jump", () => {
      for (const [from, to] of [
        ["court", "skyline"],
        ["skyline", "court"],
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
    director.fly("skyline", 0);
    director.advance(6000);
    expect(director.flying()).toBe("skyline");
    director.advance(6600);
    expect(director.flying()).toBeNull();
  });

  it("flies home to where the page is, though its scroll route is still easing there, and lands without a second leg", () => {
    const { director, page, route } = setup();
    director.show("skyline");
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
    const duration = transit(route, { pose: skylinePose(aspect) }, 1.5).duration;
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
    director.show("skyline");
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
    director.show("skyline");
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
    director.show("skyline");
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

    it("stays upright through a Transit, and at the Skyline", () => {
      const { director } = setup();
      director.show("hero");
      director.openingLands();
      director.pointerAt({ x: 1, y: 1 });
      director.fly("skyline", 0);
      expect(director.frame(16).lean).toEqual(upright);
      director.show("skyline");
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

  describe("the Encore", () => {
    const LAST = ROUTE_STOPS - 1;
    const SECONDS = ENCORE_SECONDS * 1000;
    const inside = arenaView(aspect);

    /** Home landed, its scroll route at the route's end, Hong Kong's view. */
    function atTheEnd() {
      const setup_ = setup();
      setup_.director.show("hero");
      setup_.director.openingLands();
      setup_.director.scrolled(LAST, [1, 1, 1, 1]);
      return setup_;
    }

    it("takes the camera from the route's end into the Arena, landing on its inside view in its field of view, without a jump", () => {
      const { director, paths } = atTheEnd();
      // Widening, as on a phone.
      director.layout({ ...paths, fovY: { ...paths.fovY, encore: 60 } });
      expectSamePose(director.frame(0).pose!, hongKongPose(aspect));
      director.encore(true, 0);
      const poses = film(director, 0, SECONDS + 200);
      expectNoJump(poses);
      expectSamePose(poses.at(-1)!, inside.pose);
      expect(director.frame(SECONDS + 200).fovY).toBeCloseTo(60);
      expect(director.frame(SECONDS / 2).fovY).toBeCloseTo((CAMERA.fovY + 60) / 2);
    });

    it("switches the show on as the camera comes in, fills the floor once it lands, and fills it again for one more song", () => {
      const { director } = atTheEnd();
      expect(director.frame(0).lights).toMatchObject({ encore: 0, fill: 0 });
      director.encore(true, 0);
      const half = director.frame(SECONDS / 2).lights!;
      expect(half.encore).toBeGreaterThan(0);
      expect(half.encore).toBeLessThan(1);
      expect(half.fill).toBe(0);
      expect(director.frame(SECONDS).lights).toMatchObject({ encore: 1, fill: 0 });
      const filling = director.frame(SECONDS + ENCORE_FILL_SECONDS * 500).lights!.fill;
      expect(filling).toBeGreaterThan(0);
      expect(filling).toBeLessThan(1);
      const full = SECONDS + ENCORE_FILL_SECONDS * 1000;
      expect(director.frame(full).lights!.fill).toBe(1);

      director.replayEncore(full + 1000);
      expect(director.frame(full + 1000).lights!.fill).toBe(0);
      expect(director.frame(full + 1000 + ENCORE_FILL_SECONDS * 1000).lights!.fill).toBe(1);
    });

    it("plays the camera back out to the route's end from wherever it got to, the show going off, even as the scroll moves on", () => {
      const { director, route } = atTheEnd();
      director.encore(true, 0);
      film(director, 0, SECONDS * 0.6);
      director.encore(false, SECONDS * 0.6);
      const back = SECONDS * 0.6;
      const poses = film(director, SECONDS * 0.6, back + 200, (now) => {
        // The visitor scrolls on up meanwhile.
        const t = Math.min(1, (now - SECONDS * 0.6) / back);
        director.scrolled(LAST - 0.5 * t, [1, 1, 1, 1]);
      });
      expectNoJump(poses);
      expectSamePose(poses.at(-1)!, route.poseAt(LAST - 0.5));
      const after = director.frame(SECONDS * 1.2 + 200);
      expect(after.lights).toMatchObject({ encore: 0 });
      expect(after.fovY).toBe(CAMERA.fovY);
    });

    it("stays out of the Opening, and of a page whose scroll route isn't running (under reduced motion, say)", () => {
      const { director, route } = setup();
      director.show("hero");
      director.encore(true, 0);
      director.openingLands();
      expectSamePose(director.frame(SECONDS * 2).pose!, route.poseAt(0));
      expect(director.frame(SECONDS * 2).lights).toMatchObject({ encore: 0, fill: 0 });
    });

    it("is over once the scroll route stops: home comes back at the route, not in the Arena", () => {
      const { director, route } = atTheEnd();
      director.encore(true, 0);
      director.scrollStopped();
      director.scrolled(LAST, [1, 1, 1, 1]);
      expectSamePose(director.frame(SECONDS * 2).pose!, route.poseAt(LAST));
    });
  });

  it("has nowhere to fly from before any place has been drawn", () => {
    const director = createCameraDirector({ homeStop: () => 0 });
    expect(director.fly("skyline", 0)).toBe(false);
    expect(director.flying()).toBeNull();
  });
});
