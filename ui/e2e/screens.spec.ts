// Screenshots of every screen and state in dark and light, for pull requests (docs/ui.md §11). They
// go to .scratch/screens/. Run with SCREENS=1; skipped otherwise, so CI stays fast.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

const OUT = fileURLToPath(new URL("../../.scratch/screens/", import.meta.url));

test.skip(!process.env.SCREENS, "Set SCREENS=1 to take screenshots.");

const shoot = async (page: Page, name: string) => {
  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.screenshot({ path: `${OUT}${name}-${scheme}.png` });
  }
};

const allNotes = (page: Page) => page.getByRole("button", { name: /All notes/ }).click();

test("inbox review", async ({ page, magpie }) => {
  await magpie.open(page);
  await expect(page.getByRole("listbox", { name: "Inbox" })).toBeVisible();
  await page.keyboard.press("Enter");
  // The first inbox note is Egonex-AI/Understand-Anything.
  await expect(page.getByRole("heading", { level: 2, name: "Egonex-AI/Understand-Anything" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Verdict" })).toBeFocused();
  await page.keyboard.type("Use when entering a large unfamiliar codebase; overkill for small repos with a good README.");
  await shoot(page, "01-inbox-review");
});

test("note view", async ({ page, magpie }) => {
  await magpie.open(page);
  await allNotes(page);
  await page.getByRole("option", { name: /vercel-labs\/agent-skills/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "vercel-labs/agent-skills" })).toBeVisible();
  await shoot(page, "02-note-view");
});

test("search", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.keyboard.press("/");
  await page.keyboard.type("skills");
  await page.getByRole("listbox", { name: "Search results" }).getByRole("option").first().click();
  await expect(page.getByRole("article")).toBeVisible();
  await shoot(page, "03-search");
});

test("command palette", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.keyboard.press("Control+k");
  await page.keyboard.type("design");
  // Inside the palette: the inbox list behind it has the same note.
  await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("option", { name: /awesome-design-md/ })).toBeVisible();
  await shoot(page, "04-palette");
});

test("add with preview", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Package, PURL or GitHub URL").fill("pkg:npm/left-pad");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("region", { name: "Preview" })).toBeVisible();
  await page.getByLabel(/^Verdict/).fill("avoid: use String.prototype.padStart");
  await shoot(page, "05-add");
});

test("import check", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByLabel("Lines").fill("- pkg:npm/left-pad — verdict: avoid; use padStart\n- pkg:npm/pdfkit — verdict: fine\n- pkg:pypi/requests — use: HTTP in scripts | avoid: async code\n- not a package!");
  await page.getByRole("button", { name: "Check lines" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await shoot(page, "06-import");
});

test("settings", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Not set.")).toBeVisible();
  await shoot(page, "07-settings");
});

test("check a package", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Check a package" }).click();
  await page.getByLabel("Packages").fill("pdfkit puppeteer left-pad");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("Claude Code asks you before installing it.")).toBeVisible();
  await shoot(page, "08-check-package");
});

test("read-only note", async ({ page, magpie }) => {
  await magpie.open(page);
  await allNotes(page);
  await page.getByRole("option", { name: /npm--broken\.md/ }).click();
  await expect(page.getByRole("note")).toBeVisible();
  await shoot(page, "09-read-only");
});

test("conflict", async ({ page, magpie }) => {
  await magpie.open(page);
  await expect(page.getByRole("listbox", { name: "Inbox" }).getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Verdict" })).toBeFocused();
  await page.keyboard.type("my unsaved Verdict");
  const file = magpie.note("github--egonex-ai--understand-anything.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("## My notes\n", "## My notes\nEdited in another editor.\n"));
  await expect(page.getByText("This note changed on disk since you opened it.")).toBeVisible({ timeout: 10_000 });
  await shoot(page, "10-conflict");
});

test.describe("an empty journal", () => {
  test.use({ empty: true });
  test("empty inbox", async ({ page, magpie }) => {
    await magpie.open(page);
    await expect(page.getByText("Your inbox is empty.")).toBeVisible();
    await shoot(page, "11-empty-inbox");
  });
});

test("connection lost", async ({ page, magpie }) => {
  await magpie.open(page);
  await expect(page.getByRole("listbox", { name: "Inbox" })).toBeVisible();
  await magpie.server.stop();
  await expect(page.getByText("Lost the connection to magpie ui.")).toBeVisible({ timeout: 10_000 });
  await shoot(page, "12-connection-lost");
});

test("narrow window: one pane at a time", async ({ page, magpie }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await magpie.open(page);
  await allNotes(page);
  await page.getByRole("option", { name: /pdfkit/ }).click();
  await expect(page.getByRole("button", { name: "Back to the list" })).toBeVisible();
  await shoot(page, "13-narrow");
});

test("no tag list", async ({ page, magpie }) => {
  rmSync(join(magpie.journal, "tags.md"));
  await magpie.open(page);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article").getByRole("button", { name: "Create tag list" })).toBeVisible();
  await shoot(page, "14-no-tag-list");
});

test("suggest for this project", async ({ page, magpie }) => {
  writeFileSync(join(magpie.project, "package.json"), JSON.stringify({ description: "Let an agent test a web UI in the browser", keywords: ["agent-skills", "testing"], dependencies: { pdfkit: "*" } }));
  writeFileSync(join(magpie.project, "README.md"), "# Checkout tests\n\nEnd-to-end tests for the checkout, written and run by a coding agent.\n");
  await magpie.open(page);
  await page.getByRole("navigation").getByRole("button", { name: "Suggest" }).click();
  const rows = page.getByRole("listbox", { name: "Suggestions" }).getByRole("option");
  await expect(rows.last()).toContainText("In use, avoid");
  await rows.first().click();
  await expect(page.getByRole("article").getByRole("heading", { level: 2 })).toBeVisible();
  await shoot(page, "15-suggest");
});

test("adopt to project", async ({ page, magpie }) => {
  writeFileSync(join(magpie.project, "package.json"), "{}");
  await magpie.open(page);
  await allNotes(page);
  await page.getByRole("option", { name: /^pdfkit / }).click();
  await page.getByRole("button", { name: "Adopt to project" }).click();
  await expect(page.getByText("anyone who can read this repository can read this note.")).toBeVisible();
  await shoot(page, "16-adopt-confirm");
  await page.getByRole("button", { name: "Copy to the project journal" }).click();
  await expect(page.getByText("npm install pdfkit")).toBeVisible();
  await shoot(page, "17-adopt-done");
});
