import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { activeTool, type ToolBox } from "./active-tool";

gsap.registerPlugin(ScrollTrigger);

/** Seconds of the crossfade between tools: short, and nothing but opacity. */
const FADE = 0.35;

/**
 * The Player tools' stage, in step with the page: ScrollTrigger reads the
 * native scroll (nothing snapped, nothing smoothed) and the stage shows the
 * tool whose copy has reached the reading line, or the one holding focus. The
 * active tool's recording plays while the stage is on screen; the rest pause.
 */
export function createPlayerToolsMotion(root: HTMLElement) {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>("[data-tool-copy]"),
  );
  const stage = root.querySelector<HTMLElement>("[data-tool-stage]")!;
  const frames = Array.from(
    stage.querySelectorAll<HTMLElement>("[data-stage-tool]"),
  );
  const videos = frames.map((f) => f.querySelector("video"));
  const bar = stage.querySelector<HTMLElement>("[data-stage-progress]");

  let boxes: ToolBox[] = [];
  let viewport = 1;
  let shown = -1;
  /** The tool the scroll puts on the stage. */
  let byScroll = 0;
  /** The tool holding focus, which wins over the scroll. */
  let focused: number | null = null;
  let onScreen = false;

  function measure() {
    viewport = window.innerHeight;
    boxes = blocks.map((el) => ({
      top: el.getBoundingClientRect().top + window.scrollY,
      height: el.offsetHeight,
    }));
  }

  function playActive() {
    videos.forEach((video, i) => {
      if (!video) return;
      if (i === shown && onScreen) video.play().catch(() => {});
      else video.pause();
    });
  }

  function show(index: number, fade: boolean) {
    if (index === shown) return;
    frames.forEach((frame, i) => {
      const vars = { autoAlpha: i === index ? 1 : 0, overwrite: true };
      if (fade) gsap.to(frame, { ...vars, duration: FADE, ease: "power1.out" });
      else gsap.set(frame, vars);
    });
    shown = index;
    playActive();
  }

  function update(scroll: number, fade: boolean) {
    const { index, progress } = activeTool(scroll, viewport, boxes);
    byScroll = index;
    if (bar) gsap.set(bar, { scaleX: progress });
    show(focused ?? index, fade);
  }

  const blockOf = (node: EventTarget | null) =>
    node instanceof Node ? blocks.findIndex((b) => b.contains(node)) : -1;

  function onFocusIn(event: FocusEvent) {
    const i = blockOf(event.target);
    if (i < 0) return;
    focused = i;
    show(i, true);
  }

  function onFocusOut(event: FocusEvent) {
    // Moving on to another tool is that tool's focusin.
    if (blockOf(event.relatedTarget) >= 0) return;
    focused = null;
    show(byScroll, true);
  }

  const observer = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    playActive();
  });

  // A refresh (a resize, say) re-measures the copy and puts the right tool up
  // at once, as does arriving mid-section.
  const trigger = ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => update(self.scroll(), true),
    onRefresh: (self) => {
      measure();
      update(self.scroll(), false);
    },
  });
  measure();
  const held = blockOf(document.activeElement);
  focused = held >= 0 ? held : null;
  update(window.scrollY, false);
  observer.observe(stage);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);

  return {
    /** Stops for good, handing the stage back as the page drew it. */
    kill() {
      trigger.kill();
      observer.disconnect();
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      gsap.killTweensOf(frames);
      gsap.set(frames, { clearProps: "opacity,visibility" });
      if (bar) gsap.set(bar, { clearProps: "transform" });
      for (const video of videos) video?.pause();
    },
  };
}
