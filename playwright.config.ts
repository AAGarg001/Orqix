import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  // Browser suites share one isolated in-memory API and its test-admin actor.
  workers: 1,
  use: {
    baseURL: "http://localhost:5175",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "node scripts/test-stack.mjs",
    url: "http://localhost:5175/api/health",
    reuseExistingServer: false,
    timeout: 90000,
    env: {
      WORKER_RUNTIME: "local",
      METADATA_STORE: "memory",
      PUBLIC_ORIGIN: "http://localhost:5173",
    },
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
