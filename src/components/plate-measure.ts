import { mark } from "./marks";
import type { Measurement } from "./world/scene";

/** Each word of the headline the name plate stands on, as the page marks it. */
export const PLATE_WORD = mark("data-plate-word");
/** The headline itself, the plate's display echo. */
export const PLATE_ECHO = mark("data-plate-echo");

/**
 * Canvas-relative boxes of each headline word, from the text itself, as they
 * stand with the page at the top (where the camera is settled): a canvas held
 * fixed behind the page stays put as the headline scrolls away.
 */
export function measurePlate(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
): Measurement {
  const host = canvas.getBoundingClientRect();
  const scrolled =
    getComputedStyle(canvas).position === "fixed" ? window.scrollY : 0;
  const range = document.createRange();
  const words = Array.from(
    root.querySelectorAll<HTMLElement>(PLATE_WORD.selector),
    (el) => {
      range.selectNodeContents(el);
      const box = range.getBoundingClientRect();
      return {
        text: (el.textContent ?? "").toUpperCase(),
        rect: {
          left: box.left - host.left,
          top: box.top + scrolled - host.top,
          width: box.width,
          height: box.height,
        },
      };
    },
  );
  return { width: host.width, height: host.height, words };
}
