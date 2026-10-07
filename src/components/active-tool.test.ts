import { describe, expect, it } from "vitest";
import { activeTool } from "./active-tool";

// An 800px viewport, so the reading line sits 400px below the top of the
// screen. Five tools' copy blocks stand at 2000, 2600, 3200, 3800 and 4400,
// each 600 tall: the line reaches the first at scroll 1600.
const viewport = 800;
const tools = [2000, 2600, 3200, 3800, 4400].map((top) => ({
  top,
  height: 600,
}));

describe("the active tool", () => {
  it("is the first tool before the section, and the last after it", () => {
    expect(activeTool(0, viewport, tools).index).toBe(0);
    expect(activeTool(1599, viewport, tools).index).toBe(0);
    expect(activeTool(9000, viewport, tools).index).toBe(4);
  });

  it("moves to each tool as its block crosses the reading line", () => {
    // Each block's top meets the line 400px down the screen at top - 400.
    expect(activeTool(1700, viewport, tools).index).toBe(0);
    expect(activeTool(2300, viewport, tools).index).toBe(1);
    expect(activeTool(2900, viewport, tools).index).toBe(2);
    expect(activeTool(3500, viewport, tools).index).toBe(3);
    expect(activeTool(4100, viewport, tools).index).toBe(4);
  });

  it("is stable at exact boundaries: a block on the line has the stage", () => {
    expect(activeTool(2200, viewport, tools).index).toBe(1);
    expect(activeTool(2199.5, viewport, tools).index).toBe(0);
    expect(activeTool(4000, viewport, tools).index).toBe(4);
  });
});

describe("a set of any size", () => {
  it("keeps a single tool on the stage throughout, its progress rising", () => {
    const one = [{ top: 2000, height: 600 }];
    expect(activeTool(0, viewport, one)).toEqual({ index: 0, progress: 0 });
    expect(activeTool(1900, viewport, one)).toEqual({ index: 0, progress: 0.5 });
    expect(activeTool(9000, viewport, one)).toEqual({ index: 0, progress: 1 });
  });

  it("walks a set bigger than today's, tool by tool", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      top: 1000 + i * 500,
      height: 500,
    }));
    // Block i's top meets the line at scroll 600 + 500i.
    expect(activeTool(600 + 500 * 7, viewport, many).index).toBe(7);
    expect(activeTool(600 + 500 * 7 - 1, viewport, many).index).toBe(6);
    expect(activeTool(600 + 500 * 11, viewport, many).index).toBe(11);
    // 6000 px of blocks: halfway with the line on 4000.
    expect(activeTool(3600, viewport, many).progress).toBeCloseTo(0.5);
  });

  it("is the first tool, with no progress, for an empty set", () => {
    expect(activeTool(500, viewport, [])).toEqual({ index: 0, progress: 0 });
  });
});

describe("the progress through the set", () => {
  it("is nothing before the first tool and all of it after the last", () => {
    expect(activeTool(0, viewport, tools).progress).toBe(0);
    expect(activeTool(1600, viewport, tools).progress).toBe(0);
    // The last block's foot (5000) on the line.
    expect(activeTool(4600, viewport, tools).progress).toBe(1);
    expect(activeTool(9000, viewport, tools).progress).toBe(1);
  });

  it("rises steadily with the scroll through the set", () => {
    // 3000 px of blocks from 2000 to 5000: halfway at the line on 3500.
    expect(activeTool(3100, viewport, tools).progress).toBeCloseTo(0.5);
    expect(activeTool(2200, viewport, tools).progress).toBeCloseTo(0.2);
    let last = -1;
    for (let scroll = 1500; scroll <= 4700; scroll += 50) {
      const { progress } = activeTool(scroll, viewport, tools);
      expect(progress).toBeGreaterThanOrEqual(last);
      last = progress;
    }
  });
});
