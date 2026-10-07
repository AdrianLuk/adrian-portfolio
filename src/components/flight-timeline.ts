import { gsap } from "gsap";
import {
  FLIGHT_START_RIG,
  FLIGHT_TIMING,
  SETTLED_RIG,
  type FlightRig,
} from "./world/rigs";

/** Anything GSAP can fade: the credit elements, or plain objects in tests. */
type Fadeable = HTMLElement | { opacity: number };

/**
 * The first credit waits out most of the opening pan; each fades in at its
 * time and holds 1.65s before fading out.
 */
const CREDIT = { first: 2.5, every: 1.85, fade: 0.2 } as const;

/**
 * The opening as one GSAP timeline: the flight down the canyon at a constant
 * speed, the turn-in easing to rest, the settle into the final framing, the
 * beams flaring as it arrives and dimming to rest, the first lit site coming
 * up on the horizon, and the four credits, one at a time. It ends exactly on
 * SETTLED_RIG, so skipping is `progress(1)`.
 */
export function createFlightTimeline({
  rig,
  credits,
  onUpdate,
  onComplete,
}: {
  rig: FlightRig;
  credits: readonly Fadeable[];
  onUpdate?: () => void;
  onComplete: () => void;
}) {
  const { flight, turn } = FLIGHT_TIMING;
  const arrive = flight + turn;
  const settled = { ...SETTLED_RIG };

  // The opening keeps wall-clock time: lag smoothing would stretch it through
  // the long frames of the world's setup, holding the copy back (a long frame
  // jumps the camera ahead instead). GSAP's default returns once it is over,
  // for whatever animates next.
  gsap.ticker.lagSmoothing(0);
  const restore = () => gsap.ticker.lagSmoothing(500, 33);
  const timeline = gsap.timeline({
    onUpdate,
    onComplete() {
      restore();
      onComplete();
    },
    onInterrupt: restore,
  });
  timeline
    .fromTo(
      rig,
      { ...FLIGHT_START_RIG },
      { flight: settled.flight, duration: flight, ease: "none" },
      0,
    )
    .to(rig, { turn: settled.turn, duration: turn, ease: "power2.out" }, flight)
    .to(
      rig,
      { settle: settled.settle, duration: 1.2, ease: "power2.inOut" },
      arrive - 1.2,
    )
    // The beams flare and sweep across the letterforms on arrival, then dim.
    .to(rig, { beams: 1.7, duration: 0.6, ease: "power1.in" }, flight - 0.1)
    .to(
      rig,
      { beams: settled.beams, duration: 0.9, ease: "power2.out" },
      arrive - 0.9,
    )
    .to(
      rig,
      { sweep: settled.sweep, duration: 1.4, ease: "power2.inOut" },
      arrive - 1.4,
    )
    .to(
      rig,
      { beacon: settled.beacon, duration: 0.6, ease: "power1.out" },
      arrive - 0.6,
    );

  credits.forEach((credit, i) => {
    const start = CREDIT.first + i * CREDIT.every;
    // Ease in slowly and out quickly, so two never both read at half strength.
    timeline
      .fromTo(
        credit,
        { opacity: 0 },
        { opacity: 1, duration: CREDIT.fade, ease: "power1.in" },
        start,
      )
      .to(
        credit,
        { opacity: 0, duration: CREDIT.fade, ease: "power1.out" },
        start + CREDIT.every,
      );
  });

  return timeline;
}
