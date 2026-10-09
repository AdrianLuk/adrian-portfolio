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

/** Earns `id` for this visitor: the footer's Achievements hear it, and toast it if it's new. */
export const earnAchievement = (id: AchievementId) =>
  window.dispatchEvent(new CustomEvent(EARN_EVENT, { detail: id }));

/** Where progress is kept: a browser's localStorage, which may throw or be empty. */
type Storage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type Achievements = ReturnType<typeof createAchievements>;

const isId = (id: unknown): id is AchievementId =>
  ACHIEVEMENT_IDS.includes(id as AchievementId);

/**
 * The Achievements store: which this visitor has earned, read from and
 * written to `storage`, and kept in memory for the visit when storage fails
 * (a private window, say).
 */
export function createAchievements(storage: Storage) {
  const earned = new Set<AchievementId>(read(storage));
  const listeners = new Set<() => void>();
  const build = () => ACHIEVEMENT_IDS.map((id) => ({ id, earned: earned.has(id) }));
  // Kept until something is earned, so it can stand as a React snapshot.
  let list = build();

  return {
    /** Earns `id`, and First Blood with it: returns those newly earned, none on a repeat. */
    earn(id: AchievementId): AchievementId[] {
      const fresh = [...new Set([id, FIRST_BLOOD])].filter((a) => !earned.has(a));
      if (!fresh.length) return fresh;
      for (const a of fresh) earned.add(a);
      list = build();
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

function read(storage: Storage): AchievementId[] {
  try {
    const ids: unknown = JSON.parse(storage.getItem(KEY) ?? "[]");
    return Array.isArray(ids) ? ids.filter(isId) : [];
  } catch {
    return [];
  }
}
