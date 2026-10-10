const KEY = "not-found-shown";

/** Where the count is kept: a browser's localStorage, which may throw or be empty. */
type ShownStore = Pick<Storage, "getItem" | "setItem">;

/**
 * The 404's variant order: each showing (an arrival, or the button) takes the
 * next of `size` variants, in order, round again. The count of showings is
 * kept in `storage`, and in memory for the visit when storage fails. Any
 * `size` showings in a row have shown every variant: `seenAll`.
 */
export function createRotation(storage: ShownStore, size: number) {
  let shown = read(storage);
  return {
    next() {
      shown += 1;
      try {
        storage.setItem(KEY, String(shown));
      } catch {
        // Kept in memory for this visit.
      }
      return { index: (shown - 1) % size, seenAll: shown >= size };
    },
  };
}

function read(storage: ShownStore) {
  try {
    const shown = Number(storage.getItem(KEY));
    return Number.isSafeInteger(shown) && shown > 0 ? shown : 0;
  } catch {
    return 0;
  }
}
