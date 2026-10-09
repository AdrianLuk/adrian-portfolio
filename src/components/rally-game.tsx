"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { arrivesAtPlay, overPlace } from "@/app/styles";
import type { rally } from "@/content/site";
import { afterFirstPaint } from "./after-first-paint";
import { REDUCED_MOTION } from "./reduced-motion";
import { useWorldState } from "./use-world-state";
import { worldHost, type WorldState } from "./world-host";
import { worldTransits } from "./world-transits";
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

/** The longest step a frame may take, so a stall (a hidden tab, a slow frame) doesn't jump the ball. */
const MAX_STEP = 0.05;

/**
 * Feet the player moves per CSS pixel of drag, per pixel of the court's
 * width, where the drag can't follow the court (past its horizon).
 */
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

/** Shadowed in the night, so a line on the court holds over its lights. */
const overCourt =
  "[text-shadow:0_0_12px_var(--color-night),0_1px_3px_var(--color-night)]";

/** The final score, the player's first. */
const finalScore = (score: Record<Side, number>) => `${score.player}–${score.ai}`;

/**
 * The Rally game, played in the world on the Juice Bros court: the game's
 * objects drawn into the world's own scene (their Three.js loaded after the
 * first paint, and built once the camera has landed at the court), the
 * game's own UI over it, and a polite live region announcing the serve,
 * each point with the score, pauses and the result. Before Start the page's
 * copy (`intro`, the game's panel, `outro`) stands over the court; in play
 * it steps aside, and the court fills the screen with only the score, Pause
 * and the Dink pad over it; at a pause or the game's end it returns.
 * Nothing moves before Start. Under reduced motion slow mode starts on;
 * anyone can switch it.
 */
export function RallyGame({
  copy,
  describedBy,
  intro,
  outro,
  corners,
}: {
  copy: Copy;
  /** The id of the page's controls hint, which describes the court. */
  describedBy: string;
  /** The page's heading and hint, and its link on, over the court. */
  intro: ReactNode;
  outro: ReactNode;
  /** The game's panel's corner brackets, in the court's light. */
  corners: ReactNode;
}) {
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

  /** Whether the game's objects are on the world's court yet. */
  const [hosted, setHosted] = useState<"waiting" | "hosted" | "failed">(
    "waiting",
  );
  const world = useWorldState();
  /** The court as the game sees it: drawn once the world is, with the game on it. */
  const view: WorldState =
    world === "unavailable" || hosted === "failed"
      ? "unavailable"
      : world === "drawn" && hosted === "hosted"
        ? "drawn"
        : "pending";
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
          const line = `${event.sideOut ? copy.point.sideOut : won ? copy.point.won : copy.point.lost}: ${copy.point.reasons[event.reason]}.`;
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
    const host = worldHost();
    let cancelled = false;
    async function start() {
      // Slow mode starts on under reduced motion, before Start can be pressed.
      if (window.matchMedia(REDUCED_MOTION).matches) {
        gameRef.current = setSlow(gameRef.current, true);
        setHud((s) => ({ ...s, slow: true }));
      }
      try {
        // The game's drawing code may load during the Transit here...
        const [{ createRallyView }, live] = await Promise.all([
          import("./rally/scene"),
          host.start(),
        ]);
        // ...but its objects are built (their shaders compiled) only once
        // the camera has landed, so the Transit doesn't stutter. Without a
        // world, the world's own state says the game can't run.
        if (cancelled || !live) return;
        await worldTransits().landed();
        if (cancelled) return;
        const created = await createRallyView(live.court);
        if (cancelled) {
          created.dispose();
          return;
        }
        viewRef.current = created;
        created.setEffects(!gameRef.current.slow);
        created.draw(gameRef.current);
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
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, []);

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
    // The first finger keeps the court: a second never takes its drag over.
    if (pointer.current) return;
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
    const game = gameRef.current;
    if (game.paused) return;
    // The player's image keeps pace with the finger, near the net as at the
    // baseline: from where they're heading, through the world's camera.
    const { clientWidth, clientHeight } = event.currentTarget;
    const from = {
      x: game.player.x + game.dragLeft.x + drag.current.x,
      z: game.player.z + game.dragLeft.z + drag.current.z,
    };
    const feet = DRAG_FEET / Math.max(1, clientWidth);
    const moved = viewRef.current?.drag(from, {
      x: (2 * dx) / Math.max(1, clientWidth),
      y: (-2 * dy) / Math.max(1, clientHeight),
    }) ?? { x: dx * feet, z: dy * feet };
    drag.current = {
      x: drag.current.x + moved.x,
      z: drag.current.z + moved.z,
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
  /** In play and not paused: the court fills the screen, and the copy steps aside. */
  const filled = playing && !hud.paused;
  const lit = view === "drawn";

  return (
    <div
      // A gap, not margins, so the screen-filling layers stand flush.
      className="flex flex-col gap-6"
      data-world={view}
      data-phase={hud.phase}
      data-paused={hud.paused}
      data-slow={hud.slow}
      // The site's header steps aside with the copy (see globals.css).
      data-court-filled={filled || undefined}
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
      <StepsAside away={filled}>{intro}</StepsAside>

      {/* The score and Pause, pinned to the screen's top corners in play. */}
      <div
        className={`pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 ${filled ? "" : "invisible"}`}
      >
        <dl className="flex gap-5 rounded-full bg-night/80 px-5 py-2 font-display text-lg font-bold tracking-wide uppercase [font-stretch:110%]">
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
          className={`${button} pointer-events-auto`}
          onClick={() => (hud.paused ? resume() : pause(true))}
          tabIndex={playing ? 0 : -1}
        >
          {hud.paused ? copy.resume : copy.pause}
        </button>
      </div>

      {/* The court, the whole screen: in play it takes the keys, the drag
        and the tap; otherwise every pointer passes through it. */}
      <div
        ref={surfaceRef}
        role="application"
        aria-label={copy.label}
        aria-describedby={describedBy}
        tabIndex={playing ? 0 : -1}
        className={`fixed inset-0 z-20 touch-none select-none focus-visible:outline-offset-[-6px] ${filled ? "" : "pointer-events-none"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (pointer.current = null)}
        onLostPointerCapture={(event) => {
          if (pointer.current?.id === event.pointerId) pointer.current = null;
        }}
      />
      {filled && (
        <p
          aria-hidden="true"
          className={`pointer-events-none fixed inset-x-0 top-[calc(max(1rem,env(safe-area-inset-top))+3.75rem)] z-30 px-4 text-center font-display text-sm tracking-widest uppercase [font-stretch:90%] ${overCourt}`}
        >
          {hud.call}
          {hud.phase === "serving" && hud.server === "player" && (
            <span className="block pt-1 text-cyan">{copy.serveHint}</span>
          )}
        </p>
      )}

      <StepsAside away={filled}>
        <div className={`${overPlace.court} flex flex-col items-start gap-5`}>
          {corners}
          {playing && hud.paused ? (
            <>
              <h3 className={overlayTitle}>{copy.paused.title}</h3>
              <p className="text-ink/85">{copy.paused.line}</p>
              <button ref={resumeRef} type="button" className={primary} onClick={resume}>
                {copy.resume}
              </button>
            </>
          ) : (
            <>
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
                  <h3 className={overlayTitle}>{copy.start.title}</h3>
                  <p className="text-ink/85">{copy.start.line}</p>
                </>
              )}
              <SlowMode copy={copy.slowMode} checked={hud.slow} onChange={toggleSlow} />
              {view === "unavailable" ? (
                <p className="max-w-sm text-ink/85">{copy.unavailable}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <button
                    ref={actionRef}
                    type="button"
                    className={primary}
                    disabled={!lit}
                    onClick={begin}
                  >
                    {hud.phase === "over" ? copy.over.action : copy.start.action}
                  </button>
                  {/* Kept in the flow once the court is lit, so nothing shifts. */}
                  <p className={`text-sm text-ink/70 ${lit ? "invisible" : ""}`}>
                    {copy.loading}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </StepsAside>

      {/* A pad for touch, at the foot of the screen in play: held, your next
        shot is a dink. Keyboard players hold Space on the court instead, so
        the pad stays out of the tab order and the accessibility tree. */}
      <div
        aria-hidden="true"
        data-dink-pad
        data-held={dinkHeld}
        // Violet is Juice Bros' light (./lit-sites), written out for Tailwind.
        className={`fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex h-14 min-w-36 touch-none items-center justify-center rounded-full border-2 border-violet/80 bg-night/70 px-8 font-display text-sm font-bold tracking-widest text-ink uppercase select-none [font-stretch:90%] data-[held=true]:bg-violet data-[held=true]:text-night sm:right-6 ${filled ? "" : "invisible"}`}
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

      <StepsAside away={filled}>{outro}</StepsAside>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/**
 * The page's copy over the court: held back while the camera flies to
 * /play, as any Transit destination's is, and stepping aside (faded out,
 * then out of reach of focus) while `away`, the court filling the screen.
 * It comes back within reach at once, so focus can return to it.
 */
function StepsAside({ away, children }: { away: boolean; children: ReactNode }) {
  return (
    <div className={arrivesAtPlay}>
      <div
        className={
          away
            ? "invisible opacity-0 motion-safe:[transition:opacity_500ms,visibility_0s_500ms]"
            : "motion-safe:transition-opacity motion-safe:duration-500"
        }
      >
        {children}
      </div>
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
