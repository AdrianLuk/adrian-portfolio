import { describe, expect, it, vi } from "vitest";
import { createFlightTimeline } from "./flight-timeline";
import { FLIGHT_TIMING, SETTLED_RIG, type FlightRig } from "./world/rigs";

function setup() {
  const rig: FlightRig = { ...SETTLED_RIG };
  // GSAP tweens a plain object's opacity just as it would an element's.
  const credits = Array.from({ length: 4 }, () => ({ opacity: 0 }));
  const onComplete = vi.fn();
  const timeline = createFlightTimeline({ rig, credits, onComplete });
  timeline.pause(0);
  return { rig, credits, onComplete, timeline };
}

/** When any credit first starts to show, in seconds. */
function firstShown(
  credits: { opacity: number }[],
  timeline: ReturnType<typeof setup>["timeline"],
) {
  for (let t = 0; t <= timeline.duration(); t += 0.01) {
    timeline.seek(t);
    if (credits.some((c) => c.opacity > 0)) return t;
  }
  return Infinity;
}

describe("the flight timeline", () => {
  it("runs 10 to 10.5 seconds, flight, turn-in and settle", () => {
    const { timeline } = setup();
    expect(timeline.duration()).toBeGreaterThanOrEqual(10);
    expect(timeline.duration()).toBeLessThanOrEqual(10.5);
  });

  it("drifts through the pan, then swoops in: its last second covers over three times its first", () => {
    const { rig, timeline } = setup();
    const flightAt = (t: number) => {
      timeline.seek(t);
      return rig.flight;
    };
    const { flight } = FLIGHT_TIMING;
    const first = flightAt(1) - flightAt(0);
    const last = flightAt(flight) - flightAt(flight - 1);
    expect(last).toBeGreaterThan(3 * first);
  });

  it("starts far down the canyon, beams low, the lit site dark", () => {
    const { rig } = setup();
    expect(rig).toMatchObject({ flight: 0, turn: 0, settle: 0, beacon: 0 });
    expect(rig.beams).toBeLessThan(1);
  });

  it("brightens the beams as it arrives, then dims them to rest", () => {
    const { rig, timeline } = setup();
    let peak = 0;
    for (let t = 0; t <= timeline.duration(); t += 0.02) {
      timeline.seek(t);
      peak = Math.max(peak, rig.beams);
    }
    expect(peak).toBeGreaterThan(1.3);
    timeline.seek(timeline.duration());
    expect(rig.beams).toBe(1);
  });

  it("shows the credits one at a time, in order, each readable for over a second and a half", () => {
    const { credits, timeline } = setup();
    const step = 0.01;
    const readable = credits.map(() => ({ longest: 0, run: 0, first: -1 }));
    for (let t = 0; t <= timeline.duration(); t += step) {
      timeline.seek(t);
      expect(credits.filter((c) => c.opacity > 0.5).length).toBeLessThanOrEqual(
        1,
      );
      credits.forEach((c, i) => {
        const r = readable[i];
        if (c.opacity >= 0.99) {
          if (r.first < 0) r.first = t;
          r.run += step;
          r.longest = Math.max(r.longest, r.run);
        } else r.run = 0;
      });
    }
    for (const r of readable) expect(r.longest).toBeGreaterThan(1.5);
    const firsts = readable.map((r) => r.first);
    expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
    // Gone by the time it settles.
    for (const c of credits) expect(c.opacity).toBe(0);
    // The pan plays on its own for a few seconds first.
    expect(firstShown(credits, timeline)).toBeGreaterThanOrEqual(2.4);
  });

  it("skips straight to the settled rig and reports it once", () => {
    const { rig, onComplete, timeline } = setup();
    timeline.seek(1.2);
    expect(onComplete).not.toHaveBeenCalled();
    timeline.progress(1);
    // (GSAP keeps its own cache on the object, hence toMatchObject.)
    expect(rig).toMatchObject(SETTLED_RIG);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
