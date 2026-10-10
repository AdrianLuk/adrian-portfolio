import { describe, expect, it } from "vitest";
import { createRotation } from "./not-found-rotation";

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

const indexes = (rotation: ReturnType<typeof createRotation>, n: number) =>
  Array.from({ length: n }, () => rotation.next().index);

describe("the 404's variant rotation", () => {
  it("starts at the first variant and takes them in order, round again", () => {
    expect(indexes(createRotation(memoryStorage(), 5), 7)).toEqual([0, 1, 2, 3, 4, 0, 1]);
  });

  it("carries the order across visits in the same browser", () => {
    const storage = memoryStorage();
    expect(indexes(createRotation(storage, 5), 2)).toEqual([0, 1]);
    expect(indexes(createRotation(storage, 5), 2)).toEqual([2, 3]);
  });

  it("has seen them all on the fifth showing, across visits too", () => {
    const storage = memoryStorage();
    const first = createRotation(storage, 5);
    expect([1, 2, 3].map(() => first.next().seenAll)).toEqual([false, false, false]);
    const second = createRotation(storage, 5);
    expect([second.next().seenAll, second.next().seenAll]).toEqual([false, true]);
  });

  it("still shows variants in order for the visit when storage throws", () => {
    const rotation = createRotation(throwing, 5);
    expect(indexes(rotation, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(rotation.next().seenAll).toBe(true);
  });

  it("starts over when storage holds junk", () => {
    const storage = { getItem: () => "junk", setItem: () => {} };
    expect(createRotation(storage, 5).next().index).toBe(0);
  });
});
