"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type MouseEvent } from "react";
import type { recall } from "@/content/site";
import { earnAchievement } from "./achievements";
import { prefersReducedMotion } from "./reduced-motion";

/** A press on the name shorter than this is an ordinary click, in ms. */
const TAP_MS = 500;

/** What started a channel: only it can let go of it. */
type Trigger = "key" | "pointer";

/**
 * Whether a keydown starts a Recall: `B` alone, not a key repeat, not typed
 * into a field, and with no game in play.
 */
function startsRecall(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  return (
    // Chrome's autofill raises keydowns without a key.
    event.key?.toLowerCase() === "b" &&
    !event.repeat &&
    !(event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) &&
    !target?.closest?.("input, textarea, select") &&
    !target?.isContentEditable &&
    !document.querySelector("[data-game-in-play]")
  );
}

/**
 * The header's name, home's link, and the Recall: holding `B`, or holding
 * the name (touch or mouse), fills a ring round it over `copy.channelMs`,
 * then takes the visitor home (a Transit from a Place, as any navigation home
 * is; on home, back to the top, dropping any hash). Letting go of the trigger
 * that started it cancels it early, and a cancelled press doesn't navigate; a
 * press shorter than TAP_MS is an ordinary click.
 * Each step is announced politely. The ring fills under reduced motion too:
 * only its glow pulse is motion.
 */
export function RecallName({ name, copy }: { name: string; copy: typeof recall }) {
  const router = useRouter();
  const [channeling, setChanneling] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  /** The channel under way: its timer. */
  const channelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** What started the channel under way. */
  const channelTrigger = useRef<Trigger | null>(null);
  /** A press on the name: its tap timer, until it's let go. */
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True once a press outlasts a tap: its click doesn't navigate. */
  const held = useRef(false);

  function complete() {
    channelTimer.current = null;
    channelTrigger.current = null;
    setChanneling(false);
    setAnnouncement(copy.done);
    earnAchievement("back-to-base");
    if (window.location.pathname === "/") {
      // In place: Back still goes where it did.
      window.history.replaceState(null, "", "/");
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "instant" : "smooth" });
    } else {
      router.push("/");
    }
  }

  function start(trigger: Trigger) {
    if (channelTimer.current) return;
    channelTimer.current = setTimeout(complete, copy.channelMs);
    channelTrigger.current = trigger;
    setChanneling(true);
    setAnnouncement(copy.started);
  }

  /** Cancels the channel under way, if `trigger` (or, without one, anything) started it. */
  function cancel(trigger?: Trigger) {
    if (!channelTimer.current || (trigger && trigger !== channelTrigger.current)) return;
    clearTimeout(channelTimer.current);
    channelTimer.current = null;
    channelTrigger.current = null;
    setChanneling(false);
    setAnnouncement(copy.cancelled);
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (startsRecall(event)) start("key");
  });
  const onKeyUp = useEffectEvent((event: KeyboardEvent) => {
    if (event.key?.toLowerCase() === "b") cancel("key");
  });
  // B's keyup never comes once the window loses focus.
  const onBlur = useEffectEvent(() => cancel());

  useEffect(() => {
    const down = (event: KeyboardEvent) => onKeyDown(event);
    const up = (event: KeyboardEvent) => onKeyUp(event);
    const blur = () => onBlur();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  function release() {
    if (!pressTimer.current) return;
    clearTimeout(pressTimer.current);
    pressTimer.current = null;
    cancel("pointer");
  }

  return (
    <>
      <h1 className="font-display text-lg font-bold tracking-wide uppercase [font-stretch:125%]">
        <Link
          href="/"
          // The iPhone's link preview would steal the hold: here only.
          className="relative select-none [-webkit-touch-callout:none]"
          onPointerDown={(event) => {
            // One press at a time: a second finger or button doesn't start its own.
            if (event.button !== 0 || !event.isPrimary || pressTimer.current) return;
            held.current = false;
            pressTimer.current = setTimeout(() => {
              held.current = true;
              start("pointer");
            }, TAP_MS);
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerLeave={release}
          // A long press opens the menu on Android, a mouse's right button anywhere.
          onContextMenu={(event) => pressTimer.current && event.preventDefault()}
          onClick={(event: MouseEvent) => {
            // Keyboard activation (detail 0) is always a click.
            if (held.current && event.detail) event.preventDefault();
            held.current = false;
          }}
        >
          {name}
          {channeling && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute -top-1.5 -left-2.5 h-[calc(100%+0.75rem)] w-[calc(100%+1.25rem)] overflow-visible text-cyan motion-safe:animate-[recall-glow_1s_ease-in-out_infinite]"
            >
              <rect width="100%" height="100%" rx="8" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
              <rect
                data-recall-ring
                width="100%"
                height="100%"
                rx="8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                pathLength={1}
                strokeDasharray={1}
                style={{ animation: `recall-fill ${copy.channelMs}ms linear forwards` }}
              />
            </svg>
          )}
        </Link>
      </h1>
      {/* Outside the heading, so it's never part of its name. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
