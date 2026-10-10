import { Euler, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { layoutLandmarks } from "./landmarks";
import { CAMERA, settledYaw } from "./pose";
import { arenaView, courtPose, derbyView } from "./route";
import { SKY_GLOW_SHAPE, SKY_GLOWS, skyGlowStrength } from "./sky-glow";
import type { Box } from "./skyline";
import { layoutStructures } from "./structures";
import { valleyHeight } from "./terrain";

const hero = new Vector3(0, 21, 0);
const { field } = layoutLandmarks();
const [diamond, arena] = SKY_GLOWS;

describe("the sky glows over the Diamond and the Arena", () => {
  it("shine at full strength from the hero", () => {
    for (const glow of SKY_GLOWS) expect(skyGlowStrength(glow, hero)).toBe(1);
  });

  it("still show from the court", () => {
    for (const aspect of [0.46, 1.6]) {
      for (const glow of SKY_GLOWS) {
        expect(skyGlowStrength(glow, courtPose(aspect).position)).toBeGreaterThan(0);
      }
    }
  });

  it("are gone up close, where the stadiums' own lights take over", () => {
    for (const aspect of [0.46, 1.6]) {
      expect(skyGlowStrength(diamond, derbyView(aspect, field).pose.position)).toBe(0);
      expect(skyGlowStrength(arena, arenaView(aspect).pose.position)).toBe(0);
    }
  });
});

/** The settled hero as the real layouts place it (as in structures.test.ts). */
const layouts = {
  "desktop": { height: 21, yaw: 0, aspect: 1.6 },
  "desktop, low camera": { height: 11.75, yaw: 0, aspect: 1.6 },
  "phone, stacked": { height: 16, yaw: settledYaw(0.46), aspect: 0.46 },
};

const { buildings, skyline } = layoutStructures();
/** Of the ~317 directions sampled round a glow's heart, how many must be open sky for it to be seen. */
const SAMPLES_SEEN = 30;
const towers: readonly Box[] = [...buildings, ...skyline.bounds];

/** True if the valley's ground, or a tower in the city or Toronto's skyline, stands in the ray from `eye` along `dir`. */
function blocked(eye: Vector3, dir: Vector3) {
  for (let t = 5; t < 1500; t += 2) {
    const p = eye.clone().addScaledVector(dir, t);
    if (valleyHeight(p.x, p.z) > p.y) return true;
    if (
      towers.some(
        (b) =>
          Math.abs(p.x - b.x) < b.w / 2 &&
          Math.abs(p.y - b.y) < b.h / 2 &&
          Math.abs(p.z - b.z) < b.d / 2,
      )
    ) {
      return true;
    }
  }
  return false;
}

describe("from the hero, each sky glow", () => {
  for (const [name, { height, yaw, aspect }] of Object.entries(layouts)) {
    it(`clears the ridge and the towers, in frame (${name})`, () => {
      const eye = new Vector3(0, height, 0);
      const camera = new PerspectiveCamera(CAMERA.fovY, aspect, 0.5, 2600);
      camera.position.copy(eye);
      camera.quaternion.setFromEuler(new Euler(-CAMERA.pitch, -yaw, 0, "YXZ"));
      camera.updateMatrixWorld();
      for (const glow of SKY_GLOWS) {
        const heart = glow.at.clone().sub(eye);
        const seen = Math.atan(glow.reach / heart.length()) * SKY_GLOW_SHAPE.seen;
        const azimuth = Math.atan2(heart.x, -heart.z);
        const elevation = Math.asin(heart.y / heart.length());
        // Open sky, in frame, somewhere in the glow's seen reach round its heart.
        let open = 0;
        for (let i = 0; i <= 20; i++) {
          for (let j = 0; j <= 20; j++) {
            const da = ((i - 10) / 10) * seen;
            const de = ((j - 10) / 10) * seen;
            if (Math.hypot(da, de) > seen) continue;
            const e = elevation + de;
            const a = azimuth + da / Math.cos(e);
            const dir = new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
            const { x, y } = eye.clone().addScaledVector(dir, 500).project(camera);
            if (Math.abs(x) < 1 && Math.abs(y) < 1 && !blocked(eye, dir)) open++;
          }
        }
        expect(open, `open sky round the ${glow.color.getHexString()} glow`).toBeGreaterThan(SAMPLES_SEEN);
      }
    });
  }
});
