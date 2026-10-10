"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type MouseEvent } from "react";
import type { recall } from "@/content/site";
import { earnAchievement } from "./achievements";
import { prefersReducedMotion } from "./reduced-motion";

/** How long a Recall channels, in ms. */
const CHANNEL_MS = 3000;

/** A press on the name shorter than this is an ordinary click, in ms. */
const TAP_MS = 300;

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
 * the name (touch or mouse), fills a ring round it over CHANNEL_MS, then
 * takes the visitor home (a Transit from a Place, as any navigation home is;
 * on home, back to the top). Letting go early cancels it, and a cancelled
 * press doesn't navigate; a press shorter than TAP_MS is an ordinary click.
 * Each step is announced politely. The ring fills under reduced motion too:
 * only its glow pulse is motion.
 */
export function RecallName({ name, copy }: { name: string; copy: typeof recall }) {
  const router = useRouter();
  const [channeling, setChanneling] = useState(false);
  const [said, setSaid] = useState("");
  /** The channel under way: its timer. */
  const channel = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A press on the name: its tap timer, until it's let go. */
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True once a press outlasts a tap: its click doesn't navigate. */
  const held = useRef(false);

  function complete() {
    channel.current = null;
    setChanneling(false);
    setSaid(copy.done);
    earnAchievement("back-to-base");
    if (window.location.pathname === "/") {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "instant" : "smooth" });
    } else {
      router.push("/");
    }
  }

  function start() {
    if (channel.current) return;
    channel.current = setTimeout(complete, CHANNEL_MS);
    setChanneling(true);
    setSaid(copy.started);
  }

  function cancel() {
    if (!channel.current) return;
    clearTimeout(channel.current);
    channel.current = null;
    setChanneling(false);
    setSaid(copy.cancelled);
  }

  const onWindow = useEffectEvent((event: Event) => {
    if (event.type === "blur") return cancel();
    const { key } = event as KeyboardEvent;
    if (event.type === "keyup") {
      if (key?.toLowerCase() === "b") cancel();
    } else if (startsRecall(event as KeyboardEvent)) {
      start();
    }
  });

  useEffect(() => {
    // B's keyup never comes once the window loses focus.
    const types = ["keydown", "keyup", "blur"];
    const listener = (event: Event) => onWindow(event);
    for (const type of types) window.addEventListener(type, listener);
    return () => {
      for (const type of types) window.removeEventListener(type, listener);
    };
  }, []);

  function release() {
    if (!press.current) return;
    clearTimeout(press.current);
    press.current = null;
    cancel();
  }

  return (
    <>
      <h1 className="font-display text-lg font-bold tracking-wide uppercase [font-stretch:125%]">
        <Link
          href="/"
          // The iPhone's link preview would steal the hold: here only.
          className="relative select-none [-webkit-touch-callout:none]"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            held.current = false;
            press.current = setTimeout(() => {
              held.current = true;
              start();
            }, TAP_MS);
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerLeave={release}
          // A long press opens the menu on Android, a mouse's right button anywhere.
          onContextMenu={(event) => press.current && event.preventDefault()}
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
                style={{ animation: `recall-fill ${CHANNEL_MS}ms linear forwards` }}
              />
            </svg>
          )}
        </Link>
      </h1>
      {/* Outside the heading, so it's never part of its name. */}
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
    </>
  );
}
