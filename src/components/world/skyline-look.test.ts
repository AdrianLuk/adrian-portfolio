import { Color } from "three";
import { describe, expect, it } from "vitest";
import { fogColor, palette, tintFog } from "./palette";
import { skylineLook } from "./skyline-look";

const blends = Array.from({ length: 101 }, (_, i) => i / 100);

describe("the Skyline's look", () => {
  it("is none of it away from the Skyline: the wash and the fog as they are, the weather falling", () => {
    expect(skylineLook(0)).toEqual({ wash: 0, fog: 0, falling: 1 });
  });

  it("at the Skyline, washes the CN Tower in magenta and tints the fog, with nothing falling", () => {
    const look = skylineLook(1);
    expect(look.wash).toBe(1);
    expect(look.fog).toBeGreaterThan(0.15);
    // A tint, not a wash: the night stays the night.
    expect(look.fog).toBeLessThan(0.5);
    expect(look.falling).toBe(0);
  });

  it("blends in step by step, never back, as the director's blend rises", () => {
    for (let i = 1; i < blends.length; i++) {
      const a = skylineLook(blends[i - 1]);
      const b = skylineLook(blends[i]);
      expect(b.wash).toBeGreaterThanOrEqual(a.wash);
      expect(b.fog).toBeGreaterThanOrEqual(a.fog);
      expect(b.falling).toBeLessThanOrEqual(a.falling);
    }
  });

  it("is gone from what falls by the time the camera lands", () => {
    expect(skylineLook(0.95).falling).toBeLessThan(0.1);
  });
});

describe("the fog's colour at the Skyline", () => {
  const night = palette.fog.clone();
  const toward = (c: Color, to: Color) =>
    Math.hypot(c.r - to.r, c.g - to.g, c.b - to.b);

  it("tints the world's shared fog toward the palette's magenta", () => {
    tintFog(0, skylineLook(1).fog);
    expect(toward(fogColor, palette.magenta)).toBeLessThan(
      toward(night, palette.magenta),
    );
    tintFog(0, 0);
  });

  it("is the night's own fog again away from the Skyline", () => {
    tintFog(0, skylineLook(1).fog);
    tintFog(0, skylineLook(0).fog);
    expect(fogColor.equals(night)).toBe(true);
  });
});
