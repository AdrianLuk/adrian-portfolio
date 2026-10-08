import { describe, expect, it } from "vitest";
import { createStageDirector } from "./stage-director";

// An 800px viewport, so the reading line sits 400px below the top of the
// screen. Five tools' copy blocks stand at 2000, 2600, 3200, 3800 and 4400,
// each 600 tall: the line reaches the first at scroll 1600, and each block's
// top meets it at top - 400.
const viewport = 800;
const boxes = [2000, 2600, 3200, 3800, 4400].map((top) => ({
  top,
  height: 600,
}));

/** A director for the five tools, laid out and scrolled to `y`. */
function measured(y: number, focused: number | null = null) {
  const director = createStageDirector({ tools: boxes.length, focused });
  director.measure(viewport, boxes);
  director.scroll(y);
  return director;
}

describe("the stage before it is measured", () => {
  it("shows no tool and plays nothing", () => {
    const director = createStageDirector({ tools: 5, focused: null });
    director.scroll(3000);
    expect(director.state()).toEqual({
      shown: -1,
      progress: 0,
      playing: null,
      paused: [false, false, false, false, false],
    });
  });
});

describe("the tool the scroll puts on the stage", () => {
  it("is the first tool before the section, and the last after it", () => {
    expect(measured(0).state().shown).toBe(0);
    expect(measured(1599).state().shown).toBe(0);
    expect(measured(9000).state().shown).toBe(4);
  });

  it("moves to each tool as its block crosses the reading line", () => {
    const director = measured(1700);
    expect(director.state().shown).toBe(0);
    for (const [y, tool] of [
      [2300, 1],
      [2900, 2],
      [3500, 3],
      [4100, 4],
    ]) {
      director.scroll(y);
      expect(director.state().shown).toBe(tool);
    }
  });

  it("is stable at exact boundaries: a block on the line has the stage", () => {
    expect(measured(2200).state().shown).toBe(1);
    expect(measured(2199.5).state().shown).toBe(0);
    expect(measured(4000).state().shown).toBe(4);
  });
});

describe("keyboard focus in a tool's copy", () => {
  it("brings that tool onto the stage, until a scroll moves on to another tool", () => {
    const director = measured(1700);
    director.focusIn(4, 1700);
    expect(director.state().shown).toBe(4);
    // Scrolling within the scroll's own tool leaves the stage to focus.
    director.scroll(1800);
    expect(director.state().shown).toBe(4);
    // Scrolling on to the next tool hands the stage back to the scroll.
    director.scroll(2300);
    expect(director.state().shown).toBe(1);
  });

  it("hands the stage back to the scroll's tool when it leaves the tools", () => {
    const director = measured(2300);
    director.focusIn(3, 2300);
    director.focusOut(null);
    expect(director.state().shown).toBe(1);
  });

  it("is measured from where focusing scrolled the page, so only a later scroll hands it back", () => {
    const director = measured(1700);
    // Focusing the last tool's link scrolled the page on to the second tool.
    director.focusIn(4, 2300);
    director.scroll(2350);
    expect(director.state().shown).toBe(4);
    director.scroll(2900);
    expect(director.state().shown).toBe(2);
  });

  it("moves from one tool to another without flashing back to the scroll's tool", () => {
    const director = measured(1700);
    director.focusIn(2, 1700);
    // Leaving the third tool for the fifth: the focusout names where focus goes.
    director.focusOut(4);
    expect(director.state().shown).toBe(2);
    director.focusIn(4, 1700);
    expect(director.state().shown).toBe(4);
    director.focusOut(null);
    expect(director.state().shown).toBe(0);
  });

  it("restored at the start (by Back, say) holds the stage from the first measure", () => {
    const director = measured(1700, 3);
    expect(director.state().shown).toBe(3);
    director.scroll(1800);
    expect(director.state().shown).toBe(3);
    director.scroll(2300);
    expect(director.state().shown).toBe(1);
  });
});

describe("the stage's recording", () => {
  it("plays the shown tool's only while the stage is on screen", () => {
    const director = measured(2300);
    expect(director.state().playing).toBeNull();
    director.visibility(true);
    expect(director.state().playing).toBe(1);
    director.scroll(2900);
    expect(director.state().playing).toBe(2);
    // The stage scrolled away.
    director.visibility(false);
    expect(director.state().playing).toBeNull();
    director.visibility(true);
    expect(director.state().playing).toBe(2);
  });

  it("stays paused for a tool its reader paused, while the other tools play", () => {
    const director = measured(2300);
    director.visibility(true);
    director.toggle(1);
    expect(director.state()).toMatchObject({
      playing: null,
      paused: [false, true, false, false, false],
    });
    director.scroll(2900);
    expect(director.state().playing).toBe(2);
    // Back on the paused tool, it is still paused.
    director.scroll(2300);
    expect(director.state().playing).toBeNull();
    director.toggle(1);
    expect(director.state()).toMatchObject({
      playing: 1,
      paused: [false, false, false, false, false],
    });
  });

  it("plays a tool focus holds on the stage", () => {
    const director = measured(2300);
    director.visibility(true);
    director.focusIn(3, 2300);
    expect(director.state().playing).toBe(3);
  });
});

describe("the progress through the set", () => {
  it("is nothing before the first tool and all of it after the last", () => {
    expect(measured(0).state().progress).toBe(0);
    expect(measured(1600).state().progress).toBe(0);
    // The last block's foot (5000) on the line.
    expect(measured(4600).state().progress).toBe(1);
    expect(measured(9000).state().progress).toBe(1);
  });

  it("rises steadily with the scroll through the set", () => {
    // 3000 px of blocks from 2000 to 5000: halfway at the line on 3500.
    expect(measured(3100).state().progress).toBeCloseTo(0.5);
    expect(measured(2200).state().progress).toBeCloseTo(0.2);
    const director = measured(1500);
    let last = -1;
    for (let y = 1500; y <= 4700; y += 50) {
      director.scroll(y);
      const { progress } = director.state();
      expect(progress).toBeGreaterThanOrEqual(last);
      last = progress;
    }
  });
});

describe("a set of any size", () => {
  it("keeps a single tool on the stage throughout, its progress rising", () => {
    const director = createStageDirector({ tools: 1, focused: null });
    director.measure(viewport, [{ top: 2000, height: 600 }]);
    for (const [y, progress] of [
      [0, 0],
      [1900, 0.5],
      [9000, 1],
    ]) {
      director.scroll(y);
      expect(director.state()).toMatchObject({ shown: 0, progress });
    }
  });

  it("walks a set bigger than today's, tool by tool", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      top: 1000 + i * 500,
      height: 500,
    }));
    const director = createStageDirector({ tools: 12, focused: null });
    director.measure(viewport, many);
    // Block i's top meets the line at scroll 600 + 500i.
    for (const [y, tool] of [
      [600 + 500 * 7, 7],
      [600 + 500 * 7 - 1, 6],
      [600 + 500 * 11, 11],
    ]) {
      director.scroll(y);
      expect(director.state().shown).toBe(tool);
    }
    // 6000 px of blocks: halfway with the line on 4000.
    director.scroll(3600);
    expect(director.state().progress).toBeCloseTo(0.5);
  });

  it("has no progress through an empty set", () => {
    const director = createStageDirector({ tools: 0, focused: null });
    director.measure(viewport, []);
    director.scroll(500);
    expect(director.state().progress).toBe(0);
  });
});
