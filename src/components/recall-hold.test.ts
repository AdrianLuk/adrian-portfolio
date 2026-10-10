import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHold } from "./recall-hold";

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("a press-and-hold", () => {
  it("is done once held the whole time, and only once", () => {
    const done = vi.fn();
    const hold = createHold(done, 3000);
    expect(hold.start()).toBe(true);
    vi.advanceTimersByTime(2999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("is cancelled by letting go early", () => {
    const done = vi.fn();
    const hold = createHold(done, 3000);
    hold.start();
    vi.advanceTimersByTime(2000);
    expect(hold.cancel()).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(done).not.toHaveBeenCalled();
  });

  it("ignores a second start while held, and a cancel with nothing to cancel", () => {
    const hold = createHold(() => {}, 3000);
    expect(hold.cancel()).toBe(false);
    expect(hold.start()).toBe(true);
    expect(hold.start()).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(hold.cancel()).toBe(false);
  });

  it("can be held again after a cancel", () => {
    const done = vi.fn();
    const hold = createHold(done, 3000);
    hold.start();
    hold.cancel();
    expect(hold.start()).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
