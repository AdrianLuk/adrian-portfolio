import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  PAUSED,
  stageProgressSelector,
  stageToggleSelector,
  stageToolSelector,
  toolCopySelector,
  toolStageSelector,
} from "./player-tools-markup";
import { createStageDirector } from "./stage-director";

gsap.registerPlugin(ScrollTrigger);

/** Seconds of the crossfade between tools: short, and nothing but opacity. */
const FADE = 0.35;

/**
 * The Player tools' stage, in step with the page. The Stage director decides
 * which tool is up and whether its recording plays; this is its link to the
 * page. ScrollTrigger reads the native scroll (nothing snapped, nothing
 * smoothed) and measures the copy, an IntersectionObserver tells whether the
 * stage is on screen, and keyboard focus and the Pause/Play buttons come from
 * the copy. After each, the stage catches up with the director.
 */
export function createPlayerToolsMotion(root: HTMLElement) {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>(toolCopySelector),
  );
  const stage = root.querySelector<HTMLElement>(toolStageSelector)!;
  const frames = Array.from(
    stage.querySelectorAll<HTMLElement>(stageToolSelector),
  );
  const videos = frames.map((f) => f.querySelector("video"));
  const toggles = blocks.map((b) =>
    b.querySelector<HTMLButtonElement>(stageToggleSelector),
  );
  const bar = stage.querySelector<HTMLElement>(stageProgressSelector);

  const blockOf = (node: EventTarget | null) =>
    node instanceof Node ? blocks.findIndex((b) => b.contains(node)) : -1;

  /** The tool whose copy holds keyboard focus (not a click's), if any. */
  function keyboardFocus(target: EventTarget | null) {
    const i = blockOf(target);
    return i >= 0 && (target as Element).matches(":focus-visible") ? i : null;
  }

  const director = createStageDirector({
    tools: blocks.length,
    // Focus already in a tool's copy (restored by Back, say) counts only if
    // it is keyboard focus.
    focused: keyboardFocus(document.activeElement),
  });
  /** The tool on the stage, so only a change of tool fades. */
  let shown = -1;

  /**
   * Brings the stage up to the director: a new tool crossfades in, or cuts.
   * The progress, the toggles and every recording's play state are applied
   * in full each time, so a play() the browser refused is tried again.
   */
  function draw(fade: boolean) {
    const state = director.state();
    if (state.shown !== shown) {
      shown = state.shown;
      frames.forEach((frame, i) => {
        const vars = { autoAlpha: i === shown ? 1 : 0, overwrite: true };
        if (fade) {
          gsap.to(frame, { ...vars, duration: FADE, ease: "power1.out" });
        } else gsap.set(frame, vars);
      });
    }
    if (bar) gsap.set(bar, { scaleX: state.progress });
    toggles.forEach((toggle, i) =>
      toggle?.toggleAttribute(PAUSED, state.paused[i]),
    );
    // Playing one that plays, or pausing one that is paused, does nothing.
    videos.forEach((video, i) => {
      if (!video) return;
      if (i === state.playing) video.play().catch(() => {});
      else video.pause();
    });
  }

  function measure() {
    director.measure(
      window.innerHeight,
      blocks.map((el) => ({
        top: el.getBoundingClientRect().top + window.scrollY,
        height: el.offsetHeight,
      })),
    );
  }

  function onFocusIn(event: FocusEvent) {
    const i = keyboardFocus(event.target);
    if (i === null) return;
    director.focusIn(i, window.scrollY);
    draw(true);
  }

  function onFocusOut(event: FocusEvent) {
    // Where focus goes, if to another tool's copy. Not asked whether it is
    // keyboard focus: it has no focus yet to ask of, and a click's focusin
    // won't take the stage anyway.
    const next = blockOf(event.relatedTarget);
    director.focusOut(next >= 0 ? next : null);
    draw(true);
  }

  function onToggle(event: MouseEvent) {
    const i = toggles.indexOf(
      (event.target as Element).closest<HTMLButtonElement>(
        stageToggleSelector,
      )!,
    );
    if (i < 0) return;
    director.toggle(i);
    draw(true);
  }

  // Changes can come batched (on, then off, in one call): the last is now.
  const observer = new IntersectionObserver((entries) => {
    director.visibility(entries.at(-1)!.isIntersecting);
    draw(true);
  });

  // Created, it refreshes at once: that measures the copy and puts the right
  // tool up without a fade, as every later refresh (a resize, say) does.
  const trigger = ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => {
      director.scroll(self.scroll());
      draw(true);
    },
    onRefresh: (self) => {
      measure();
      director.scroll(self.scroll());
      draw(false);
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
        toggle?.removeAttribute(PAUSED);
      }
      gsap.killTweensOf(frames);
      gsap.set(frames, { clearProps: "opacity,visibility" });
      if (bar) gsap.set(bar, { clearProps: "transform" });
      for (const video of videos) video?.pause();
    },
  };
}
