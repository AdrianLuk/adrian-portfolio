import { expect, test, type Page } from "@playwright/test";
import { countFrames, heroRoot, SCENE_TIMEOUT } from "./hero";

/** Every host the page asks anything of, and any shader error, from the first byte. */
function record(page: Page) {
  const hosts = new Set<string>();
  const shaderErrors: string[] = [];
  page.on("request", (r) => hosts.add(new URL(r.url()).host));
  // three.js reports a shader that fails to compile on the console.
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("THREE")) {
      shaderErrors.push(m.text());
    }
  });
  return { hosts, shaderErrors };
}

for (const weather of ["snow", "rain", "clear"] as const) {
  test(`?weather=${weather} draws the world, and the browser never asks a weather service`, async ({
    page,
  }) => {
    const seen = record(page);
    await page.goto(`/?weather=${weather}`);
    await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
      timeout: SCENE_TIMEOUT,
    });
    expect(seen.shaderErrors).toEqual([]);
    expect([...seen.hosts].filter((h) => h.includes("open-meteo"))).toEqual(
      [],
    );
  });
}

test("under prefers-reduced-motion, snow still renders once and nothing falls", async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const frames = await countFrames(page);
  await page.goto("/?weather=snow");
  await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  const before = await frames();
  // Falling snow would ask for a frame every few ms.
  await page.waitForTimeout(500);
  expect(await frames()).toBe(before);
  await context.close();
});
