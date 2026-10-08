import type { CameraDirector } from "./camera-director";

/** How far a Highlight's panel tilts toward the pointer at its edge, in degrees. */
export const PANEL_TILT = 3;

/** The depth a tilted panel is seen from, in px: deep enough to stay a panel, not a card flip. */
const PERSPECTIVE = 1200;

type Box = { left: number; top: number; width: number; height: number };

/**
 * The tilt that turns a panel toward the pointer at (x, y): the side nearest
 * the pointer turns away, as a lit sheet turns to face a light. Degrees about
 * each axis, at most PANEL_TILT at the panel's edge.
 */
export function tiltToward(box: Box, x: number, y: number) {
  const clamp = (v: number) => Math.min(1, Math.max(-1, v));
  const across = clamp(((x - box.left) / box.width) * 2 - 1);
  const down = clamp(((y - box.top) / box.height) * 2 - 1);
  // Exact zeros rather than -0, so a centred pointer reads as no tilt.
  return {
    x: down ? -down * PANEL_TILT : 0,
    y: across ? across * PANEL_TILT : 0,
  };
}

/** A tilt as a CSS transform. */
export function tiltTransform({ x, y }: { x: number; y: number }) {
  return `perspective(${PERSPECTIVE}px) rotateX(${x.toFixed(2)}deg) rotateY(${y.toFixed(2)}deg)`;
}

/**
 * Home's pointer micro-motion, run while the Opening has settled (so only
 * with motion allowed): a mouse or pen leans the camera toward the pointer
 * (the director decides when), and tilts the Highlight panel under it toward
 * it, easing back level as it leaves. Touch moves neither. The panels stay in
 * the page's flow: the tilt is a transform alone (the scroll route moves them
 * with `translate`).
 */
export function createPointerMotion({
  director,
  panels,
}: {
  director: Pick<CameraDirector, "pointerAt">;
  panels: readonly HTMLElement[];
}) {
  let tilted: HTMLElement | null = null;
  let frame = 0;
  let last: PointerEvent | null = null;

  function level() {
    tilted?.style.removeProperty("transform");
    tilted = null;
  }

  /** One frame's reads and writes for the latest move. */
  function apply() {
    frame = 0;
    const event = last;
    if (!event) return;
    director.pointerAt({
      x: (event.clientX / window.innerWidth) * 2 - 1,
      y: (event.clientY / window.innerHeight) * 2 - 1,
    });
    const target = event.target instanceof Node ? event.target : null;
    const panel = target && panels.find((el) => el.contains(target));
    if (panel !== tilted) level();
    if (!panel) return;
    tilted = panel;
    // offsetWidth and offsetHeight ignore the tilt already applied.
    const box = panel.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const tilt = tiltToward(
      {
        left: box.left + (box.width - width) / 2,
        top: box.top + (box.height - height) / 2,
        width,
        height,
      },
      event.clientX,
      event.clientY,
    );
    panel.style.transform = tiltTransform(tilt);
  }

  function onMove(event: PointerEvent) {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    last = event;
    frame ||= requestAnimationFrame(apply);
  }

  /** The pointer has left the page (or the window lost it): all level again. */
  function onGone() {
    last = null;
    cancelAnimationFrame(frame);
    frame = 0;
    director.pointerAt(null);
    level();
  }

  function onOut(event: PointerEvent) {
    if (!event.relatedTarget) onGone();
  }

  window.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerout", onOut);
  window.addEventListener("blur", onGone);

  return {
    /** Stops for good, the camera upright and every panel level. */
    stop() {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", onGone);
      onGone();
    },
  };
}

export type PointerMotion = ReturnType<typeof createPointerMotion>;
