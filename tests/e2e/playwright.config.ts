import { defineConfig } from "@playwright/test";

const baseURL = process.env.APP_URL || "http://localhost:18080";

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  retries: 1,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  reporter: [["list"]],
});
