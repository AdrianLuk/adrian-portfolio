import { Euler, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createCameraDirector, type CameraPaths } from "./camera-director";
import { layoutLandmarks } from "./world/landmarks";
import { createFlightPath, type Pose } from "./world/flight";
import { CAMERA } from "./world/pose";
import { courtPose, createRoute, playView, skylinePose } from "./world/route";
import { COURT_STOP, transit, transitWithin } from "./world/transit";

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
const play = playView(aspect, layoutLandmarks().court);

describe("the Camera director told which scroll route runs", () => {
  it("flies home's route when told home's scroll route is running", () => {
    const route = createRoute(settled, plateCentre, aspect);
    const paths: CameraPaths = {
      opening: createFlightPath(settled, plateCentre),
      route,
      skyline: skylinePose(aspect),
      fovY: { world: CAMERA.fovY, skyline: CAMERA.fovY, play: play.fovY },
      court: courtPose(aspect),
      play: play.pose,
      courtStop: COURT_STOP,
      transit,
      within: transitWithin,
    };
    const director = createCameraDirector({ homeStop: () => 0 });
    director.layout(paths);
    director.show("hero");
    director.openingLands();

    director.scrolled(2.5, [1, 1, 0, 0], "home");

    const pose = director.frame(0).pose!;
    const expected = route.poseAt(2.5);
    expect(pose.position.distanceTo(expected.position)).toBeLessThan(1e-9);
    expect(director.stop()).toBe(2.5);
  });
});
