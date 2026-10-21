// The README's screenshots (docs/assets/screen-*.png), dark, 1440×900, from the showcase journal
// (showcase.ts). Run with README_SHOTS=1; skipped otherwise. They overwrite the files in docs/assets/.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

const OUT = fileURLToPath(new URL("../../docs/assets/", import.meta.url));

test.skip(!process.env.README_SHOTS, "Set README_SHOTS=1 to retake the README's screenshots.");
test.use({ showcase: true, colorScheme: "dark", reducedMotion: "reduce" });

const shoot = (page: Page, name: string) => page.screenshot({ path: `${OUT}${name}.png` });

test("inbox review", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("listbox", { name: "Inbox" }).getByRole("option", { name: /Understand-Anything/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Egonex-AI/Understand-Anything" })).toBeVisible();
  await page.getByRole("textbox", { name: "Verdict" }).click();
  await page.keyboard.type("Use when entering a large unfamiliar codebase; overkill for small repos with a good README.");
  await shoot(page, "screen-inbox-review");
});

test("check a package", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Check a package" }).click();
  await page.getByLabel("Packages").fill("pdfkit left-pad puppeteer");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("In Claude Code, Gemini CLI and Antigravity CLI, the hook asks you first.")).toBeVisible();
  await shoot(page, "screen-check-package");
});

test("suggest for this project", async ({ page, magpie }) => {
  writeFileSync(join(magpie.project, "package.json"), JSON.stringify({ description: "Let an agent test a web UI in the browser", keywords: ["agent-skills", "testing"], dependencies: { pdfkit: "*" }, devDependencies: { "@playwright/test": "*" } }));
  writeFileSync(join(magpie.project, "README.md"), "# Checkout tests\n\nEnd-to-end tests for the checkout, written and run by a coding agent.\n");
  await magpie.open(page);
  await page.getByRole("navigation").getByRole("button", { name: "Suggest" }).click();
  const rows = page.getByRole("listbox", { name: "Suggestions" }).getByRole("option");
  await expect(rows.last()).toContainText("In use, avoid");
  await rows.first().click();
  await expect(page.getByRole("article").getByRole("heading", { level: 2 })).toBeVisible();
  await shoot(page, "screen-suggest");
});

// Nothing selected: a selection dims the rest of the graph and hides its labels, so the shot keeps
// every label (under 150 nodes the page draws them all) rather than a note open beside it.
test("graph", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(page.locator(".graph-canvas")).toHaveAttribute("data-settled", "true", { timeout: 10_000 });
  await expect(page.getByRole("group", { name: "Legend" })).toBeVisible();
  await shoot(page, "screen-graph");
});
