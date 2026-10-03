import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { CAMERA, settledCameraHeight } from "./pose";
import { valleyHeight } from "./terrain";
import type { WordFit } from "./plate-fit";

function camera(height: number) {
  const cam = new PerspectiveCamera(CAMERA.fovY, 1.6, 0.1, 2000);
  cam.position.set(0, height, 0);
  cam.rotation.x = -CAMERA.pitch;
  cam.updateMatrixWorld();
  return cam;
}

const fit = (x: number, y: number, scale: number): WordFit => ({
  x,
  y,
  scale,
  matched: true,
});

describe("settledCameraHeight", () => {
  const layouts = {
    "one line, lower left": [{ fit: fit(-40, -9, 0.0045), advance: 19000 }],
    "stacked on a phone": [
      { fit: fit(-14, -2, 0.0021), advance: 12276 },
      { fit: fit(-14, -6.3, 0.0021), advance: 6600 },
    ],
  };

  for (const [name, words] of Object.entries(layouts)) {
    it(`stands the plate's lowest baseline on the valley floor (${name})`, () => {
      const height = settledCameraHeight(words);
      const lowest = words[words.length - 1];
      const base = new Vector3(
        lowest.fit.x + (lowest.advance * lowest.fit.scale) / 2,
        lowest.fit.y,
        -CAMERA.plateDepth,
      ).applyMatrix4(camera(height).matrixWorld);

      expect(base.y).toBeCloseTo(valleyHeight(base.x, base.z), 6);
      expect(height).toBeGreaterThan(base.y);
    });
  }
});
