import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { keepClear, landsIn, onScreen, SCREENS, settledView } from "./clearance";
import { palette } from "./palette";
import { layoutHongKong } from "./hong-kong";
import { layoutLandmarks } from "./landmarks";
import { DIAMOND_MIDDLE, DIAMOND_STOP, ROUTE_STOPS } from "./route";

describe("the settled view's keep-clear areas", () => {
  for (const [shape, screen] of Object.entries(SCREENS)) {
    it(`puts the name plate where the DOM headline is (${shape})`, () => {
      const { plate } = settledView(shape as keyof typeof SCREENS);
      // The headline's words, as the page measured them, in NDC (y up).
      const { width, height, words } = screen;
      const left = Math.min(...words.map((w) => w.rect.left));
      const right = Math.max(...words.map((w) => w.rect.left + w.rect.width));
      const top = Math.min(...words.map((w) => w.rect.top));
      const bottom = Math.max(...words.map((w) => w.rect.top + w.rect.height));
      // Within a pixel: the plate scales by the words' widths, the DOM's
      // line boxes are whole pixels tall.
      const px = { x: 2 / width, y: 2 / height };
      expect(Math.abs(plate.x0 - ((left / width) * 2 - 1))).toBeLessThan(px.x);
      expect(Math.abs(plate.x1 - ((right / width) * 2 - 1))).toBeLessThan(px.x);
      expect(Math.abs(plate.y0 - (1 - (bottom / height) * 2))).toBeLessThan(px.y);
      expect(Math.abs(plate.y1 - (1 - (top / height) * 2))).toBeLessThan(px.y);
    });
  }
});

describe("what a box covers on the screen", () => {
  it("reaches the screen's edge where the box runs back past the camera", () => {
    // A rail from 50 ahead to 50 behind, 2 under a camera looking down -z:
    // near the camera it runs off the bottom of the screen.
    const pose = { position: new Vector3(), quaternion: new Quaternion() };
    const rail = { x: 0, y: -2, z: 0, w: 0.2, h: 0.2, d: 100, color: palette.ink };
    const rect = onScreen(pose, 1, rail)!;
    expect(rect.y0).toBeLessThan(-1);
    expect(rect.y1).toBeLessThan(0);
    expect(rect.x0).toBeCloseTo(-rect.x1);
  });
});

describe("each Landmark's keep-clear area at its stop", () => {
  const landmarks = layoutLandmarks();
  const bank = layoutHongKong().landmarks.find((l) => l.name === "Bank of China Tower")!;

  for (const shape of Object.keys(SCREENS) as (keyof typeof SCREENS)[]) {
    it(`catches a point on the Landmark it frames, and not one behind the camera (${shape})`, () => {
      const areas = keepClear(shape);
      const at = (stop: number) => areas.filter((a) => a.stop === stop);

      // Control D's shield gate, mid-box, at the first site's stop.
      const gate = landmarks.bounds[0];
      const onGate = new Vector3(gate.x, gate.y, gate.z);
      expect(at(1).some((a) => landsIn(onGate, a))).toBe(true);

      // The Diamond's middle, over the field, at its own stop.
      expect(at(DIAMOND_STOP).some((a) => landsIn(DIAMOND_MIDDLE, a))).toBe(true);

      // Halfway up the Bank of China, at Hong Kong's stop.
      const onBank = new Vector3(bank.x, (bank.foot + bank.tip) / 2, bank.z);
      expect(at(ROUTE_STOPS - 1).some((a) => landsIn(onBank, a))).toBe(true);

      // The settled camera looks down the valley: home is behind it.
      const behind = new Vector3(0, 10, 60);
      expect(areas.some((a) => landsIn(behind, a))).toBe(false);
    });
  }
});
