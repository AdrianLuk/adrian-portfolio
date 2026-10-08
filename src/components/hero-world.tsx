"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ScrollRoute } from "./scroll-route";
// Plain data only: Three.js and GSAP load after the first paint.
import { sitePanels } from "./home-panels";
import {
  createOpening,
  CREDIT_CARD,
  CREDIT_SKIP,
  HERO_ACTION,
  type OpeningPhase,
  type OpeningStage,
} from "./opening";
import { measurePlate, PLATE_ECHO } from "./plate-measure";
import { prefersReducedMotion, subscribeToMotion } from "./reduced-motion";
import { useWorldState } from "./use-world-state";
import { joinsLiveWorld, worldHost } from "./world-host";
import type { World } from "./world/scene";
import { parseWeather, type Weather } from "./world/weather";

/** On the server the preference is unknown: the hero is "loading". */
const serverPhase = (): OpeningPhase => "loading";

/** The flight's timeline, and GSAP with it, loaded only when it flies. */
const loadFlight = () =>
  import("./flight-timeline").then(({ playFlight }) => playFlight);

/** The hero's page, as the Opening plays on it. */
function heroStage(root: HTMLElement, world: () => World | null): OpeningStage {
  const cards = Array.from(
    root.querySelectorAll<HTMLElement>(CREDIT_CARD.selector),
  );
  const skip = root.querySelector<HTMLElement>(CREDIT_SKIP.selector);
  const action = root.querySelector<HTMLElement>(HERO_ACTION.selector);
  return {
    cards: cards.length,
    measure() {
      const foot = skip?.getBoundingClientRect();
      return {
        width: root.clientWidth,
        height: root.clientHeight,
        skipTop: foot?.height
          ? foot.top - root.getBoundingClientRect().top
          : null,
        // offsetLeft/Top are the layout position, untouched by transforms.
        cards: cards.map((el) => ({
          left: el.offsetLeft,
          top: el.offsetTop,
          width: el.offsetWidth,
          height: el.offsetHeight,
        })),
      };
    },
    project: (index, spot) => world()?.placeCredit(index, spot) ?? null,
    // By transform only, so nothing reflows.
    show(index, opacity, at) {
      const el = cards[index];
      el.style.opacity = String(opacity);
      if (!at) return;
      el.style.textAlign = at.align;
      el.style.transform = `translate(${at.dx}px, ${at.dy}px) scale(${at.scale})`;
    },
    clear() {
      for (const el of cards) {
        el.style.removeProperty("opacity");
        el.style.removeProperty("transform");
      }
    },
    focusAction: () => action?.focus(),
  };
}

/**
 * The hero's root, its world and its Opening. With motion allowed, the hero
 * holds its copy back from the first paint, and the Opening plays (see
 * opening.ts); the copy lands once it settles, and the scroll route carries
 * the camera on from there. The Three.js scene loads after first paint and
 * joins the flight wherever the timeline has got to.
 */
export function HeroWorld({
  label,
  weather,
  className = "",
  children,
}: {
  label: string;
  /** Toronto's weather, as the server last saw it. */
  weather: Weather;
  className?: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The world's canvas, once it stands in this page's own. */
  const worldCanvasRef = useRef<HTMLCanvasElement>(null);
  // The weather the page arrived with: the world takes it once home claims it.
  const weatherRef = useRef(weather);
  const host = worldHost();
  // Home arriving by client navigation into a live world joins it settled:
  // the Opening never replays. (Never on a direct load, whose first render
  // matches the server's.)
  const [opening] = useState(() =>
    createOpening({
      rejoined: joinsLiveWorld(),
      reduced: typeof window !== "undefined" && prefersReducedMotion(),
      director: host.director,
      load: loadFlight,
    }),
  );
  const phase = useSyncExternalStore(
    opening.subscribe,
    opening.phase,
    serverPhase,
  );
  const worldState = useWorldState();

  // Claims the world before the page paints, so home arriving into a live
  // world (under a transit, say) never shows a frame without it.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const pageCanvas = canvasRef.current;
    if (!root || !pageCanvas) return;
    // So a world that draws before the timeline has loaded never shows the
    // settled frame first.
    opening.prepare();
    // The world's canvas, standing in this page's own from now on.
    worldCanvasRef.current = host.attach(pageCanvas, {
      kind: "hero",
      // ?weather=snow|rain|clear previews a condition. Read here, not on the
      // server, so the page itself stays static.
      weather:
        parseWeather(
          new URLSearchParams(window.location.search).get("weather"),
        ) ?? weatherRef.current,
      measure: (canvas) => measurePlate(canvas, root),
    });
    // The world stays, parked, for the next page that wants it.
    return () => host.detach(pageCanvas);
  }, [host, opening]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = worldCanvasRef.current;
    if (!root || !canvas) return;

    const { director } = host;
    const world = () => host.world();
    const stage = heroStage(root, world);
    let scrollRoute: ScrollRoute | null = null;
    /** True from asking for the scroll route until it is stopped. */
    let routing = false;
    let cancelled = false;

    /** Once settled, with motion allowed, scrolling carries the camera on. */
    async function startRoute() {
      if (routing) return;
      routing = true;
      let createScrollRoute;
      try {
        ({ createScrollRoute } = await import("./scroll-route"));
      } catch {
        // A stale chunk after a deploy, say: the camera stays settled.
        routing = false;
        return;
      }
      // Called off meanwhile, or already started by a call that loaded first.
      if (cancelled || !routing || scrollRoute) return;
      scrollRoute = createScrollRoute({
        director,
        panels: sitePanels(),
        locateSite: () => world()?.placeSite ?? null,
      });
    }

    function stopRoute() {
      routing = false;
      scrollRoute?.kill();
      scrollRoute = null;
    }

    // The scroll route runs only while the Opening has settled: never while
    // it plays, nor under reduced motion, back to the settled frame.
    const followPhase = () => {
      if (opening.phase() === "settled") startRoute();
      else stopRoute();
    };
    const unfollow = opening.subscribe(followPhase);
    followPhase();

    const onClick = (event: MouseEvent) => {
      if ((event.target as Element).closest(`${CREDIT_SKIP.selector} button`)) {
        opening.skip();
      }
    };
    root.addEventListener("click", onClick);

    /** Builds the world, if no page has yet; without one, the flight ends. */
    async function start() {
      const built = await host.start();
      // No world to fly through: end the flight so the headline shows.
      if (!built && !cancelled) opening.end();
    }

    const resize = new ResizeObserver(() => {
      world()?.layout();
      opening.place();
    });
    resize.observe(root);
    // The canvas too: it fills the hero, or the viewport once it is held
    // behind the whole page.
    resize.observe(canvas);
    const echo = root.querySelector(PLATE_ECHO.selector);
    if (echo) resize.observe(echo);

    // (The world host stills or wakes the world itself.) A preference
    // changed since the hero rendered lands it now.
    const onPreference = () => opening.reducedMotion(prefersReducedMotion());
    const unsubscribeMotion = subscribeToMotion(onPreference);
    onPreference();

    // A frame callback runs just before the next paint; the task it queues
    // runs after it. Both the flight's timeline and the world load from there,
    // so neither library holds up the first paint.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        opening.fly(stage);
        start();
      }, 0);
    });

    return () => {
      cancelled = true;
      opening.stop();
      unfollow();
      stopRoute();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      resize.disconnect();
      root.removeEventListener("click", onClick);
      unsubscribeMotion();
    };
    // The host is the visit's one world, and the Opening the hero's own.
  }, [host, opening]);

  // The canvas fills the hero and fades into the page below it, until the
  // camera flies: then it is held fixed behind the whole page (the page sets
  // the stacking context it sits at the back of), and the scroll carries the
  // camera on. Under reduced motion it stays the hero's still frame.
  return (
    <section
      ref={rootRef}
      aria-label={label}
      data-state={phase}
      data-world={worldState}
      className={`group relative overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 size-full opacity-0 [mask-image:linear-gradient(to_bottom,black_88%,transparent)] opening:fixed opening:h-lvh opening:[mask-image:none] group-data-[state=settled]:fixed group-data-[state=settled]:h-lvh group-data-[state=settled]:[mask-image:none] group-data-[world=drawn]:opacity-100 motion-safe:transition-opacity motion-safe:duration-1000"
      />
      {children}
    </section>
  );
}
