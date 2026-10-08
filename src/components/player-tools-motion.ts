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
import { createStageDirector, type StageState } from "./stage-director";

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
  /** What the stage shows now. */
  let drawn: StageState = director.state();

  /** Brings the stage up to the director: the tools crossfade, or cut. */
  function draw(fade: boolean) {
    const next = director.state();
    if (next.shown !== drawn.shown) {
      frames.forEach((frame, i) => {
        const vars = { autoAlpha: i === next.shown ? 1 : 0, overwrite: true };
        if (fade) {
          gsap.to(frame, { ...vars, duration: FADE, ease: "power1.out" });
        } else gsap.set(frame, vars);
      });
    }
    if (bar && next.progress !== drawn.progress) {
      gsap.set(bar, { scaleX: next.progress });
    }
    next.paused.forEach((paused, i) => {
      if (paused !== drawn.paused[i])
        toggles[i]?.toggleAttribute(PAUSED, paused);
    });
    if (next.playing !== drawn.playing) {
      videos.forEach((video, i) => {
        if (!video) return;
        if (i === next.playing) video.play().catch(() => {});
        else video.pause();
      });
    }
    drawn = next;
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
    director.focusOut(keyboardFocus(event.relatedTarget));
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

  const observer = new IntersectionObserver(([entry]) => {
    director.visibility(entry.isIntersecting);
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
