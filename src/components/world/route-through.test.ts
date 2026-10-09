import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { Pose } from "./flight";
import { routeThrough } from "./route";

/** Three stops down the valley, each turned its own way. */
const stops: Pose[] = [
  { position: new Vector3(0, 30, -300), quaternion: new Quaternion() },
  {
    position: new Vector3(10, 25, -600),
    quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.4),
  },
  {
    position: new Vector3(-5, 20, -900),
    quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -0.3),
  },
];

describe("a scroll route through any stop poses", () => {
  const route = routeThrough(stops);

  it("stands exactly at each stop pose at its stop", () => {
    stops.forEach((stop, i) => {
      const pose = route.poseAt(i);
      expect(pose.position.distanceTo(stop.position)).toBeLessThan(1e-9);
      expect(pose.quaternion.angleTo(stop.quaternion)).toBeLessThan(1e-6);
    });
  });

  it("holds at its first and last stops beyond either end", () => {
    expect(
      route.poseAt(-1).position.distanceTo(stops[0].position),
    ).toBeLessThan(1e-6);
    expect(route.poseAt(9).position.distanceTo(stops[2].position)).toBeLessThan(
      1e-6,
    );
  });

  it("flies down the valley between stops", () => {
    const halfway = route.poseAt(1.5).position;
    expect(halfway.z).toBeLessThan(-600);
    expect(halfway.z).toBeGreaterThan(-900);
  });
});
