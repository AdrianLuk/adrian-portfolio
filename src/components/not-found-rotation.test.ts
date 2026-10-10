import { describe, expect, it } from "vitest";
import { createRotation } from "./not-found-rotation";

/** A browser's storage, in memory: what one visit leaves for the next. */
function memoryStorage() {
  let items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    clear: () => void (items = new Map()),
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

  it("has seen them all once all five have been shown, across visits too", () => {
    const storage = memoryStorage();
    const first = createRotation(storage, 5);
    expect([1, 2, 3].map(() => first.next().seenAll)).toEqual([false, false, false]);
    const second = createRotation(storage, 5);
    expect([second.next().seenAll, second.next().seenAll]).toEqual([false, true]);
  });

  it("keeps one order between two readers of the same storage (two tabs)", () => {
    const storage = memoryStorage();
    const a = createRotation(storage, 5);
    const b = createRotation(storage, 5);
    expect([a.next(), b.next(), a.next(), b.next(), a.next()]).toEqual([
      { index: 0, seenAll: false },
      { index: 1, seenAll: false },
      { index: 2, seenAll: false },
      { index: 3, seenAll: false },
      { index: 4, seenAll: true },
    ]);
  });

  it("starts over, seeing none, when storage is cleared partway", () => {
    const storage = memoryStorage();
    const rotation = createRotation(storage, 5);
    indexes(rotation, 4);
    storage.clear();
    // Five showings' worth of count would have passed; only these are seen.
    expect([0, 1, 2, 3].map(() => rotation.next().seenAll)).toEqual([false, false, false, false]);
    expect(rotation.next()).toEqual({ index: 4, seenAll: true });
  });

  it("never counts a variant shown twice for another", () => {
    const storage = {
      getItem: () => JSON.stringify({ shown: 9, seen: [0, 0, 1] }),
      setItem: () => {},
    };
    expect(createRotation(storage, 5).next()).toEqual({ index: 4, seenAll: false });
  });

  it("still shows variants in order for the visit when storage throws", () => {
    const rotation = createRotation(throwing, 5);
    expect([0, 1, 2, 3, 4].map(() => rotation.next())).toEqual([
      { index: 0, seenAll: false },
      { index: 1, seenAll: false },
      { index: 2, seenAll: false },
      { index: 3, seenAll: false },
      { index: 4, seenAll: true },
    ]);
  });

  it("still cycles for the visit when storage reads empty but won't save", () => {
    const storage = { getItem: () => null, setItem: throwing.setItem };
    expect(indexes(createRotation(storage, 5), 3)).toEqual([0, 1, 2]);
  });

  it("starts over when storage holds junk", () => {
    for (const junk of ["junk", "4", "[]", '{"shown":"x"}']) {
      const storage = { getItem: () => junk, setItem: () => {} };
      expect(createRotation(storage, 5).next().index).toBe(0);
    }
  });
});
