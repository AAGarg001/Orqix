import { defineConfig } from "@playwright/test";
import regression from "./playwright.config.js";

export default defineConfig({
  ...regression,
  testIgnore: [],
  testMatch: "**/documentation-capture.spec.ts",
});
