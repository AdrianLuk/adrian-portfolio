/**
 * The Player tools scene's link to the page, as pure maths: which tool is on
 * the stage for a scroll position, and how far through the set the reader is.
 * The page scrolls natively; this only reads where it has got to.
 */

/** A tool's copy block on the page, in document pixels. */
export type ToolBox = { top: number; height: number };

/** Where a tool takes the stage: its copy block's top crossing this share of the viewport. */
export const READING_LINE = 0.5;

export function activeTool(
  scroll: number,
  viewport: number,
  tools: readonly ToolBox[],
) {
  const line = scroll + viewport * READING_LINE;
  let index = 0;
  tools.forEach((tool, i) => {
    if (tool.top <= line) index = i;
  });
  const first = tools[0];
  const last = tools.at(-1);
  if (!first || !last) return { index, progress: 0 };
  // From the first block's top on the line to the last block's foot on it.
  const span = last.top + last.height - first.top;
  const progress =
    span > 0
      ? Math.min(1, Math.max(0, (line - first.top) / span))
      : Number(line >= first.top);
  return { index, progress };
}
