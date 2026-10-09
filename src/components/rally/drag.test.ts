import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { layoutLandmarks } from "../world/landmarks";
import { playView } from "../world/route";
import { dragOnCourt } from "./drag";
import type { Vec } from "./rules";

const { court } = layoutLandmarks();

/** The world's camera as it stands for /play on a screen of this shape. */
function cameraFor(aspect: number) {
  const { pose, fovY } = playView(aspect, court);
  const camera = new PerspectiveCamera(fovY, aspect, 0.5, 2600);
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  camera.updateMatrixWorld();
  return camera;
}

/** Where a point on the court's floor, in feet, lands on screen. */
function onScreen(camera: PerspectiveCamera, at: Vec) {
  const p = new Vector3(
    court.x + at.x * court.scale,
    court.level,
    court.z + at.z * court.scale,
  ).project(camera);
  return { x: p.x, y: p.y };
}

const shapes = { phone: 0.46, desktop: 1.6 };

for (const [name, aspect] of Object.entries(shapes)) {
  describe(`a drag on the court, ${name}`, () => {
    const camera = cameraFor(aspect);

    it("moves the player's image on screen exactly as the finger moved, wherever they stand", () => {
      for (const from of [
        { x: 0, z: 24 },
        { x: -6, z: 14 },
        { x: 9, z: 8 },
      ]) {
        for (const by of [
          { x: 0.05, y: 0 },
          { x: 0, y: 0.04 },
          { x: -0.03, y: -0.05 },
        ]) {
          const moved = dragOnCourt(camera, court, from, by)!;
          const before = onScreen(camera, from);
          const after = onScreen(camera, {
            x: from.x + moved.x,
            z: from.z + moved.z,
          });
          expect(after.x - before.x).toBeCloseTo(by.x, 6);
          expect(after.y - before.y).toBeCloseTo(by.y, 6);
        }
      }
    });

    it("covers more court for the same movement near the kitchen than at the baseline, as the court shrinks away from the camera", () => {
      for (const by of [
        { x: 0.05, y: 0 },
        { x: 0, y: 0.05 },
      ]) {
        const near = dragOnCourt(camera, court, { x: 0, z: 22 }, by)!;
        const kitchen = dragOnCourt(camera, court, { x: 0, z: 8 }, by)!;
        expect(Math.hypot(kitchen.x, kitchen.z)).toBeGreaterThan(
          Math.hypot(near.x, near.z) * 1.2,
        );
      }
    });

    it("moves the player toward the net as the finger moves up the screen, and right as it moves right", () => {
      const up = dragOnCourt(camera, court, { x: 0, z: 18 }, { x: 0, y: 0.05 })!;
      expect(up.z).toBeLessThan(0);
      expect(Math.abs(up.x)).toBeLessThan(1e-6);
      const right = dragOnCourt(camera, court, { x: 0, z: 18 }, { x: 0.05, y: 0 })!;
      expect(right.x).toBeGreaterThan(0);
    });

    it("goes nowhere past the horizon", () => {
      expect(dragOnCourt(camera, court, { x: 0, z: 18 }, { x: 0, y: 3 })).toBeNull();
    });
  });
}
