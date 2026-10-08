import { describe, expect, it } from "vitest";
import { RALLY_BALL, rallyBall } from "./court-look";
import { layoutLandmarks } from "./landmarks";

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
