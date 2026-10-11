import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets a second checkout (a worktree, say) run its suite alongside.
const PORT = Number(process.env.E2E_PORT) || 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // On CI the world compiles and draws in software WebGL on each page's main
  // thread, which can hold up one look at the page for seconds, and a page
  // with a Place for longer: the defaults (30s a test, 5s a look) timed out a
  // different world-heavy test each run. A test that sets its own keeps it.
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  // CI's runner has 4 cores and no GPU, and each page draws the world in
  // software WebGL across all of them: two workers' worlds starved each other
  // (at 4, the opening ran over its 7s; at 2, a different test timed out each
  // run). So on CI each runner has one worker, and the suite is split across
  // runners instead (--shard, .github/workflows/ci.yml).
  workers: process.env.CI ? 1 : undefined,
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      grepInvert: /@frame-rate/,
    },
    // Every route is audited at phone width too. Behaviour that differs on a
    // phone (the stacked plate, the panels at 390px) is tested at that width
    // in the desktop project, so the rest isn't run twice.
    {
      name: "phone",
      use: { ...devices["Pixel 7"] },
      testMatch: "a11y.spec.ts",
    },
    // The frame-rate budgets, one at a time: run beside another worker's
    // world in software, a slow runner's frames ran three times over
    // (FRAME_RATE in e2e/hero.ts). Locally they wait until every other test
    // is done; on CI every test already runs alone, and a dependency would
    // put the whole suite in every shard.
    {
      name: "frame rate",
      use: { ...devices["Desktop Chrome"] },
      grep: /@frame-rate/,
      workers: 1,
      dependencies: process.env.CI ? [] : ["desktop", "phone"],
    },
  ],
  // Always the production build. CI builds once in an earlier step and reuses it.
  webServer: {
    command: process.env.CI
      ? `npm run start -- --port ${PORT}`
      : `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
