/**
 * Runs `run` once the page's first contentful paint is in, in a task of its
 * own after the next frame. Fonts that may block for a moment can leave the
 * first frame or two with nothing contentful in them, so the frame alone
 * isn't enough. Returns a canceller.
 */
export function afterFirstPaint(run: () => void) {
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: PerformanceObserver | undefined;
  const next = () => {
    frame = requestAnimationFrame(() => {
      timer = setTimeout(run, 0);
    });
  };
  const painted = () =>
    performance.getEntriesByName("first-contentful-paint").length > 0;
  if (
    painted() ||
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes?.includes("paint")
  ) {
    next();
  } else {
    observer = new PerformanceObserver(() => {
      if (!painted()) return;
      observer?.disconnect();
      next();
    });
    observer.observe({ type: "paint" });
  }
  return () => {
    observer?.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}
