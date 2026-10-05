// End-to-end tests of the local app (docs/ui.md §11): Chromium only, against magpie ui on a temporary
// journal. Run `npm run build` first: the server serves the built app from dist/ui/.
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: fileURLToPath(new URL("../.scratch/playwright/", import.meta.url)),
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
  projects: [{ name: "chromium" }],
});
