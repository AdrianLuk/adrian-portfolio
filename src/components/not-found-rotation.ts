const KEY = "not-found-variants";

/** Where progress is kept: a browser's localStorage, which may throw or be empty. */
type ShownStore = Pick<Storage, "getItem" | "setItem">;

type State = { shown: number; seen: number[] };

/**
 * The 404's variant order: each showing (an arrival, or the button) takes the
 * next of `size` variants, in order, round again. What this browser has been
 * shown (the count, for the order, and the distinct variants, for `seenAll`)
 * is read from `storage` at every showing, so two tabs share one order, and
 * kept in memory for the visit once storage fails (a private window, say).
 */
export function createRotation(storage: ShownStore, size: number) {
  let memory: State = { shown: 0, seen: [] };
  let broken = false;

  const read = (): State => {
    if (broken) return memory;
    try {
      const state: unknown = JSON.parse(storage.getItem(KEY) ?? "null");
      const { shown, seen } = (state ?? {}) as Partial<State>;
      return Number.isSafeInteger(shown) && Array.isArray(seen)
        ? { shown: shown!, seen: seen.filter((i) => Number.isInteger(i) && i >= 0 && i < size) }
        : { shown: 0, seen: [] };
    } catch {
      return memory;
    }
  };

  return {
    next() {
      const { shown, seen } = read();
      const index = shown % size;
      memory = { shown: shown + 1, seen: [...new Set([...seen, index])] };
      try {
        storage.setItem(KEY, JSON.stringify(memory));
      } catch {
        broken = true;
      }
      return { index, seenAll: memory.seen.length === size };
    },
  };
}
