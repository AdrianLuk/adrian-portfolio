import { Color } from "three";
import { describe, expect, it } from "vitest";
import { courtLook, RALLY_BALL, rallyBall, tintFog } from "./court-look";
import { layoutLandmarks } from "./landmarks";
import { fogColor, palette } from "./palette";

const landmarks = layoutLandmarks();
const court = landmarks.court;

/** The rally sampled every 1/60 s over a minute of play, from the still frame on. */
const rally = Array.from({ length: 60 * 60 }, (_, i) =>
  rallyBall(court, 11.5 + i / 60),
);

describe("the rally ball", () => {
  it("plays on the Juice Bros court's own net, its tape at the landmark's", () => {
    const tape = landmarks.bands.find(
      (b) => Math.abs(b.z - court.z) < 1e-6 && b.d < 0.1 && b.h < 0.2,
    );
    expect(tape).toBeDefined();
    expect(tape!.y + tape!.h / 2).toBeCloseTo(court.level + court.netHeight);
    expect(tape!.x).toBeCloseTo(court.x);
  });

  it("stays over the court, inside its lines and above its floor", () => {
    for (const p of rally) {
      expect(Math.abs(p.x - court.x)).toBeLessThanOrEqual(court.halfWidth);
      expect(Math.abs(p.z - court.z)).toBeLessThanOrEqual(court.halfLength);
      expect(p.y - RALLY_BALL.radius).toBeGreaterThan(court.level);
    }
  });

  it("crosses the net, back and forth, again and again", () => {
    let crossings = 0;
    for (let i = 1; i < rally.length; i++) {
      const before = Math.sign(rally[i - 1].z - court.z);
      const after = Math.sign(rally[i].z - court.z);
      if (before !== after) crossings++;
    }
    // A minute of a slow rally: a shot every few seconds, not a blur.
    expect(crossings).toBeGreaterThanOrEqual(12);
    expect(crossings).toBeLessThanOrEqual(40);
  });

  it("never dips below the net's tape as it passes over it", () => {
    const tape = court.level + court.netHeight;
    for (const p of rally) {
      if (Math.abs(p.z - court.z) <= RALLY_BALL.radius) {
        expect(p.y - RALLY_BALL.radius).toBeGreaterThan(tape);
      }
    }
  });

  it("moves without a jump, from shot to shot", () => {
    for (let i = 1; i < rally.length; i++) {
      const a = rally[i - 1];
      const b = rally[i];
      const step = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      // Slowly: well under a court's length a second.
      expect(step * 60).toBeLessThan(court.halfLength * 2);
    }
  });
});

describe("the court's look", () => {
  const blends = Array.from({ length: 21 }, (_, i) => i / 20);

  it("changes nothing away from the court", () => {
    expect(courtLook(0)).toEqual({
      floodlights: 1,
      fog: 0,
      ball: 0,
      falling: 1,
    });
  });

  it("at the court, turns the floodlights up, tints the fog, brings the ball in and stops what falls", () => {
    const look = courtLook(1);
    expect(look.floodlights).toBeGreaterThanOrEqual(2);
    expect(look.fog).toBeGreaterThan(0.15);
    // A tint, not a wash: the night stays the night.
    expect(look.fog).toBeLessThan(0.5);
    expect(look.ball).toBe(1);
    expect(look.falling).toBe(0);
  });

  it("blends in step by step, never back, as the director's blend rises", () => {
    for (let i = 1; i < blends.length; i++) {
      const a = courtLook(blends[i - 1]);
      const b = courtLook(blends[i]);
      expect(b.floodlights).toBeGreaterThanOrEqual(a.floodlights);
      expect(b.fog).toBeGreaterThanOrEqual(a.fog);
      expect(b.ball).toBeGreaterThanOrEqual(a.ball);
      expect(b.falling).toBeLessThanOrEqual(a.falling);
    }
  });

  it("is gone from what falls by the time the camera lands", () => {
    expect(courtLook(0.95).falling).toBeLessThan(0.1);
  });
});

describe("the fog's colour", () => {
  const night = palette.fog.clone();

  it("tints the world's shared fog toward the court's violet", () => {
    tintFog(courtLook(1).fog);
    const toward = (c: Color) =>
      Math.hypot(
        c.r - palette.violet.r,
        c.g - palette.violet.g,
        c.b - palette.violet.b,
      );
    expect(toward(fogColor)).toBeLessThan(toward(night));
  });

  it("leaves the palette's own fog alone (the sky's horizon, the hills)", () => {
    tintFog(courtLook(1).fog);
    expect(palette.fog.equals(night)).toBe(true);
  });

  it("is the night's own fog again away from the court", () => {
    tintFog(courtLook(1).fog);
    tintFog(courtLook(0).fog);
    expect(fogColor.equals(night)).toBe(true);
  });
});
