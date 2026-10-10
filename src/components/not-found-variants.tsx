"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { notFound } from "@/content/site";
import { earnAchievement } from "./achievements";
import { createRotation } from "./not-found-rotation";
import { isMouseOrPen, pointerOffset } from "./pointer-motion";
import { prefersReducedMotion } from "./reduced-motion";

type Copy = typeof notFound;

let rotation: ReturnType<typeof createRotation> | undefined;
/** This browser's variant order, on its localStorage (whose very access may throw). */
const getRotation = (size: number) =>
  (rotation ??= createRotation(
    {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
    size,
  ));

/** Takes the next variant in this browser's order, and earns Full rotation on the last of the five. */
function showNext(size: number) {
  const { index, seenAll } = getRotation(size).next();
  // After this commit's effects, so the footer's Achievements are listening.
  if (seenAll) queueMicrotask(() => earnAchievement("full-rotation"));
  return index;
}

/**
 * The 404: one of its themed variants (the next in this browser's order on
 * arrival, then the next on each press of the button), and the backdrop,
 * which leans toward a mouse or pen. `children` (the home link) sit under the
 * variant. All five variants stand stacked in one grid cell, only the current
 * one visible, so the link below holds its place on every variant. The button's
 * change is announced in a polite live region, and focus stays on the button.
 */
export function NotFoundVariants({
  copy,
  backdrop,
  children,
}: {
  copy: Copy;
  backdrop: ReactNode;
  children: ReactNode;
}) {
  // None until storage is read after hydration, so no variant flashes up first.
  const [current, setCurrent] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLElement>(null);
  const arrived = useRef(false);

  const size = copy.variants.length;

  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    setCurrent(showNext(size));
  }, [size]);

  useEffect(() => {
    const lean = (event: PointerEvent) => {
      if (!isMouseOrPen(event) || prefersReducedMotion()) return;
      const { x, y } = pointerOffset(event);
      root.current?.style.setProperty("--px", String(x));
      root.current?.style.setProperty("--py", String(y));
    };
    window.addEventListener("pointermove", lean);
    return () => window.removeEventListener("pointermove", lean);
  }, []);

  return (
    <section
      ref={root}
      className="relative isolate mx-auto flex min-h-[60svh] max-w-3xl flex-col justify-center gap-4 px-4 py-24 sm:px-6"
    >
      {backdrop}
      {/* Without scripts, nothing picks a variant: show the first, and drop the button. */}
      <noscript>
        <style>{"[data-variant='0']{visibility:visible!important}[data-excuse]{display:none}"}</style>
      </noscript>
      <div className="grid">
        {copy.variants.map((variant, i) => (
          <div
            key={variant.theme}
            data-theme={variant.theme}
            data-variant={i}
            className={`col-start-1 row-start-1 flex flex-col gap-4 ${i === current ? "" : "invisible"}`}
          >
            <h2 className="font-display text-5xl font-extrabold uppercase [font-stretch:140%]">
              {variant.heading}
            </h2>
            <p className="text-lg text-ink/85">{variant.line}</p>
          </div>
        ))}
      </div>
      {children}
      <p data-excuse>
        <button
          type="button"
          className="rounded-full border border-cyan/60 px-5 py-2 font-display text-sm font-bold tracking-widest uppercase [font-stretch:90%] hover:border-cyan"
          onClick={() => {
            const index = showNext(size);
            const next = copy.variants[index];
            setCurrent(index);
            setAnnouncement(`${next.heading}. ${next.line}`);
          }}
        >
          {copy.next}
        </button>
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
