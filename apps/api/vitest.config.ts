import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    env: {
      ENFORCE_ASSIGNMENTS:"false", WORKER_RUNTIME: "local",
      METADATA_STORE: "memory",
      PUBLIC_ORIGIN: "http://localhost:5173",
    },
    testTimeout: 10000,
  },
});
