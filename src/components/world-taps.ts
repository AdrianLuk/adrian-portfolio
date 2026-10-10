/** What a tap on never reaches the world through: controls, media and fields. */
const SOLID =
  "a, button, input, textarea, select, label, summary, [contenteditable], [role=button], img, video, svg, iframe, canvas";

/** Whether a computed background colour lets the world show through. */
const clear = (color: string) =>
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
 * Whether a click or tap lands on bare world: not on a control, a field,
 * media, a line of copy, or anything with a background of its own (a panel,
 * the header), and not while a game is in play, where taps are its input.
 * A keyboard's click (detail 0) never does.
 */
export function tapsBareWorld(event: MouseEvent) {
  const target = event.target;
  if (event.detail === 0 || !(target instanceof Element)) return false;
  if (document.querySelector("[data-game-in-play]") || target.closest(SOLID)) {
    return false;
  }
  for (
    let el: Element | null = target;
    el && el !== document.body && el !== document.documentElement;
    el = el.parentElement
  ) {
    const { backgroundColor, backgroundImage } = getComputedStyle(el);
    if (backgroundImage !== "none" || !clear(backgroundColor)) return false;
  }
  return !onText(target, event.clientX, event.clientY);
}
