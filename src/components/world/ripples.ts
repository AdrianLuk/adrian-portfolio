/**
 * A ripple: a ring of light sent out from a tap on the world, across the
 * terrain or the sky. It spreads all the way over `seconds`, easing out, and
 * fades from full brightness as it goes: never brighter than when it starts.
 * At most `rings` at once on each.
 */
export const RIPPLE = { seconds: 1.5, rings: 4 };

/**
 * A ring spreading from `at`: how far it has spread, 0 to 1 of its full
 * reach, and how bright it is, 1 to 0.
 */
export type Ring<At> = { at: At; spread: number; strength: number };

/** A ring `age` seconds after its tap: how far it has spread, how bright it is. */
export function ringAt(age: number) {
  const t = Math.min(1, Math.max(0, age / RIPPLE.seconds));
  return { spread: 1 - (1 - t) ** 3, strength: (1 - t) ** 2 };
}

/**
 * The rings spreading now, each from where its tap landed, at most
 * RIPPLE.rings of them: a new one drops the oldest. Times are in seconds, on
 * any one clock.
 */
export function createRipples<At>() {
  let taps: { at: At; time: number }[] = [];
  return {
    /** A tap landing at `at`, at `time`. */
    start(at: At, time: number) {
      taps = [...taps, { at, time }].slice(-RIPPLE.rings);
    },
    /** Every ring still lit at `time`, oldest first. */
    lit(time: number): Ring<At>[] {
      taps = taps.filter((tap) => time - tap.time < RIPPLE.seconds);
      return taps.map(({ at, time: start }) => ({ at, ...ringAt(time - start) }));
    },
  };
}
