"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { arrivesAtShootout, overPlace } from "@/app/styles";
import type { shootout } from "@/content/site";
import { afterFirstPaint } from "./after-first-paint";
import { earnAchievement } from "./achievements";
import {
  gameButton,
  gamePrimary,
  overlayTitle,
  SlowMode,
  StepsAside,
} from "./game-ui";
import { REDUCED_MOTION } from "./reduced-motion";
import { useWorldState } from "./use-world-state";
import { worldHost, type WorldState } from "./world-host";
import { worldTransits } from "./world-transits";
import {
  createGame,
  resetGame,
  setPaused,
  setSlow,
  startGame,
  step,
  type Game,
  type GameEvent,
  type Input,
} from "./shootout/rules";
import type { ShootoutView } from "./shootout/scene";

type Copy = (typeof shootout)["game"];

/** The longest step a frame may take, in seconds: a long stall can't jump the game. */
const MAX_STEP = 0.1;

/** How fast the arrow keys turn the aim, radians a second. */
const KEY_TURN = 1.6;

/** Radians the aim turns per pixel of a captured mouse's movement. */
const MOUSE_TURN = 0.0022;

/** How much faster than the thumb a drag turns the aim: a quick flick crosses the Arena. */
const DRAG_TURN = 1.8;
/** How much slower a drag turns while the crosshair is over a bot, as a console's aim assist does: a far head is a few pixels across. */
const OVER_BOT_TURN = 0.5;

/**
 * A lifting thumb rolls: its last moves, within `ms` of the lift and
 * `px` CSS pixels in all, are undone before the shot, so it goes where the
 * crosshair rested. A bigger move then is a flick, and stands.
 */
const LIFT = { ms: 90, px: 24 };

/** How far a press may move, in CSS pixels, and still count as a click, not a drag. */
const CLICK_SLOP = 10;

/** How long a kill's score or the ultimate's line stands before a bot up may replace it, in ms. */
const HOLD_LINE_MS = 1500;

/** Where the best score is kept: this browser only. */
const BEST_KEY = "shootout-best";

/** What the game's UI shows: kept in React state, changed only by events. */
type Hud = {
  phase: Game["phase"];
  paused: boolean;
  slow: boolean;
  score: number;
  best: number;
  kills: number;
  headshots: number;
  /** The ultimate's charge, in whole percent. */
  charge: number;
  ult: "charging" | "ready" | "running";
};

const hudFor = (game: Game): Hud => ({
  phase: game.phase,
  paused: game.paused,
  slow: game.slow,
  score: game.score,
  best: game.best,
  kills: game.kills,
  headshots: game.headshots,
  charge: Math.floor(game.charge * 100),
  ult: game.ult ? "running" : game.charge >= 1 ? "ready" : "charging",
});

function readBest() {
  try {
    return Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0);
  } catch {
    return 0;
  }
}

function keepBest(best: number) {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // Kept for this visit only.
  }
}

/**
 * The Shootout, played in the world on the Arena's stage roof: the bots,
 * the pads and the six-shooter drawn into the world's own scene (their
 * Three.js loaded after the first paint, and built once any Transit has
 * landed), the game's own UI over it, and a polite live region announcing
 * each bot up and where, headshots, the ultimate and the score. As the
 * Derby's, the page's copy stands over the view before Start, steps aside
 * in play, the view filling the screen with only the score, Reset, Pause
 * and the ultimate's ring over it, and returns at a pause.
 *
 * On a phone, dragging aims and lifting the thumb shoots (a lift in the
 * gap between shots fires as it ends; a second finger does nothing). With
 * a mouse, a click captures it to aim (Esc frees it) and a click shoots;
 * where it can't be captured, dragging aims and a click shoots. Keys:
 * arrows aim, Space shoots, N snaps to the next bot in view, Q is the
 * ultimate, Esc or P pauses. Under reduced motion slow mode starts on, and
 * nothing moves before Start.
 */
export function ShootoutGame({
  copy,
  describedBy,
  intro,
  outro,
  corners,
}: {
  copy: Copy;
  /** The id of the page's controls hint, which describes the view. */
  describedBy: string;
  /** The page's heading and hint, and its link back, over the view. */
  intro: ReactNode;
  outro: ReactNode;
  /** The game's panel's corner brackets, in the Arena's light. */
  corners: ReactNode;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const viewRef = useRef<ShootoutView | null>(null);
  const gameRef = useRef<Game>(createGame({ spots: [] }));
  const frameRef = useRef(0);
  /** Input waiting for the next frame. */
  const inputRef = useRef<Input>({});
  /** Arrow keys held. */
  const keysRef = useRef(new Set<string>());
  /** The one pointer aiming by drag, and how far it has moved. */
  const dragRef = useRef<{
    id: number;
    x: number;
    y: number;
    moved: number;
    type: string;
    /** Its latest turns of the aim, for undoing a lift's roll. */
    recent: { t: number; yaw: number; pitch: number; px: number }[];
  } | null>(null);
  /** The last pointer to press: touch gets aim assist. */
  const touchRef = useRef(false);
  const [reticles, setReticles] = useState<ReturnType<ShootoutView["reticles"]>>([]);
  const [hit, setHit] = useState<{ n: number; head: boolean } | null>(null);

  const [hosted, setHosted] = useState<"waiting" | "hosted" | "failed">("waiting");
  const world = useWorldState();
  const view: WorldState =
    world === "unavailable" || hosted === "failed"
      ? "unavailable"
      : world === "drawn" && hosted === "hosted"
        ? "drawn"
        : "pending";
  const [announcement, setAnnouncement] = useState("");
  const [hud, setHud] = useState<Hud>(() => hudFor(createGame({ spots: [] })));

  /** When a line a screen reader must hear (a kill's score, the ultimate) was last said. */
  const saidAtRef = useRef(0);

  /**
   * What a screen reader hears of the frame's events, in a line. A bot up
   * waits out a moment after a kill's score or the ultimate's line, so the
   * next pop-up never cuts it off.
   */
  const announce = useCallback(
    (events: readonly GameEvent[], game: Game) => {
      const view = viewRef.current;
      const lines: string[] = [];
      const holding = performance.now() - saidAtRef.current < HOLD_LINE_MS;
      for (const event of events) {
        if (event.type === "up" && view && !holding) {
          const where = copy.where[game.spots[event.spot].kind];
          const way = copy.direction[view.directionOf(event.spot)];
          lines.push(`${copy.up} ${where}, ${way}.`);
        } else if (event.type === "kill") {
          if (event.head) lines.push(copy.headshot);
          if (event.long) lines.push(copy.longShot);
          lines.push(`${copy.scoreLine} ${game.score}.`);
        } else if (event.type === "ult-ready") {
          lines.push(copy.ultimate.readyLine);
        } else if (event.type === "ult-start") {
          lines.push(copy.ultimate.runningLine);
        }
      }
      if (events.some((e) => e.type !== "up" && e.type !== "shot" && e.type !== "hit")) {
        saidAtRef.current = performance.now();
      }
      if (lines.length) setAnnouncement(lines.join(" "));
    },
    [copy],
  );

  /** The game loop: one step a frame while the game runs, then a draw. */
  const loop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_STEP);
      last = now;
      const view = viewRef.current;
      if (!view) return;
      // Held arrows turn the aim.
      const keys = keysRef.current;
      const turn = KEY_TURN * dt;
      const yaw = (keys.has("ArrowLeft") ? turn : 0) - (keys.has("ArrowRight") ? turn : 0);
      const pitch = (keys.has("ArrowUp") ? turn : 0) - (keys.has("ArrowDown") ? turn : 0);
      if (yaw || pitch) view.look(yaw, pitch);

      const input = inputRef.current;
      inputRef.current = {};
      const before = gameRef.current;
      const game = step(before, dt, input, view.sight(touchRef.current));
      gameRef.current = game;
      view.draw(game, dt, !game.slow);

      for (const event of game.events) {
        if (event.type === "hit") setHit({ n: performance.now(), head: event.head });
        if (event.type === "three-for-one") earnAchievement("three-for-one");
      }
      announce(game.events, game);
      if (game.best > before.best) keepBest(game.best);
      const locks = view.reticles(game);
      setReticles((shown) => (shown.length === 0 && locks.length === 0 ? shown : locks));
      const next = hudFor(game);
      setHud((shown) =>
        (Object.keys(next) as (keyof Hud)[]).every((key) => shown[key] === next[key]) ? shown : next,
      );
      if (game.phase === "playing" && !game.paused) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [announce]);

  // Three.js is the page's heaviest code: it never holds up the first paint.
  useEffect(() => {
    const host = worldHost();
    let cancelled = false;
    async function start() {
      // Slow mode starts on under reduced motion, before Start can be pressed.
      const slow = window.matchMedia(REDUCED_MOTION).matches;
      gameRef.current = createGame({ spots: [], slow, best: readBest() });
      setHud(hudFor(gameRef.current));
      try {
        const [{ createShootoutView }, live] = await Promise.all([
          import("./shootout/scene"),
          host.start(),
        ]);
        // Built (its shaders compiled) only once any Transit has landed, so
        // it doesn't stutter. Without a world, its own state says so.
        if (cancelled || !live) return;
        await worldTransits().landed();
        if (cancelled) return;
        const created = await createShootoutView(live.arena);
        if (cancelled) {
          created.dispose();
          return;
        }
        viewRef.current = created;
        gameRef.current = { ...gameRef.current, spots: created.spots };
        setHosted("hosted");
      } catch {
        // A stale chunk after a deploy, say.
        if (!cancelled) setHosted("failed");
      }
    }
    const cancelStart = afterFirstPaint(start);
    return () => {
      cancelled = true;
      cancelStart();
      cancelAnimationFrame(frameRef.current);
      if (document.pointerLockElement) document.exitPointerLock();
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, []);

  const pause = useCallback(
    (paused: boolean) => {
      const game = gameRef.current;
      if (game.phase !== "playing" || game.paused === paused) return;
      inputRef.current = {};
      keysRef.current.clear();
      dragRef.current = null;
      gameRef.current = setPaused(game, paused);
      setHud(hudFor(gameRef.current));
      setAnnouncement(paused ? `${copy.paused.title}. ${copy.paused.line}` : copy.resume);
      if (paused) {
        cancelAnimationFrame(frameRef.current);
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        loop();
      }
    },
    [copy, loop],
  );

  // A hidden tab pauses the game.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pause(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);

  // Paused: focus the way back in. (Playing, the view has focus: it takes the keys.)
  useEffect(() => {
    if (hud.paused) resumeRef.current?.focus();
  }, [hud.paused]);

  function begin() {
    inputRef.current = {};
    const fresh = startGame(gameRef.current);
    gameRef.current = fresh;
    viewRef.current?.resetAim();
    setHud(hudFor(fresh));
    setAnnouncement(copy.start.line);
    surfaceRef.current?.focus();
    loop();
  }

  function reset() {
    gameRef.current = resetGame(gameRef.current);
    inputRef.current = {};
    viewRef.current?.resetAim();
    setHud(hudFor(gameRef.current));
    setReticles([]);
    setAnnouncement(`${copy.reset}. ${copy.scoreLine} 0.`);
    surfaceRef.current?.focus();
  }

  function resume() {
    pause(false);
    surfaceRef.current?.focus();
  }

  function toggleSlow(slow: boolean) {
    gameRef.current = setSlow(gameRef.current, slow);
    setHud(hudFor(gameRef.current));
  }

  const shoot = () => {
    inputRef.current = { ...inputRef.current, trigger: true };
  };
  const ultimate = () => {
    inputRef.current = { ...inputRef.current, ultimate: true };
  };

  const playing = hud.phase === "playing";
  /** In play and not paused: the view fills the screen, and the copy steps aside. */
  const filled = playing && !hud.paused;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" || event.key === "p" || event.key === "P") {
      if (!playing) return;
      event.preventDefault();
      if (hud.paused) resume();
      else pause(true);
      return;
    }
    // The view takes the game's keys; the buttons keep their own.
    if (event.target !== surfaceRef.current || !filled) return;
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      keysRef.current.add(event.key);
    } else if (event.key === " ") {
      event.preventDefault();
      touchRef.current = false;
      if (!event.repeat) shoot();
    } else if (event.key === "q" || event.key === "Q") {
      event.preventDefault();
      if (!event.repeat) ultimate();
    } else if (event.key === "n" || event.key === "N") {
      event.preventDefault();
      viewRef.current?.snapToNext(gameRef.current);
    }
  }

  function onKeyUp(event: KeyboardEvent<HTMLDivElement>) {
    keysRef.current.delete(event.key);
  }

  const captured = () => document.pointerLockElement === surfaceRef.current;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!filled) return;
    touchRef.current = event.pointerType !== "mouse";
    if (captured()) {
      if (event.button === 0) shoot();
      return;
    }
    // A second finger does nothing: one thumb aims.
    if (dragRef.current || !event.isPrimary) return;
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: 0,
      type: event.pointerType,
      recent: [],
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const view = viewRef.current;
    if (!view || !filled) return;
    if (captured()) {
      view.look(-event.movementX * MOUSE_TURN, -event.movementY * MOUSE_TURN);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    // Steadier while the ultimate runs, for sweeping the reticles on, and slower still over a bot, to aim at its head.
    // The aim turns with the thumb, as the mouse's does: drag right to turn right, up to look up.
    const game = gameRef.current;
    const k = view.perPixel() * DRAG_TURN * (game.ult ? 0.7 : view.overBot(game) ? OVER_BOT_TURN : 1);
    view.look(-dx * k, -dy * k);
    drag.recent = drag.recent.filter((m) => event.timeStamp - m.t <= LIFT.ms);
    drag.recent.push({ t: event.timeStamp, yaw: -dx * k, pitch: -dy * k, px: Math.abs(dx) + Math.abs(dy) });
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    if (!filled) return;
    if (drag.type === "mouse") {
      // A click: it captures the mouse to aim where it can; where it can't, it shoots.
      if (drag.moved > CLICK_SLOP) return;
      const surface = surfaceRef.current;
      if (!surface?.requestPointerLock) return shoot();
      Promise.resolve(surface.requestPointerLock()).catch(shoot);
      return;
    }
    // Lifting the thumb shoots, from where it rested; while the ultimate runs it only stops aiming.
    if (gameRef.current.ult) return;
    const roll = drag.recent.filter((m) => event.timeStamp - m.t <= LIFT.ms);
    if (roll.reduce((px, m) => px + m.px, 0) <= LIFT.px) {
      viewRef.current?.look(-roll.reduce((s, m) => s + m.yaw, 0), -roll.reduce((s, m) => s + m.pitch, 0));
    }
    shoot();
  }

  const charge = hud.ult === "charging" ? hud.charge / 100 : 1;
  const ringLabel =
    hud.ult === "running"
      ? copy.ultimate.runningLine
      : hud.ult === "ready"
        ? `${copy.ultimate.label}, ${copy.ultimate.ready}`
        : `${copy.ultimate.label}, ${hud.charge}% ${copy.ultimate.charged}`;
  const lit = view === "drawn";

  return (
    <div
      className="flex flex-col gap-6"
      data-world={view}
      data-phase={hud.phase}
      data-paused={hud.paused}
      data-slow={hud.slow}
      data-score={hud.score}
      data-kills={hud.kills}
      data-best={hud.best}
      data-ult={hud.ult}
      // The Recall's B waits while a game is in play (src/components/recall.tsx).
      data-game-in-play={playing || undefined}
      // The site's header steps aside with the copy (see globals.css).
      data-game-filled={filled || undefined}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={(event) => {
        // Focus left the game: the keys can't reach it, so pause.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) pause(true);
      }}
    >
      <StepsAside away={filled} arrives={arrivesAtShootout}>
        {intro}
      </StepsAside>

      {/* The score, Reset and Pause, pinned to the screen's top in play. */}
      <div
        className={`pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 ${filled ? "" : "invisible"}`}
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-2xl bg-night/80 px-3.5 py-2 sm:flex sm:rounded-full font-display text-xs font-bold tracking-wide whitespace-nowrap uppercase [font-stretch:100%] sm:gap-5 sm:px-5 sm:text-lg sm:[font-stretch:110%]">
          <div className="flex items-baseline gap-2">
            <dt className="text-ink/80">{copy.score.score}</dt>
            <dd className="text-cyan tabular-nums">{hud.score}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-ink/80">{copy.score.bots}</dt>
            <dd className="tabular-nums">{hud.kills}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            {/* Short on a phone, where the HUD is two lines. */}
            <dt className="text-ink/80">
              <span aria-hidden="true" className="sm:hidden">
                {copy.score.headshotsShort}
              </span>
              <span className="sr-only sm:not-sr-only">{copy.score.headshots}</span>
            </dt>
            <dd className="tabular-nums">{hud.headshots}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-ink/80">{copy.score.best}</dt>
            <dd className="text-ink tabular-nums">{hud.best}</dd>
          </div>
        </dl>
        <div className="flex flex-col items-end gap-2 sm:flex-row">
          <button
            type="button"
            className={`${gameButton} pointer-events-auto`}
            onClick={reset}
            tabIndex={filled ? 0 : -1}
          >
            {copy.reset}
          </button>
          <button
            type="button"
            className={`${gameButton} pointer-events-auto`}
            onClick={() => (hud.paused ? resume() : pause(true))}
            tabIndex={playing ? 0 : -1}
          >
            {hud.paused ? copy.resume : copy.pause}
          </button>
        </div>
      </div>

      {/* The view, the whole screen: in play it takes the drag, the click and the keys. */}
      <div
        ref={surfaceRef}
        role="application"
        aria-label={copy.label}
        aria-describedby={describedBy}
        tabIndex={playing ? 0 : -1}
        className={`fixed inset-0 z-20 touch-none select-none focus-visible:outline-offset-[-6px] ${filled ? "cursor-crosshair" : "pointer-events-none"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragRef.current = null)}
        onContextMenu={(event) => event.preventDefault()}
      />

      {filled && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-20">
          {hud.ult === "running" && !hud.slow && (
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,color-mix(in_srgb,var(--color-magenta)_32%,transparent)_100%)]" />
          )}
          {/* The crosshair, and a hit's marker, big and red for the head: on the world canvas's middle (50lvh), where a shot goes, not the screen's. */}
          <svg viewBox="-11 -11 22 22" className="absolute top-[50lvh] left-1/2 size-6 -translate-1/2 overflow-visible">
            <g className="stroke-night" strokeWidth="3.5" strokeLinecap="round">
              <path d="M0 -10v5M0 5v5M-10 0h5M5 0h5" />
            </g>
            <g className="stroke-cyan" strokeWidth="2" strokeLinecap="round">
              <path d="M0 -10v5M0 5v5M-10 0h5M5 0h5" />
            </g>
            <circle r="1.6" className="fill-cyan" />
            {hit &&
              (hit.head ? (
                <g key={hit.n} className="animate-[head-marker_420ms_forwards]" strokeLinecap="round">
                  <path className="stroke-night" strokeWidth="7" d="M-34 -34l18 18M34 -34l-18 18M-34 34l18 -18M34 34l-18 -18" />
                  <path className="stroke-neon-red" strokeWidth="4" d="M-34 -34l18 18M34 -34l-18 18M-34 34l18 -18M34 34l-18 -18" />
                </g>
              ) : (
                <g key={hit.n} className="animate-[hit-marker_180ms_forwards] stroke-ink" strokeWidth="2">
                  <path d="M-12 -12l6 6M12 -12l-6 6M-12 12l6 -6M12 12l-6 -6" />
                </g>
              ))}
          </svg>
          {/* Each lock's ring, and a skull in it once firing now takes that bot down, as Cassidy's Deadeye shows. */}
          {reticles.map((r) => (
            <div
              key={r.id}
              data-doomed={r.doomed || undefined}
              className="absolute grid size-11 -translate-1/2 place-items-center"
              style={{ left: r.x, top: r.y } as CSSProperties}
            >
              <div
                className="absolute inset-0 rounded-full [mask:radial-gradient(circle,transparent_15px,#000_16px)] data-full:shadow-[0_0_18px_2px_var(--color-magenta)]"
                data-full={r.lock >= 1 || undefined}
                style={{
                  background: `conic-gradient(var(--color-magenta) ${r.lock * 360}deg, color-mix(in srgb, var(--color-magenta) 18%, transparent) 0)`,
                }}
              />
              {r.doomed && (
                <svg viewBox="0 0 24 24" className="size-6 fill-magenta drop-shadow-[0_0_3px_var(--color-night)]">
                  <path
                    fillRule="evenodd"
                    d="M12 2C7 2 3.5 5.5 3.5 10c0 2.6 1.2 4.6 3 5.8V19a1 1 0 0 0 1 1H9v-2h1.5v2h3v-2H15v2h1.5a1 1 0 0 0 1-1v-3.2c1.8-1.2 3-3.2 3-5.8C20.5 5.5 17 2 12 2ZM8.5 9.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM12 13.5l1.2 2.2h-2.4Z"
                  />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}

      {/* The ultimate's ring: tap it (or press Q) to start it, and again to fire. */}
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(1.5rem,env(safe-area-inset-bottom))] ${filled ? "" : "invisible"}`}
      >
        <button
          type="button"
          aria-label={ringLabel}
          tabIndex={filled ? 0 : -1}
          // Not `disabled`: pressing a disabled button sends focus to the page, which pauses the game.
          aria-disabled={hud.ult === "charging"}
          // Focus stays on the view, so the keys keep reaching the game.
          onMouseDown={(event) => event.preventDefault()}
          onClick={ultimate}
          className={`pointer-events-auto relative grid size-16 place-content-center rounded-full bg-night/75 font-display text-sm font-extrabold uppercase tabular-nums sm:size-18 ${hud.ult === "charging" ? "text-ink" : "text-magenta shadow-[0_0_22px_2px_color-mix(in_srgb,var(--color-magenta)_55%,transparent)]"}`}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full [mask:radial-gradient(circle,transparent_calc(50%-4px),#000_calc(50%-3px))]"
            style={{
              background: `conic-gradient(${hud.ult === "charging" ? "var(--color-cyan)" : "var(--color-magenta)"} ${charge * 360}deg, color-mix(in srgb, var(--color-ink) 14%, transparent) 0)`,
            }}
          />
          <span aria-hidden="true">
            {hud.ult === "running" ? copy.ultimate.fire : hud.ult === "ready" ? copy.ultimate.ready : `${hud.charge}%`}
          </span>
        </button>
      </div>

      <StepsAside away={filled} arrives={arrivesAtShootout}>
        <div className={`${overPlace.arena} flex flex-col items-center gap-5 text-center`}>
          {corners}
          {playing && hud.paused ? (
            <>
              <h2 className={overlayTitle}>{copy.paused.title}</h2>
              <p className="text-ink/85">{copy.paused.line}</p>
              <button ref={resumeRef} type="button" className={gamePrimary} onClick={resume}>
                {copy.resume}
              </button>
            </>
          ) : (
            <>
              <h2 className={overlayTitle}>{copy.start.title}</h2>
              <p className="text-ink/85">{copy.start.line}</p>
              <SlowMode copy={copy.slowMode} checked={hud.slow} onChange={toggleSlow} />
              {view === "unavailable" ? (
                <p className="max-w-sm text-ink/85">{copy.unavailable}</p>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <button type="button" className={gamePrimary} disabled={!lit} onClick={begin}>
                    {copy.start.action}
                  </button>
                  {/* Kept in the flow once the view is lit, so nothing shifts. */}
                  <p className={`text-sm text-ink/70 ${lit ? "invisible" : ""}`}>{copy.loading}</p>
                </div>
              )}
            </>
          )}
          {playing && hud.paused && (
            <SlowMode copy={copy.slowMode} checked={hud.slow} onChange={toggleSlow} />
          )}
        </div>
      </StepsAside>

      <StepsAside away={filled} arrives={arrivesAtShootout}>
        {outro}
      </StepsAside>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
