/** Elements a tap never reaches the world through: controls, media and fields. */
const BLOCKS_TAP =
  "a, button, input, textarea, select, label, summary, [contenteditable], [role=button], img, video, svg, iframe, canvas";

/** Whether a computed background colour lets the world show through. */
const seeThrough = (color: string) =>
  color === "transparent" || /[,/]\s*0\)$/.test(color);

/** Whether (x, y) falls on one of `el`'s own lines of text. */
function onText(el: Element, x: number, y: number) {
  const range = document.createRange();
  for (const node of el.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether a tap or click (its pointerup: iOS sends no click for a tap on
 * bare page) lands on bare world: the primary button, not on a control, a
 * field, media, a line of copy, or anything with a background of its own (a
 * panel, the header), and not while a game is in play, where taps are its
 * input. A touch that scrolls ends in pointercancel, so never reaches here.
 */
export function tapsBareWorld(event: PointerEvent) {
  const target = event.target;
  if (event.button !== 0 || !event.isPrimary) return false;
  if (!(target instanceof Element)) return false;
  if (
    document.querySelector("[data-game-in-play]") ||
    target.closest(BLOCKS_TAP)
  ) {
    return false;
  }
  for (
    let el: Element | null = target;
    el && el !== document.body && el !== document.documentElement;
    el = el.parentElement
  ) {
    const { backgroundColor, backgroundImage } = getComputedStyle(el);
    if (backgroundImage !== "none" || !seeThrough(backgroundColor)) return false;
  }
  return !onText(target, event.clientX, event.clientY);
}
