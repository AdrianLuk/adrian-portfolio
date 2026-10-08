// What the shot scripts share for photographing the world's canvas on its own.

/** Everything but the world's canvas, hidden without moving anything. */
export const WORLD_ONLY = `
  body * { visibility: hidden !important; }
  canvas { visibility: visible !important; }
`;

/**
 * In the page: the moment the world has drawn its first frame, tells it the
 * tab is hidden, so it stops (as it does in a background tab) and the canvas
 * keeps that frame.
 */
function holdFirstFrame() {
  new MutationObserver((_, observer) => {
    if (!document.querySelector('[data-world="drawn"]')) return;
    observer.disconnect();
    Object.defineProperty(document, "hidden", { get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  }).observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-world"],
  });
}

/**
 * Loads `url` and holds the world on its first frame: the frame a still at a
 * Place has to match, since the live world fades in over it from there, and
 * the same frame every run (the rally ball, the motes). CSS runs on, so the
 * canvas still fades in. Returns false if the page has no world, or none
 * draws within `timeout`.
 */
export async function openOnFirstFrame(page, url, { timeout }) {
  await page.addInitScript(holdFirstFrame);
  await page.goto(url);
  // A page with no world (the Rally game's, the 404) never draws one.
  if ((await page.locator("[data-world]").count()) === 0) return false;
  try {
    await page.locator('[data-world="drawn"]').waitFor({ timeout });
  } catch {
    return false;
  }
  // The canvas's fade in (a second), and the fonts.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  return true;
}
