import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { CameraDirector } from "./camera-director";
import { pageLayout } from "./home-panels";
import { LIT_SITES } from "./lit-sites";
import {
  litAt,
  routeAnchors,
  scrollFor,
  stopAt,
  type PanelBox,
} from "./route-anchors";
import type { World } from "./world/scene";

gsap.registerPlugin(ScrollTrigger);

/**
 * Seconds the camera takes to catch up with the scroll: enough to smooth a
 * wheel's steps and to ease onto the route if the page is already scrolled
 * when the opening lands, little enough that it moves at the visitor's pace.
 */
const SCRUB = 0.3;

/** How much of its site's sideways motion a panel follows, and the room kept at the screen's edges. */
const PANEL_PARALLAX = 0.3;
const EDGE = 16;


/**
 * The scroll route: ScrollTrigger scrubs the camera along the route as the
 * page scrolls natively (nothing pinned, nothing snapped, scroll behaviour
 * untouched), each site lighting as its panel enters. The panels stay in the
 * page's flow, so they read, tab and scroll as usual; each drifts a little
 * sideways with its site as the camera passes, and stands where the page put
 * it when the camera is at its stop.
 */
export function createScrollRoute({
  director,
  panels,
  locateSite,
}: {
  /** Told the stop the scroll puts the camera at, and how lit each site is. */
  director: Pick<CameraDirector, "scrolled" | "scrollStopped" | "stop">;
  /** The Highlights' panels, one per Lit site, in the Lit sites' order. */
  panels: readonly HTMLElement[];
  /**
   * The world's site finder, once it has loaded. Its canvas is held fixed
   * over the viewport while the route runs, so canvas pixels are viewport
   * pixels.
   */
  locateSite: () => World["placeSite"] | null;
}) {
  /** The scroll position the camera is at: the page's, smoothed by the scrub. */
  const scroll = { y: 0 };
  let boxes: PanelBox[] = [];
  let anchors: number[] = [0];
  let viewport = 1;
  const shifts = panels.map(() => 0);

  function measure() {
    const layout = pageLayout(panels, ScrollTrigger.maxScroll(window));
    viewport = layout.viewport;
    boxes = [...layout.panels];
    anchors = routeAnchors(layout);
  }

  /** Sets each panel beside its site, in step with the camera. */
  function placePanels() {
    const locate = locateSite();
    const width = document.documentElement.clientWidth;
    // Every read, then every write, so the page lays out once.
    const next = panels.map((el, i) => {
      const atStop = locate?.(i, i + 1);
      if (!locate || !atStop) return 0;
      // Once the camera flies on past its stop, a site runs off its own side
      // of the screen and then falls behind the camera, where it has no place
      // on screen: the panel holds at that edge rather than snapping back.
      const now = locate(i);
      const x = now
        ? Math.min(Math.max(now.x, 0), width)
        : LIT_SITES[i].side > 0
          ? width
          : 0;
      const box = el.getBoundingClientRect();
      const left = box.left - shifts[i];
      const right = box.right - shifts[i];
      const want = PANEL_PARALLAX * (x - atStop.x);
      return Math.round(
        Math.min(Math.max(want, EDGE - left), Math.max(0, width - EDGE - right)),
      );
    });
    next.forEach((shift, i) => {
      if (shift === shifts[i]) return;
      shifts[i] = shift;
      panels[i].style.transform = shift ? `translateX(${shift}px)` : "";
    });
  }

  function update() {
    const lit = boxes.map((box, i) => {
      const amount = litAt(scroll.y, box, viewport);
      panels[i].toggleAttribute("data-lit", amount >= 0.5);
      return amount;
    });
    director.scrolled(stopAt(scroll.y, anchors), lit);
    placePanels();
  }

  measure();
  // The camera picks up where the director has it (the settled view, or
  // where a Transit home landed), and eases after the scroll from there.
  scroll.y = scrollFor(director.stop(), anchors);
  // The camera eases after the scroll from wherever it has got to, so a
  // refresh (after a resize, say) can only re-measure the route, never send
  // the camera back along it.
  const follow = gsap.quickTo(scroll, "y", {
    duration: SCRUB,
    ease: "expo.out",
    onUpdate: update,
  });
  const trigger = ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => follow(self.scroll()),
    onRefresh(self) {
      measure();
      update();
      follow(self.scroll());
    },
  });

  return {
    /** Stops for good, handing the panels back to the page as it drew them. */
    kill() {
      trigger.kill();
      follow.tween.kill();
      director.scrollStopped();
      for (const el of panels) {
        el.style.removeProperty("transform");
        el.removeAttribute("data-lit");
      }
    },
  };
}

export type ScrollRoute = ReturnType<typeof createScrollRoute>;
