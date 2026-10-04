import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets a second checkout (a worktree, say) run its suite alongside.
const PORT = Number(process.env.E2E_PORT) || 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  // CI's runner has 4 cores and no GPU.
  workers: process.env.CI ? 4 : undefined,
  projects: [
    // The specs that fly the world, drawing it every frame in software WebGL:
    // no more than two at once, or they starve each other's frames (and the
    // opening's timing with them).
    {
      name: "world",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /(flight|route|world)\.spec\.ts/,
      workers: 2,
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /(flight|route|world)\.spec\.ts/,
    },
    // Every route is audited at phone width too. Behaviour that differs on a
    // phone (the stacked plate, the panels at 390px) is tested at that width
    // in the world project, so the rest isn't run twice.
    {
      name: "phone",
      use: { ...devices["Pixel 7"] },
      testMatch: "a11y.spec.ts",
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
