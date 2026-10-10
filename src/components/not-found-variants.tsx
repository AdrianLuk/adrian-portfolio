"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { notFound } from "@/content/site";
import { earnAchievement } from "./achievements";
import { createRotation } from "./not-found-rotation";
import { isMouseOrPen, pointerOffset } from "./pointer-motion";
import { createHold, HOLD_MS } from "./recall-hold";
import { prefersReducedMotion } from "./reduced-motion";

type Copy = typeof notFound;

/** A filled button, at least 44px high: for the home link, the excuse and the Recall button. */
const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-cyan px-6 py-2.5 font-display text-sm font-bold tracking-widest text-night uppercase [font-stretch:90%] hover:bg-ink";
const WIDE = "w-full sm:w-auto";

/** How often the ring's value is told to assistive technology: not every frame. */
const REPORT_MS = 750;

/** The ring's size: the button (44px) and 10px all round, so its stroke clears the focus outline. */
const RING_RADIUS = 32;

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
 * which leans toward a mouse or pen. Under the variant, the home link and the
 * button, centred. League of Legends' line can be held for about 3 seconds
 * (mouse, pen, touch or Space/Enter) to recall home, its progress filling
 * under it, and the start, cancel and finish heard in the live region. All five variants stand stacked in one grid cell, only the current
 * one visible, so the link below holds its place on every variant. The button's
 * change is announced in a polite live region, and focus stays on the button.
 */
export function NotFoundVariants({
  copy,
  backdrop,
}: {
  copy: Copy;
  backdrop: ReactNode;
}) {
  // None until storage is read after hydration, so no variant flashes up first.
  const [current, setCurrent] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [holding, setHolding] = useState(false);
  const [percent, setPercent] = useState(0);
  const root = useRef<HTMLElement>(null);
  const hold = useRef<ReturnType<typeof createHold>>(null);
  const router = useRouter();
  const arrived = useRef(false);

  const size = copy.variants.length;

  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    setCurrent(showNext(size));
  }, [size]);

  function startRecall() {
    hold.current ??= createHold(() => {
      setAnnouncement(copy.recall.done);
      router.push("/");
    });
    if (!hold.current.start()) return;
    setPercent(0);
    setHolding(true);
    setAnnouncement(copy.recall.start);
  }

  function cancelRecall() {
    if (!hold.current?.cancel()) return;
    setHolding(false);
    setAnnouncement(copy.recall.cancel);
  }

  useEffect(() => {
    if (!holding) return;
    const began = performance.now();
    const report = setInterval(
      () => setPercent(Math.min(100, Math.round(((performance.now() - began) / HOLD_MS) * 4) * 25)),
      REPORT_MS,
    );
    return () => clearInterval(report);
  }, [holding]);

  /** The press-and-hold by mouse, pen or touch: on the line and on the Recall button. */
  const pointerHold = {
    onContextMenu: (event: ReactMouseEvent) => event.preventDefault(),
    onPointerDown: (event: ReactPointerEvent) => event.button === 0 && startRecall(),
    onPointerUp: cancelRecall,
    onPointerCancel: cancelRecall,
    onPointerLeave: cancelRecall,
  };

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
      className="relative isolate mx-auto flex min-h-[60svh] max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center py-24 sm:px-6"
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
            className={`col-start-1 row-start-1 flex flex-col items-center gap-4 ${i === current ? "" : "invisible"}`}
          >
            <h2 className="font-display text-5xl font-extrabold uppercase [font-stretch:140%]">
              {variant.heading}
            </h2>
            <p
              className={`text-lg text-ink/85 ${"recall" in variant ? "touch-none select-none [-webkit-touch-callout:none]" : ""}`}
              {...("recall" in variant ? pointerHold : {})}
            >
              {variant.line}
            </p>
            {"recall" in variant && (
              <div className="relative my-3" data-holding={holding || undefined}>
                <button
                  type="button"
                  aria-describedby="recall-hint"
                  className={`${BUTTON} touch-none select-none [-webkit-touch-callout:none]`}
                  {...pointerHold}
                  onKeyDown={(event) => {
                    if (event.key !== " " && event.key !== "Enter") return;
                    event.preventDefault();
                    if (!event.repeat) startRecall();
                  }}
                  onKeyUp={(event) => (event.key === " " || event.key === "Enter") && cancelRecall()}
                  onBlur={cancelRecall}
                >
                  {copy.recall.label}
                </button>
                <span id="recall-hint" className="sr-only">
                  {copy.recall.hint}
                </span>
                {/* The channel: a faint ring round the button, and a lit arc that sweeps
                  clockwise over the hold. Our own light, in the world's cyan. */}
                <svg
                  role="progressbar"
                  aria-label={copy.recall.label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={holding ? percent : 0}
                  className="pointer-events-none absolute -inset-2.5 size-[calc(100%+1.25rem)] overflow-visible"
                >
                  <rect width="100%" height="100%" rx={RING_RADIUS} fill="none" strokeWidth="3" className="stroke-cyan/25" />
                  <rect
                    width="100%"
                    height="100%"
                    rx={RING_RADIUS}
                    pathLength="100"
                    fill="none"
                    strokeWidth="3"
                    strokeDasharray="100"
                    data-recall-fill
                    className="recall-ring stroke-cyan"
                    style={{
                      strokeDashoffset: holding ? 0 : 100,
                      transition: holding ? `stroke-dashoffset ${HOLD_MS}ms linear` : "none",
                    }}
                  />
                </svg>
                {holding &&
                  [0, 1, 2, 3, 4, 5].map((i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      className="recall-mote pointer-events-none absolute bottom-0 size-1 rounded-full bg-cyan motion-reduce:hidden"
                      style={{ left: `${12 + i * 15}%`, animationDelay: `${i * 0.3}s` }}
                    />
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex w-full max-w-xs flex-col items-center gap-3 sm:w-auto sm:max-w-none sm:flex-row">
        <Link href="/" className={`${BUTTON} ${WIDE}`}>
          {copy.homeLink}
        </Link>
        <button
          type="button"
          data-excuse
          className={`${BUTTON} ${WIDE}`}
          onClick={() => {
            const index = showNext(size);
            const next = copy.variants[index];
            setCurrent(index);
            setAnnouncement(`${next.heading}. ${next.line}`);
          }}
        >
          {copy.next}
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
