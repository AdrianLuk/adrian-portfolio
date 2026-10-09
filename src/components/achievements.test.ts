import { describe, expect, it } from "vitest";
import { createAchievements } from "./achievements";

/** A browser's storage, in memory: what one visit leaves for the next. */
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const throwing = {
  getItem: (): string | null => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("the Achievements store", () => {
  it("earns an achievement, with First Blood, only the first time", () => {
    const achievements = createAchievements(memoryStorage());
    expect(achievements.earn("dinkbot-down")).toEqual(["dinkbot-down", "first-blood"]);
    expect(achievements.earn("dinkbot-down")).toEqual([]);
  });

  it("earns First Blood once, alongside the first of the others only", () => {
    const achievements = createAchievements(memoryStorage());
    achievements.earn("dinkbot-down");
    expect(achievements.earn("back-to-base")).toEqual(["back-to-base"]);
  });

  it("lists all six in order, earned or not, and counts the earned", () => {
    const achievements = createAchievements(memoryStorage());
    expect(achievements.count()).toBe(0);
    achievements.earn("dinkbot-down");
    expect(achievements.list()).toEqual([
      { id: "first-blood", earned: true },
      { id: "back-to-base", earned: false },
      { id: "encore", earned: false },
      { id: "full-rotation", earned: false },
      { id: "back-to-back-to-back", earned: false },
      { id: "dinkbot-down", earned: true },
    ]);
    expect(achievements.count()).toBe(2);
  });

  it("remembers progress in its storage for the next visit", () => {
    const storage = memoryStorage();
    createAchievements(storage).earn("dinkbot-down");
    const next = createAchievements(storage);
    expect(next.count()).toBe(2);
    expect(next.earn("dinkbot-down")).toEqual([]);
  });

  it("ignores what it can't read from storage", () => {
    const storage = memoryStorage();
    storage.setItem("achievements", "not json");
    expect(createAchievements(storage).count()).toBe(0);
    storage.setItem("achievements", JSON.stringify(["dinkbot-down", "made-up"]));
    expect(createAchievements(storage).count()).toBe(1);
  });

  it("keeps working in memory when storage throws", () => {
    const achievements = createAchievements(throwing);
    expect(achievements.count()).toBe(0);
    expect(achievements.earn("dinkbot-down")).toEqual(["dinkbot-down", "first-blood"]);
    expect(achievements.earn("dinkbot-down")).toEqual([]);
    expect(achievements.count()).toBe(2);
  });

  it("tells its subscribers when an achievement is earned, and not on a repeat", () => {
    const achievements = createAchievements(memoryStorage());
    let calls = 0;
    const unsubscribe = achievements.subscribe(() => calls++);
    achievements.earn("dinkbot-down");
    achievements.earn("dinkbot-down");
    expect(calls).toBe(1);
    unsubscribe();
    achievements.earn("encore");
    expect(calls).toBe(1);
  });
});
