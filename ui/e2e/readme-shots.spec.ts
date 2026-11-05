// The README's screenshots (docs/assets/screen-*.png), dark, 1440×900, from the showcase journal
// (showcase.ts). Run with README_SHOTS=1; skipped otherwise. They overwrite the files in docs/assets/.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { removeFolder } from "../../src/core/copy-folder.ts";
import { STARTER_TAGS } from "../../src/core/journals.ts";
import { expect, test } from "./fixtures.ts";
import { gitOnPath } from "./journal.ts";

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
  // The Verdict at the top, so the suggested domains below it (showcase.ts) are in view too.
  await page.getByRole("textbox", { name: "Verdict" }).evaluate((el) => (el.closest(".field") ?? el).scrollIntoView({ block: "start" }));
  await shoot(page, "screen-inbox-review");
});

test("check a package", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Check a package" }).click();
  await page.getByLabel("Packages").fill("pdfkit left-pad");
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

// The Project view of a real repository (no network: the remote is only a name) whose project
// journal is committed, so the header names it and says the shared notes are committed.
test("project view", async ({ page, magpie }) => {
  expect(gitOnPath(magpie.server.path), `git isn't on magpie ui's PATH: ${magpie.server.path}`).toBe(true);
  removeFolder(join(magpie.project, ".git")); // the fixture's empty fence
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: dirname(magpie.project) };
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: magpie.project, env, stdio: "ignore" });
  git("init", "-q");
  git("remote", "add", "origin", "https://github.com/acme/checkout.git");
  // What "Turn on shared notes" writes beside the notes, so the app's .cache/ stays out of git.
  writeFileSync(join(magpie.project, ".magpie", ".gitignore"), ".cache/\n.trash/\n");
  writeFileSync(join(magpie.project, ".magpie", "tags.md"), STARTER_TAGS);
  git("add", ".magpie");
  git("commit", "-q", "-m", "Add the team's notes");
  await magpie.open(page);
  await page.getByRole("radio", { name: "Project" }).click();
  await expect(page.locator(".repository").getByRole("link", { name: "acme/checkout" })).toBeVisible();
  await expect(page.locator(".repository")).toContainText("Shared notes are committed.");
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("listbox", { name: "All notes" }).getByRole("option").filter({ hasText: "zod" }).click();
  await expect(page.getByRole("article").getByRole("heading", { level: 2, name: "zod" })).toBeVisible();
  await shoot(page, "screen-project");
});

// Nothing selected: a selection dims the rest of the graph and hides its labels, so the shot keeps
// every label that fits (decision 0044) rather than a note open beside it. Coloured by domain.
test("graph", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(page.locator(".graph-canvas")).toHaveAttribute("data-settled", "true", { timeout: 10_000 });
  await page.getByRole("checkbox", { name: "Colour by domain" }).check();
  await expect(page.getByRole("group", { name: "Legend" })).toBeVisible();
  await shoot(page, "screen-graph");
});
