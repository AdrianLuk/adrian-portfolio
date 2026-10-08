import { describe, expect, it } from "vitest";
import { PANEL_TILT, tiltToward, tiltTransform } from "./pointer-motion";

const box = { left: 100, top: 50, width: 600, height: 300 };

describe("a panel's tilt toward the pointer", () => {
  it("is level with the pointer at its centre", () => {
    expect(tiltToward(box, 400, 200)).toEqual({ x: 0, y: 0 });
  });

  it("turns its right side away as the pointer reaches its right edge", () => {
    expect(tiltToward(box, 700, 200)).toEqual({ x: 0, y: PANEL_TILT });
    expect(tiltToward(box, 100, 200)).toEqual({ x: 0, y: -PANEL_TILT });
  });

  it("turns its top away as the pointer reaches its top edge", () => {
    expect(tiltToward(box, 400, 50)).toEqual({ x: PANEL_TILT, y: 0 });
    expect(tiltToward(box, 400, 350)).toEqual({ x: -PANEL_TILT, y: 0 });
  });

  it("never tilts past a few degrees, wherever the pointer is", () => {
    const far = tiltToward(box, 5000, -5000);
    expect(far).toEqual({ x: PANEL_TILT, y: PANEL_TILT });
    expect(PANEL_TILT).toBeLessThanOrEqual(6);
  });

  it("reads as a CSS transform in perspective", () => {
    expect(tiltTransform({ x: 1.5, y: -3 })).toBe(
      "perspective(1200px) rotateX(1.50deg) rotateY(-3.00deg)",
    );
  });
});
