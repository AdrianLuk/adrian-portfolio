/** The six Achievements, in the order the footer's list shows them. */
export const ACHIEVEMENT_IDS = [
  "first-blood",
  "back-to-base",
  "encore",
  "full-rotation",
  "back-to-back-to-back",
  "dinkbot-down",
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/** Earned alongside the first of any other. */
const FIRST_BLOOD: AchievementId = "first-blood";

const KEY = "achievements";

/** The event an Easter egg raises on `window` to earn an Achievement: its id in `detail`. */
export const EARN_EVENT = "achievement";

/**
 * Earns `id` for this visitor: the footer's Achievements hear it, and toast it
 * if it's new. First Blood isn't earned here: it comes with the first of any other.
 */
export const earnAchievement = (id: Exclude<AchievementId, "first-blood">) =>
  window.dispatchEvent(new CustomEvent(EARN_EVENT, { detail: id }));

/** Where progress is kept: a browser's localStorage, which may throw or be empty. */
type ProgressStore = Pick<Storage, "getItem" | "setItem">;

export type Achievements = ReturnType<typeof createAchievements>;

const isId = (id: unknown): id is AchievementId =>
  ACHIEVEMENT_IDS.includes(id as AchievementId);

/** Each Achievement, in order, and whether it's in `earned`. */
const build = (earned: ReadonlySet<AchievementId>) =>
  ACHIEVEMENT_IDS.map((id) => ({ id, earned: earned.has(id) }));

/** Nothing earned: the list before storage is read. */
export const NONE_EARNED = build(new Set());

/**
 * The Achievements store: which this visitor has earned, read from and
 * written to `storage`, and kept in memory for the visit when storage fails
 * (a private window, say).
 */
export function createAchievements(storage: ProgressStore) {
  const earned = new Set<AchievementId>(read(storage));
  const listeners = new Set<() => void>();
  // Kept until something is earned, so it can stand as a React snapshot.
  let list = build(earned);

  return {
    /** Earns `id`, and First Blood with it: returns those newly earned, none on a repeat. */
    earn(id: AchievementId): AchievementId[] {
      const fresh = [...new Set([id, FIRST_BLOOD])].filter((a) => !earned.has(a));
      if (!fresh.length) return fresh;
      for (const a of fresh) earned.add(a);
      list = build(earned);
      try {
        storage.setItem(KEY, JSON.stringify([...earned]));
      } catch {
        // Kept in memory for this visit.
      }
      for (const listener of listeners) listener();
      return fresh;
    },
    list: () => list,
    count: () => earned.size,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

function read(storage: ProgressStore): AchievementId[] {
  try {
    const ids: unknown = JSON.parse(storage.getItem(KEY) ?? "[]");
    return Array.isArray(ids) ? ids.filter(isId) : [];
  } catch {
    return [];
  }
}
