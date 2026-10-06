"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { rally } from "@/content/site";
import { afterFirstPaint } from "./after-first-paint";
import type { WorldState } from "./hero-world";
import {
  createGame,
  isLive,
  scoreCall,
  setPaused,
  setSlow,
  startGame,
  step,
  type Game,
  type Phase,
  type Side,
} from "./rally/rules";
import type { RallyView } from "./rally/scene";

type Copy = (typeof rally)["game"];

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** The longest step a frame may take, so a stall (a hidden tab, a slow frame) doesn't jump the ball. */
const MAX_STEP = 0.05;

/** Feet the player moves per CSS pixel of drag, per pixel of the court's width. */
const DRAG_FEET = 34;

/** A pointer that moves less than this (CSS px) and lifts is a tap: it serves. */
const TAP_SLOP = 10;

const KEYS: Record<string, { x: number; z: number }> = {
  ArrowLeft: { x: -1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
  ArrowUp: { x: 0, z: -1 },
  ArrowDown: { x: 0, z: 1 },
};

/** What the game's UI shows: kept in React state, changed only by events. */
type Hud = {
  phase: Phase;
  paused: boolean;
  slow: boolean;
  score: Record<Side, number>;
  winner: Side | null;
  server: Side;
  call: string;
};

const button =
  "rounded-full border border-cyan/60 bg-night/80 px-5 py-2 font-display text-sm font-bold tracking-widest text-ink uppercase [font-stretch:90%] hover:border-cyan";

const primary =
  "rounded-full bg-ember px-7 py-3 font-display font-bold tracking-wide text-night uppercase [font-stretch:110%] disabled:opacity-60";

const overlayTitle =
  "font-display text-3xl font-extrabold uppercase [font-stretch:120%]";

/** The final score, the player's first. */
const finalScore = (score: Record<Side, number>) => `${score.player}–${score.ai}`;

/**
 * The Rally game: the court drawn by Three.js (loaded after the first paint),
 * the game's own UI over it, and a polite live region announcing the serve,
 * each point with the score, pauses and the result. Nothing moves before
 * Start. Under reduced motion slow mode starts on; anyone can switch it.
 */
export function RallyGame({
  copy,
  describedBy,
}: {
  copy: Copy;
  /** The id of the page's controls hint, which describes the court. */
  describedBy: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const viewRef = useRef<RallyView | null>(null);
  const gameRef = useRef<Game>(createGame());
  const frameRef = useRef(0);
  const keysHeld = useRef(new Set<string>());
  const serveRef = useRef(false);
  const dinkRef = useRef(false);
  const drag = useRef({ x: 0, z: 0 });
  const pointer = useRef<{ id: number; x: number; y: number; moved: number } | null>(null);

  const [view, setView] = useState<WorldState>("pending");
  const [announcement, setAnnouncement] = useState("");
  const [dinkHeld, setDinkHeld] = useState(false);
  const [hud, setHud] = useState<Hud>(() => hudFor(gameRef.current, ""));

  function hudFor(game: Game, call: string): Hud {
    return {
      phase: game.phase,
      paused: game.paused,
      slow: game.slow,
      score: { ...game.score },
      winner: game.winner,
      server: game.server,
      call,
    };
  }

  const callFor = useCallback(
    (game: Game) => scoreCall(game, copy.serves),
    [copy.serves],
  );

  const draw = useCallback(() => {
    viewRef.current?.draw(gameRef.current);
  }, []);

  /** The game loop: one step a frame while the game runs, then a draw. */
  const loop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_STEP);
      last = now;
      const move = { x: 0, z: 0 };
      for (const key of keysHeld.current) {
        move.x += KEYS[key].x;
        move.z += KEYS[key].z;
      }
      const before = gameRef.current;
      const game = step(before, dt, {
        move,
        drag: drag.current,
        serve: serveRef.current,
        dink: dinkRef.current,
      });
      serveRef.current = false;
      drag.current = { x: 0, z: 0 };
      gameRef.current = game;
      viewRef.current?.draw(game);

      for (const event of game.events) {
        if (event.type === "point") {
          const won = event.winner === "player";
          const line = `${won ? copy.point.won : copy.point.lost}: ${copy.point.reasons[event.reason]}.`;
          if (game.phase === "over") {
            const message = `${won ? copy.over.won : copy.over.lost} ${finalScore(game.score)}.`;
            setAnnouncement(`${line} ${message}`);
            setHud(hudFor(game, message));
          } else {
            const call = callFor(game);
            setAnnouncement(`${line} ${call}.`);
            setHud(hudFor(game, `${line} ${call}`));
          }
        }
      }
      if (before.phase !== game.phase) {
        setHud((s) => ({ ...s, phase: game.phase }));
      }

      if (game.phase !== "over" && !game.paused) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [callFor, copy]);

  // Three.js is the page's heaviest code: it never holds up the first paint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    async function start() {
      if (!canvas) return;
      // Slow mode starts on under reduced motion, before Start can be pressed.
      if (window.matchMedia(REDUCED_MOTION).matches) {
        gameRef.current = setSlow(gameRef.current, true);
        setHud((s) => ({ ...s, slow: true }));
      }
      try {
        const { createRallyView } = await import("./rally/scene");
        if (cancelled) return;
        const created = await createRallyView(canvas, {
          onLost: () => setView("pending"),
          onRestored: () => {
            draw();
            setView("drawn");
          },
        });
        if (cancelled) {
          created?.dispose();
          return;
        }
        if (!created) {
          setView("unavailable");
          return;
        }
        viewRef.current = created;
        created.setEffects(!gameRef.current.slow);
        created.draw(gameRef.current);
        setView("drawn");
      } catch {
        // A stale chunk after a deploy, say.
        if (!cancelled) setView("unavailable");
      }
    }
    const resize = new ResizeObserver(() => viewRef.current?.layout());
    resize.observe(canvas);
    const cancelStart = afterFirstPaint(start);
    return () => {
      cancelled = true;
      cancelStart();
      resize.disconnect();
      cancelAnimationFrame(frameRef.current);
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [draw]);

  const pause = useCallback(
    (paused: boolean) => {
      const game = gameRef.current;
      if (!isLive(game.phase) || game.paused === paused) return;
      keysHeld.current.clear();
      dinkRef.current = false;
      setDinkHeld(false);
      gameRef.current = setPaused(game, paused);
      setHud((s) => ({ ...s, paused }));
      setAnnouncement(paused ? copy.paused.title : copy.resume);
      if (paused) {
        cancelAnimationFrame(frameRef.current);
        draw();
      } else {
        loop();
      }
    },
    [copy, draw, loop],
  );

  // A hidden tab pauses the game.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pause(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);

  // Paused or over: focus the way back in. (Playing, the court has focus: it takes the keys.)
  useEffect(() => {
    if (hud.paused) resumeRef.current?.focus();
  }, [hud.paused]);
  useEffect(() => {
    if (hud.phase === "over") actionRef.current?.focus();
  }, [hud.phase]);

  function begin() {
    const fresh = startGame(
      createGame({ seed: Date.now() % 100_000, slow: gameRef.current.slow }),
    );
    gameRef.current = fresh;
    setHud(hudFor(fresh, callFor(fresh)));
    setAnnouncement(`${callFor(fresh)}.`);
    surfaceRef.current?.focus();
    draw();
    loop();
  }

  function resume() {
    pause(false);
    surfaceRef.current?.focus();
  }

  function toggleSlow(slow: boolean) {
    gameRef.current = setSlow(gameRef.current, slow);
    viewRef.current?.setEffects(!slow);
    setHud((s) => ({ ...s, slow }));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" || event.key === "p" || event.key === "P") {
      const game = gameRef.current;
      if (!isLive(game.phase)) return;
      event.preventDefault();
      if (game.paused) resume();
      else pause(true);
      return;
    }
    // The court takes the arrows and Space; the buttons keep their own keys.
    if (event.target !== surfaceRef.current) return;
    if (event.key in KEYS) {
      event.preventDefault();
      keysHeld.current.add(event.key);
    } else if (event.key === " ") {
      // Pressed, it serves; held, the next shot is a dink.
      event.preventDefault();
      if (!event.repeat) serveRef.current = true;
      setDinking(true);
    }
  }

  function onKeyUp(event: KeyboardEvent<HTMLDivElement>) {
    keysHeld.current.delete(event.key);
    if (event.key === " ") setDinking(false);
  }

  /** Space or the Dink pad held: kept in a ref for the loop, and in state for the pad's look. */
  function setDinking(on: boolean) {
    dinkRef.current = on;
    setDinkHeld(on);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const p = pointer.current;
    if (!p || p.id !== event.pointerId) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;
    p.moved += Math.hypot(dx, dy);
    if (gameRef.current.paused) return;
    const feet = DRAG_FEET / Math.max(1, event.currentTarget.clientWidth);
    drag.current = {
      x: drag.current.x + dx * feet,
      z: drag.current.z + dy * feet,
    };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const p = pointer.current;
    pointer.current = null;
    if (p && p.id === event.pointerId && p.moved < TAP_SLOP) {
      serveRef.current = true;
    }
  }

  const playing = isLive(hud.phase);
  const lit = view === "drawn";

  return (
    <div
      className="relative"
      data-world={view}
      data-phase={hud.phase}
      data-paused={hud.paused}
      data-slow={hud.slow}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={(event) => {
        // Focus left the game (for elsewhere on the page, or nowhere, as a
        // click on the page's text does): the keys can't reach it, so pause.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          pause(true);
        }
      }}
    >
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-3">
        <dl className="flex gap-6 font-display text-lg font-bold tracking-wide uppercase [font-stretch:110%]">
          <div className="flex items-baseline gap-2">
            <dt className="text-cyan">{copy.score.player}</dt>
            <dd className="tabular-nums">{hud.score.player}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-ink/80">{copy.score.ai}</dt>
            <dd className="tabular-nums">{hud.score.ai}</dd>
          </div>
        </dl>
        <button
          type="button"
          className={`${button} ${playing ? "" : "invisible"}`}
          onClick={() => (hud.paused ? resume() : pause(true))}
          tabIndex={playing ? 0 : -1}
        >
          {hud.paused ? copy.resume : copy.pause}
        </button>
      </div>

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sm border border-fog bg-night/40 sm:aspect-[4/3]">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 size-full opacity-0 data-[world=drawn]:opacity-100"
          data-world={view}
        />
        <div
          ref={surfaceRef}
          role="application"
          aria-label={copy.label}
          aria-describedby={describedBy}
          tabIndex={playing ? 0 : -1}
          className="absolute inset-0 touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (pointer.current = null)}
        />
        {playing && !hud.paused && (
          <p
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 bg-linear-to-b from-night/80 to-transparent px-4 pt-3 pb-6 text-center font-display text-sm tracking-widest uppercase [font-stretch:90%]"
          >
            {hud.call}
            {hud.phase === "serving" && hud.server === "player" && (
              <span className="block pt-1 text-cyan">{copy.serveHint}</span>
            )}
          </p>
        )}
        {!playing && (
          <Overlay>
            {hud.phase === "over" ? (
              <>
                <h3 className={overlayTitle}>
                  {hud.winner === "player" ? copy.over.won : copy.over.lost}
                </h3>
                <p className="font-display text-5xl font-extrabold tabular-nums">
                  {finalScore(hud.score)}
                </p>
              </>
            ) : (
              <>
                <h3 className={overlayTitle}>
                  {copy.start.title}
                </h3>
                <p className="text-ink/85">{copy.start.line}</p>
              </>
            )}
            <SlowMode copy={copy.slowMode} checked={hud.slow} onChange={toggleSlow} />
            {view === "unavailable" ? (
              <p className="max-w-sm text-ink/85">{copy.unavailable}</p>
            ) : (
              <>
                <button
                  ref={actionRef}
                  type="button"
                  className={primary}
                  disabled={!lit}
                  onClick={begin}
                >
                  {hud.phase === "over" ? copy.over.action : copy.start.action}
                </button>
                {/* Kept in the flow once the court is lit, so the centred overlay doesn't shift. */}
                <p className={`text-sm text-ink/70 ${lit ? "invisible" : ""}`}>
                  {copy.loading}
                </p>
              </>
            )}
          </Overlay>
        )}

        {playing && hud.paused && (
          <Overlay>
            <h3 className={overlayTitle}>
              {copy.paused.title}
            </h3>
            <p className="text-ink/85">{copy.paused.line}</p>
            <button ref={resumeRef} type="button" className={primary} onClick={resume}>
              {copy.resume}
            </button>
          </Overlay>
        )}
      </div>

      {/* A pad for touch, under the court so it covers none of it: held,
        your next shot is a dink. Keyboard players hold Space on the court
        instead, so the pad stays out of the tab order and the accessibility
        tree. Its row is always there, so showing it shifts nothing. */}
      <div className="flex justify-end pt-3">
        <div
          aria-hidden="true"
          data-dink-pad
          data-held={dinkHeld}
          className={`flex h-14 min-w-36 touch-none items-center justify-center rounded-full border-2 border-violet/80 bg-night/70 px-8 font-display text-sm font-bold tracking-widest text-ink uppercase select-none [font-stretch:90%] data-[held=true]:bg-violet data-[held=true]:text-night ${playing && !hud.paused ? "" : "invisible"}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDinking(true);
          }}
          // Pressing it mustn't take focus off the court: that would pause the game.
          onMouseDown={(event) => event.preventDefault()}
          onPointerUp={() => setDinking(false)}
          onPointerCancel={() => setDinking(false)}
          onLostPointerCapture={() => setDinking(false)}
        >
          {copy.dink}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-night/70 p-6 text-center">
      {children}
    </div>
  );
}

function SlowMode({
  copy,
  checked,
  onChange,
}: {
  copy: Copy["slowMode"];
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex max-w-xs cursor-pointer items-start gap-3 text-left">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 accent-cyan"
        aria-describedby="slow-mode-description"
      />
      <span>
        <span className="font-semibold">{copy.label}</span>
        <span id="slow-mode-description" className="block text-sm text-ink/75">
          {copy.description}
        </span>
      </span>
    </label>
  );
}
