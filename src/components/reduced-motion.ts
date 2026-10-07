/**
 * The visitor's reduced-motion preference, read live: everything that moves
 * follows it as it changes.
 */
export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export const prefersReducedMotion = () =>
  window.matchMedia(REDUCED_MOTION).matches;

/** Calls `onChange` whenever the preference changes; returns the unsubscribe. */
export function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
