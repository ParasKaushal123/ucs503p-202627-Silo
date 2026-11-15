import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e", timeout: 90000, workers: 1,
  use: { baseURL: "http://localhost:3100", channel: "chrome", headless: true,
         viewport: { width: 1512, height: 982 }, screenshot: "only-on-failure" },
  reporter: "list",
});
