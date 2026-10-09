"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { achievements } from "@/content/site";
import {
  ACHIEVEMENT_IDS,
  createAchievements,
  EARN_EVENT,
  type AchievementId,
  type Achievements,
} from "./achievements";

type Copy = typeof achievements;

/** How long a toast stays up, unless hovered or focused. */
const TOAST_MS = 5000;

/** Nothing earned: the server's render, and the first client one, before storage is read. */
const NONE = ACHIEVEMENT_IDS.map((id) => ({ id, earned: false }));

let store: Achievements | undefined;
/** The visitor's Achievements, on this browser's localStorage (whose very access may throw). */
const getStore = () =>
  (store ??= createAchievements({
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  }));
const subscribe = (listener: () => void) => getStore().subscribe(listener);

/**
 * The footer's Achievements: a counter that opens their list in a modal
 * dialog, and a toast, a polite live region, when an Easter egg raises
 * EARN_EVENT for one not yet earned. The toast never takes focus, and holds
 * while hovered or focused.
 */
export function AchievementCounter({ copy }: { copy: Copy }) {
  const list = useSyncExternalStore(subscribe, () => getStore().list(), () => NONE);
  const count = list.filter((a) => a.earned).length;
  const [toast, setToast] = useState<AchievementId[] | null>(null);
  const [held, setHeld] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onEarn = (event: Event) => {
      const fresh = getStore().earn((event as CustomEvent<AchievementId>).detail);
      if (fresh.length) setToast(fresh);
    };
    window.addEventListener(EARN_EVENT, onEarn);
    return () => window.removeEventListener(EARN_EVENT, onEarn);
  }, []);

  useEffect(() => {
    if (!toast || held) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, held]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="underline decoration-ink/40 underline-offset-4 hover:text-cyan hover:decoration-cyan"
        onClick={() => dialogRef.current?.showModal()}
      >
        {copy.label}: <span className="tabular-nums">{count}</span> of {list.length}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="achievements-heading"
        className="m-auto w-[min(24rem,calc(100%-2rem))] rounded-2xl border border-fog bg-dusk p-6 text-left text-ink backdrop:bg-night/80"
        // A tap on the counter doesn't focus it on every browser: return focus by hand.
        onClose={() => buttonRef.current?.focus()}
      >
        <h2
          id="achievements-heading"
          className="font-display text-xl font-bold uppercase [font-stretch:115%]"
        >
          {copy.label}
        </h2>
        <ul className="mt-4 space-y-2">
          {list.map((a) => (
            <li key={a.id} className={a.earned ? "font-semibold" : "text-ink/70"}>
              {a.earned ? (
                copy.names[a.id]
              ) : (
                <>
                  <span aria-hidden="true">{copy.unearned}</span>
                  <span className="sr-only">{copy.unearnedLabel}</span>
                </>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-6 rounded-full border border-cyan/60 px-5 py-2 font-display text-sm font-bold tracking-widest uppercase [font-stretch:90%] hover:border-cyan"
          onClick={() => dialogRef.current?.close()}
        >
          {copy.close}
        </button>
      </dialog>

      {/* Always in the page, so a screen reader hears what lands in it. */}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center"
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        {toast && (
          <p
            className="pointer-events-auto rounded-2xl border border-cyan/60 bg-dusk px-5 py-3 text-ink shadow-2xl shadow-cyan/20"
            onPointerEnter={() => setHeld(true)}
            onPointerLeave={() => setHeld(false)}
          >
            <span className="block font-display text-xs tracking-widest text-cyan uppercase [font-stretch:75%]">
              {toast.length > 1 ? copy.toast.many : copy.toast.one}
            </span>
            <span className="font-semibold">
              {toast.map((id) => copy.names[id]).join(" and ")}
            </span>
          </p>
        )}
      </div>
    </>
  );
}
