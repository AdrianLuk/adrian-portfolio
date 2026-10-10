/**
 * A ripple: a ring of light sent out across the terrain from a tap on the
 * world. It spreads to `radius` world units over `seconds`, easing out, and
 * fades from full brightness as it goes: never brighter than when it starts.
 */
export const RIPPLE = { seconds: 1.5, radius: 45, rings: 4 };

/**
 * The rings spreading now, at most RIPPLE.rings of them: a new one drops
 * the oldest. Times are in seconds, on any one clock.
 */
export function createRipples() {
  let taps: { x: number; z: number; time: number }[] = [];
  return {
    /** A tap at (x, z) on the terrain, at `time`. */
    start(x: number, z: number, time: number) {
      taps = [...taps, { x, z, time }].slice(-RIPPLE.rings);
    },
    /** Every ring still lit at `time`, oldest first. */
    at(time: number): Ring[] {
      taps = taps.filter((tap) => time - tap.time < RIPPLE.seconds);
      return taps.map(({ x, z, time: start }) => ({
        x,
        z,
        ...ringAt(time - start),
      }));
    },
  };
}

/** A ring spreading from (x, z) on the terrain. */
export type Ring = { x: number; z: number; radius: number; strength: number };

/** A ring `age` seconds after its tap: how far it has spread, how bright it is. */
export function ringAt(age: number) {
  const t = Math.min(1, Math.max(0, age / RIPPLE.seconds));
  return {
    radius: RIPPLE.radius * (1 - (1 - t) ** 3),
    strength: (1 - t) ** 2,
  };
}
