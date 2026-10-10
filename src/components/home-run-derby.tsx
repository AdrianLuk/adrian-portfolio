"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { overPlace } from "@/app/styles";
import type { derby } from "@/content/site";
import { afterFirstPaint } from "./after-first-paint";
import { earnAchievement } from "./achievements";
import {
  gameButton,
  gamePrimary,
  overField,
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
  isLive,
  overLine,
  PITCHES,
  playOfTheGame,
  replayAt,
  replayLength,
  setPaused,
  setSlow,
  startGame,
  step,
  type Game,
  type GameEvent,
  type Phase,
} from "./derby/rules";
import { REPLAY_SPEED, shotAt, stillAt } from "./derby/replay";
import type { DerbyView } from "./derby/scene";

type Copy = (typeof derby)["game"];

/**
 * The longest step a frame may take, in seconds: a long stall can't jump the
 * pitch (a hidden tab pauses the game anyway). Longer than the Rally game's,
 * as a swing is timed at its press, not its frame: a slow device still
 * plays in real time, not slow motion.
 */
const MAX_STEP = 0.25;

/** What the game's UI shows: kept in React state, changed only by events. */
type Hud = {
  phase: Phase;
  paused: boolean;
  slow: boolean;
  pitches: number;
  homeRuns: number;
  /** Curvebot's line on the last pitch, or the game's end. */
  call: string;
  /** The Play of the Game's distance, in feet; null before any home run. */
  longest: number | null;
};

const hudFor = (game: Game, call: string): Hud => ({
  phase: game.phase,
  paused: game.paused,
  slow: game.slow,
  pitches: game.pitches,
  homeRuns: game.homeRuns,
  call,
  longest: playOfTheGame(game)?.hit.distance ?? null,
});

/**
 * The Home Run Derby, played in the world on the Diamond: the game's objects
 * drawn into the world's own scene (their Three.js loaded after the first
 * paint, and built once any Transit has landed), the game's own UI over it,
 * and a polite live region announcing each outcome with Curvebot's line,
 * pauses and the game's end. As the Rally game's, the page's copy (`intro`,
 * the game's panel, `outro`) stands over the field before Start, steps
 * aside in play, the field filling the screen with only the count and Pause
 * over it, and returns at a pause or the game's end. Space, or a tap
 * anywhere on the field, swings. Nothing moves before Start. Under reduced
 * motion slow mode starts on; anyone can switch it. After a game with a
 * home run, the Play of the Game replays the longest from its own camera
 * (a still of it under reduced motion), the field filling the screen under
 * its banner until it ends or Done (or Esc); "Watch again" plays it again.
 */
export function HomeRunDerby({
  copy,
  describedBy,
  intro,
  outro,
  corners,
}: {
  copy: Copy;
  /** The id of the page's controls hint, which describes the field. */
  describedBy: string;
  /** The page's heading and hint, and its link on, over the field. */
  intro: ReactNode;
  outro: ReactNode;
  /** The game's panel's corner brackets, in the Diamond's light. */
  corners: ReactNode;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  /** Where focus goes once the Play of the Game ends: "Watch again", if that played it. */
  const returnRef = useRef<HTMLButtonElement | null>(null);
  const viewRef = useRef<DerbyView | null>(null);
  const gameRef = useRef<Game>(createGame());
  const frameRef = useRef(0);
  /** When the visitor last swung (performance.now()'s ms), until the loop counts it. */
  const swingRef = useRef<number | null>(null);

  /** Whether the game's objects are on the Diamond's field yet. */
  const [hosted, setHosted] = useState<"waiting" | "hosted" | "failed">(
    "waiting",
  );
  const world = useWorldState();
  /** The field as the game sees it: drawn once the world is, with the game on it. */
  const view: WorldState =
    world === "unavailable" || hosted === "failed"
      ? "unavailable"
      : world === "drawn" && hosted === "hosted"
        ? "drawn"
        : "pending";
  const [announcement, setAnnouncement] = useState("");
  /** Whether the Play of the Game is on screen. */
  const [showing, setShowing] = useState(false);
  const [hud, setHud] = useState<Hud>(() => hudFor(createGame(), ""));

  /** Curvebot's line for an outcome: a home run's distance after it. */
  const lineFor = useCallback(
    (event: Extract<GameEvent, { type: "outcome" }>) =>
      event.outcome === "home-run"
        ? `${copy.outcomes[event.outcome]} ${event.distance} ${copy.feet}.`
        : copy.outcomes[event.outcome],
    [copy],
  );

  const draw = useCallback(() => {
    viewRef.current?.draw(gameRef.current);
  }, []);

  /** Ends the Play of the Game: the camera back on the Derby's view, the game as it ended. */
  const endPlay = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    setShowing(false);
    draw();
  }, [draw]);

  /**
   * The Play of the Game: the longest home run again, in slow motion, from
   * its own camera; under reduced motion, one still of the bat on the ball.
   * Announced after `lead` (the game's end, when it follows straight on).
   */
  const showPlay = useCallback((lead = "") => {
    const play = playOfTheGame(gameRef.current);
    const view = viewRef.current;
    if (!play || !view) return;
    cancelAnimationFrame(frameRef.current);
    setShowing(true);
    setAnnouncement(`${lead}${copy.play.title}. ${play.hit.distance} ${copy.feet}.`);
    if (window.matchMedia(REDUCED_MOTION).matches) {
      const still = stillAt(play);
      // Its events from the start: the figures in their poses after the swing.
      view.draw(replayAt(play, still, 0), shotAt(play, still));
      return;
    }
    const length = replayLength(play);
    let t = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_STEP) * REPLAY_SPEED;
      last = now;
      const next = Math.min(length, t + dt);
      view.draw(replayAt(play, next, t), shotAt(play, next));
      t = next;
      if (t < length) frameRef.current = requestAnimationFrame(tick);
      else endPlay();
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [copy, endPlay]);

  /** The game loop: one step a frame while the game runs, then a draw. */
  const loop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_STEP);
      last = now;
      // Stepped to the press first, then on: a swing is timed when it was
      // pressed, not at the next frame.
      const swung = swingRef.current;
      swingRef.current = null;
      const toSwing =
        swung === null
          ? 0
          : Math.min(dt, Math.max(0, (swung - (now - dt * 1000)) / 1000));
      const first = step(gameRef.current, toSwing, { swing: swung !== null });
      const rest = step(first, dt - toSwing);
      const game = { ...rest, events: [...first.events, ...rest.events] };
      gameRef.current = game;
      viewRef.current?.draw(game);

      for (const event of game.events) {
        if (event.type === "three-in-a-row") {
          earnAchievement("back-to-back-to-back");
        } else if (event.type === "pitch") {
          setHud((s) => ({ ...s, pitches: game.pitches }));
        } else if (event.type === "outcome") {
          const line = lineFor(event);
          // Numbered, so two strikes running are each announced.
          setAnnouncement(`${copy.pitch} ${game.pitches}. ${line}`);
          setHud(hudFor(game, line));
        } else if (event.type === "over") {
          const line = overLine(event.homeRuns, copy.over);
          setAnnouncement(line);
          setHud(hudFor(game, line));
          showPlay(`${line} `);
        }
      }

      if (game.phase !== "over" && !game.paused) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [copy, lineFor, showPlay]);

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
        const [{ createDerbyView }, live] = await Promise.all([
          import("./derby/scene"),
          host.start(),
        ]);
        // Built (their shaders compiled) only once any Transit has landed,
        // so it doesn't stutter. Without a world, the world's own state
        // says the game can't run.
        if (cancelled || !live) return;
        await worldTransits().landed();
        if (cancelled) return;
        const created = await createDerbyView(live.diamond);
        if (cancelled) {
          created.dispose();
          return;
        }
        viewRef.current = created;
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
      swingRef.current = null;
      gameRef.current = setPaused(game, paused);
      setHud((s) => ({ ...s, paused }));
      setAnnouncement(
        paused ? `${copy.paused.title}. ${copy.paused.line}` : copy.resume,
      );
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

  // Paused or over: focus the way back in. (Playing, the field has focus: it takes the keys.)
  useEffect(() => {
    if (hud.paused) resumeRef.current?.focus();
  }, [hud.paused]);
  useEffect(() => {
    if (showing) doneRef.current?.focus();
    else if (hud.phase === "over") (returnRef.current ?? actionRef.current)?.focus();
  }, [hud.phase, showing]);

  function begin() {
    returnRef.current = null;
    swingRef.current = null;
    setShowing(false);
    const fresh = startGame(
      createGame({ seed: Date.now() % 100_000, slow: gameRef.current.slow }),
    );
    gameRef.current = fresh;
    setHud(hudFor(fresh, ""));
    setAnnouncement(copy.start.line);
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
    setHud((s) => ({ ...s, slow }));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && showing) {
      event.preventDefault();
      endPlay();
      return;
    }
    if (event.key === "Escape" || event.key === "p" || event.key === "P") {
      const game = gameRef.current;
      if (!isLive(game.phase)) return;
      event.preventDefault();
      if (game.paused) resume();
      else pause(true);
      return;
    }
    // The field takes Space; the buttons keep their own keys.
    if (event.target !== surfaceRef.current) return;
    if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat) swingRef.current = performance.now();
    }
  }

  const playing = isLive(hud.phase);
  /** In play and not paused: the field fills the screen, and the copy steps aside. */
  const filled = playing && !hud.paused;
  /** The copy steps aside for the field: in play, and under the Play of the Game. */
  const aside = filled || showing;
  const lit = view === "drawn";

  return (
    <div
      // A gap, not margins, so the screen-filling layers stand flush.
      className="flex flex-col gap-6"
      data-world={view}
      data-phase={hud.phase}
      data-paused={hud.paused}
      data-slow={hud.slow}
      data-pitches={hud.pitches}
      // The Recall's B waits while a game is in play (src/components/recall.tsx).
      data-game-in-play={playing || undefined}
      // The site's header steps aside with the copy (see globals.css).
      data-game-filled={aside || undefined}
      data-play-of-the-game={showing || undefined}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        // Focus left the game (for elsewhere on the page, or nowhere, as a
        // click on the page's text does): the keys can't reach it, so pause.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          pause(true);
        }
      }}
    >
      <StepsAside away={aside}>{intro}</StepsAside>

      {/* The count and Pause, pinned to the screen's top corners in play. */}
      <div
        className={`pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 ${filled ? "" : "invisible"}`}
      >
        <dl className="flex gap-3 rounded-full bg-night/80 px-4 py-2 font-display text-sm font-bold tracking-wide whitespace-nowrap uppercase [font-stretch:110%] sm:gap-5 sm:px-5 sm:text-lg">
          <div className="flex items-baseline gap-2">
            <dt className="text-ink/80">{copy.pitch}</dt>
            <dd className="tabular-nums">
              {hud.pitches}/{PITCHES}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-cyan">{copy.score.homeRuns}</dt>
            <dd className="tabular-nums">{hud.homeRuns}</dd>
          </div>
        </dl>
        <button
          type="button"
          className={`${gameButton} pointer-events-auto`}
          onClick={() => (hud.paused ? resume() : pause(true))}
          tabIndex={playing ? 0 : -1}
        >
          {hud.paused ? copy.resume : copy.pause}
        </button>
      </div>

      {/* The field, the whole screen: in play it takes Space and the tap;
        otherwise (but under the Play of the Game) every pointer passes through it. */}
      <div
        ref={surfaceRef}
        role="application"
        aria-label={copy.label}
        aria-describedby={describedBy}
        tabIndex={playing ? 0 : -1}
        className={`fixed inset-0 z-20 touch-none select-none focus-visible:outline-offset-[-6px] ${aside ? "" : "pointer-events-none"}`}
        // On the press, not the lift: the swing's timing is the game.
        onPointerDown={(event) => {
          if (event.isPrimary && filled) swingRef.current = performance.now();
        }}
      />
      {filled && (
        <p
          aria-hidden="true"
          className={`pointer-events-none fixed inset-x-0 top-[calc(max(1rem,env(safe-area-inset-top))+3.75rem)] z-30 px-4 text-center font-display text-sm tracking-widest uppercase [font-stretch:90%] ${overField}`}
        >
          {hud.call || <span className="text-cyan">{copy.swingHint}</span>}
        </p>
      )}

      {showing && (
        <>
          <div
            className={`pointer-events-none fixed inset-x-0 top-0 z-30 flex flex-col items-center gap-1 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] text-center ${overField}`}
          >
            <p className={`${overlayTitle} text-cyan`}>{copy.play.title}</p>
            <p className="font-display text-xl font-bold tabular-nums">
              {hud.longest} {copy.feet}
            </p>
          </div>
          <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <button ref={doneRef} type="button" className={gameButton} onClick={endPlay}>
              {copy.play.done}
            </button>
          </div>
        </>
      )}

      <StepsAside away={aside}>
        <div className={`${overPlace.diamond} flex flex-col items-center gap-5 text-center`}>
          {corners}
          {playing && hud.paused ? (
            <>
              <h3 className={overlayTitle}>{copy.paused.title}</h3>
              <p className="text-ink/85">{copy.paused.line}</p>
              <button ref={resumeRef} type="button" className={gamePrimary} onClick={resume}>
                {copy.resume}
              </button>
            </>
          ) : (
            <>
              {hud.phase === "over" ? (
                <>
                  <h3 className={overlayTitle}>{copy.over.title}</h3>
                  <p className="font-display text-2xl font-bold">{hud.call}</p>
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
                <div className="flex flex-col items-center gap-2">
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      ref={actionRef}
                      type="button"
                      className={gamePrimary}
                      disabled={!lit}
                      onClick={begin}
                    >
                      {hud.phase === "over" ? copy.over.action : copy.start.action}
                    </button>
                    {hud.phase === "over" && hud.longest !== null && (
                      <button
                        type="button"
                        className={gameButton}
                        disabled={!lit}
                        onClick={(event) => {
                          returnRef.current = event.currentTarget;
                          showPlay();
                        }}
                      >
                        {copy.play.again}
                      </button>
                    )}
                  </div>
                  {/* Kept in the flow once the field is lit, so nothing shifts. */}
                  <p className={`text-sm text-ink/70 ${lit ? "invisible" : ""}`}>
                    {copy.loading}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </StepsAside>

      <StepsAside away={aside}>{outro}</StepsAside>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
