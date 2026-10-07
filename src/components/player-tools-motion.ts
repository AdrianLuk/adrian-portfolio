import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { activeTool, type ToolBox } from "./active-tool";

gsap.registerPlugin(ScrollTrigger);

/** Seconds of the crossfade between tools: short, and nothing but opacity. */
const FADE = 0.35;

/**
 * The Player tools' stage, in step with the page: ScrollTrigger reads the
 * native scroll (nothing snapped, nothing smoothed) and the stage shows the
 * tool whose copy has reached the reading line. Keyboard focus in a tool's
 * copy brings that tool up instead, until a scroll moves on to another tool.
 * The active tool's recording plays while the stage is on screen, unless the
 * reader has paused it with the button in its copy; the rest stay paused.
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
  const toggles = blocks.map((b) =>
    b.querySelector<HTMLButtonElement>("[data-stage-toggle]"),
  );
  const paused = blocks.map(() => false);
  const bar = stage.querySelector<HTMLElement>("[data-stage-progress]");

  let boxes: ToolBox[] = [];
  let viewport = 1;
  let shown = -1;
  /** The tool the scroll puts on the stage (none until first measured). */
  let byScroll = -1;
  /** The tool holding keyboard focus, which wins until the scroll moves on. */
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
      if (i === shown && onScreen && !paused[i]) video.play().catch(() => {});
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
    // A scroll that moves on to another tool takes the stage back from focus.
    if (byScroll >= 0 && index !== byScroll) focused = null;
    byScroll = index;
    if (bar) gsap.set(bar, { scaleX: progress });
    show(focused ?? index, fade);
  }

  const blockOf = (node: EventTarget | null) =>
    node instanceof Node ? blocks.findIndex((b) => b.contains(node)) : -1;

  /** The tool whose copy holds keyboard focus (not a click's), if any. */
  function keyboardFocus(target: EventTarget | null) {
    const i = blockOf(target);
    return i >= 0 && (target as Element).matches(":focus-visible") ? i : null;
  }

  function onFocusIn(event: FocusEvent) {
    const i = keyboardFocus(event.target);
    if (i === null) return;
    // Measured from where focusing has scrolled the page to, so only a later
    // scroll hands the stage back.
    byScroll = activeTool(window.scrollY, viewport, boxes).index;
    focused = i;
    show(i, true);
  }

  function onFocusOut(event: FocusEvent) {
    // Moving on to another tool is that tool's focusin.
    if (keyboardFocus(event.relatedTarget) !== null) return;
    if (focused === null) return;
    focused = null;
    show(byScroll, true);
  }

  function onToggle(event: MouseEvent) {
    const i = toggles.indexOf(
      (event.target as Element).closest<HTMLButtonElement>(
        "[data-stage-toggle]",
      )!,
    );
    if (i < 0) return;
    paused[i] = !paused[i];
    toggles[i]!.toggleAttribute("data-paused", paused[i]);
    playActive();
  }

  const observer = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    playActive();
  });

  // Focus already in a tool's copy (restored by Back, say) counts only if it
  // is keyboard focus.
  focused = keyboardFocus(document.activeElement);
  // Created, it refreshes at once: that measures the copy and puts the right
  // tool up without a fade, as every later refresh (a resize, say) does.
  const trigger = ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => update(self.scroll(), true),
    onRefresh: (self) => {
      measure();
      update(self.scroll(), false);
    },
  });
  observer.observe(stage);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  for (const toggle of toggles) toggle?.addEventListener("click", onToggle);

  return {
    /** Stops for good, handing the stage back as the page drew it. */
    kill() {
      trigger.kill();
      observer.disconnect();
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      for (const toggle of toggles) {
        toggle?.removeEventListener("click", onToggle);
        toggle?.removeAttribute("data-paused");
      }
      gsap.killTweensOf(frames);
      gsap.set(frames, { clearProps: "opacity,visibility" });
      if (bar) gsap.set(bar, { clearProps: "transform" });
      for (const video of videos) video?.pause();
    },
  };
}
