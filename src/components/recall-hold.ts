/** How long the 404's "Recall to base:" is held to take the visitor home. */
export const HOLD_MS = 3000;

/**
 * A press-and-hold: `onDone` runs once the hold has lasted `ms` without being
 * cancelled. `start` and `cancel` say whether they changed anything (a second
 * start, or a cancel with nothing held or already done, doesn't).
 */
export function createHold(onDone: () => void, ms = HOLD_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    start() {
      if (timer !== undefined) return false;
      timer = setTimeout(() => {
        timer = undefined;
        onDone();
      }, ms);
      return true;
    },
    cancel() {
      if (timer === undefined) return false;
      clearTimeout(timer);
      timer = undefined;
      return true;
    },
  };
}
