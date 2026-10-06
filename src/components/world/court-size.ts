/**
 * A pickleball court, in feet: 20 wide and 44 long, the net across the
 * middle at 34 inches (36 at the posts), and the kitchen (the non-volley
 * zone) 7 deep on each side of it. Its own module, free of Three.js, so the
 * Rally game's rules can share it with the world's court.
 */
export const COURT = {
  width: 20,
  length: 44,
  kitchen: 7,
  netHeight: 34 / 12,
  postHeight: 36 / 12,
  /** How far outside the sidelines the posts stand. */
  postOut: 1,
  /** The plinth's lip round the court, beside it and behind each baseline. */
  side: 1,
  back: 1,
} as const;
