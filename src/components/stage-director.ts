// No DOM here: the scene's motion (player-tools-motion.ts) measures the page,
// reports what happens on it, and draws what the director decides.

/** A tool's copy block on the page, in document pixels. */
export type ToolBox = { top: number; height: number };

/** Where a tool takes the stage: its copy block's top crossing this share of the viewport. */
export const READING_LINE = 0.5;

/** What the Player tools stage shows, for its adapter to draw. */
export type StageState = {
  /** The tool on the stage (-1 until the stage is first measured and scrolled). */
  shown: number;
  /** How far through the set the reader is, 0 to 1, for the progress bar. */
  progress: number;
  /** The tool whose recording plays: the one shown, on screen and not paused; or none. */
  playing: number | null;
  /** Each tool's pause, set by the button in its copy. */
  paused: readonly boolean[];
};

/**
 * The Stage director: the one place that decides which tool is on the Player
 * tools stage, whether its recording plays, and how focus and scroll hand it
 * over. The stage shows the tool whose copy has reached the reading line;
 * keyboard focus in a tool's copy brings that tool up instead, until a scroll
 * moves on to another tool. The shown tool's recording plays while the stage
 * is on screen, unless the reader has paused it; each tool keeps its own pause.
 *
 * It holds the layout it is sent, and nothing else of the page: the scroll is
 * passed in as it moves, so it keeps no time and reads no DOM.
 */
export function createStageDirector({
  tools,
  focused: focusedAtStart,
}: {
  /** How many tools the stage holds. */
  tools: number;
  /** The tool already holding keyboard focus (restored by Back, say), or null. */
  focused: number | null;
}) {
  let viewport = 1;
  /** Each tool's copy block, once measured. */
  let boxes: readonly ToolBox[] | null = null;
  let shown = -1;
  let progress = 0;
  /** The tool the scroll puts on the stage (none until first scrolled). */
  let byScroll = -1;
  /** The tool holding keyboard focus, which wins until the scroll moves on. */
  let focused = focusedAtStart;
  let paused: readonly boolean[] = Array.from({ length: tools }, () => false);
  let onScreen = false;

  /** The tool at the reading line for a scroll position, and how far through the set it is. */
  function reading(y: number, laidOut: readonly ToolBox[]) {
    const line = y + viewport * READING_LINE;
    let index = 0;
    laidOut.forEach((box, i) => {
      if (box.top <= line) index = i;
    });
    const first = laidOut[0];
    const last = laidOut.at(-1);
    if (!first || !last) return { index, progress: 0 };
    // From the first block's top on the line to the last block's foot on it.
    const span = last.top + last.height - first.top;
    const progress =
      span > 0
        ? Math.min(1, Math.max(0, (line - first.top) / span))
        : Number(line >= first.top);
    return { index, progress };
  }

  return {
    /**
     * The page laid out (at first, and after a resize, say): the viewport's
     * height and each tool's copy block. A scroll follows, to place the stage.
     */
    measure(height: number, laidOut: readonly ToolBox[]) {
      viewport = height;
      boxes = laidOut;
    },

    /** The page scrolled to `y`. */
    scroll(y: number) {
      if (!boxes) return;
      const now = reading(y, boxes);
      // A scroll that moves on to another tool takes the stage back from
      // focus. The first scroll only places the stage, so focus restored at
      // the start holds it.
      if (byScroll >= 0 && now.index !== byScroll) focused = null;
      byScroll = now.index;
      progress = now.progress;
      shown = focused ?? byScroll;
    },

    /** Keyboard focus came into a tool's copy, the page scrolled to `y`. */
    focusIn(tool: number, y: number) {
      focused = tool;
      if (!boxes) return;
      // Measured from where focusing has scrolled the page to, so only a
      // later scroll hands the stage back.
      byScroll = reading(y, boxes).index;
      shown = tool;
    },

    /**
     * Keyboard focus left a tool's copy, for `next` (the tool it moves on to)
     * or for somewhere else (null).
     */
    focusOut(next: number | null) {
      // Moving on to another tool is that tool's focusIn: the stage never
      // flashes back to the scroll's tool on the way.
      if (next !== null || focused === null) return;
      focused = null;
      shown = byScroll;
    },

    /** The reader pressed a tool's Pause/Play button. */
    toggle(tool: number) {
      paused = paused.map((p, i) => (i === tool ? !p : p));
    },

    /** The stage came on screen, or went off it. */
    visibility(visible: boolean) {
      onScreen = visible;
    },

    state(): StageState {
      const playing = shown >= 0 && onScreen && !paused[shown] ? shown : null;
      return { shown, progress, playing, paused };
    },
  };
}
