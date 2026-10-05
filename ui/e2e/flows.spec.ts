// End-to-end flows of the local app (docs/ui.md §11) against magpie ui on a temporary journal:
// inbox review, search, add, import, conflicts, live updates, the palette and the keyboard map.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { renderNote } from "../../src/core/write.ts";
import { expect, test } from "./fixtures.ts";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

test("inbox review: Enter, write the Verdict, Ctrl+Enter; the note is reviewed and the next one opens", async ({ page, magpie }) => {
  await magpie.open(page);
  const inbox = page.getByRole("listbox", { name: "Inbox" });
  await expect(inbox.getByRole("option")).toHaveCount(3);
  const started = Date.now();
  await page.keyboard.press("Enter");
  const verdict = page.getByRole("textbox", { name: "Verdict" });
  await expect(verdict).toBeFocused();
  await page.keyboard.type("Use when entering a large unfamiliar codebase");
  await page.keyboard.press(`${MOD}+Enter`);
  await expect(page.getByRole("status").getByText("Verdict saved")).toBeVisible();
  // The next inbox note is open, with its Verdict editor focused: no mouse needed.
  await expect(page.getByRole("heading", { level: 2, name: "microsoft/playwright-cli" })).toBeVisible();
  await expect(verdict).toBeFocused();
  expect(Date.now() - started).toBeLessThan(15_000);
  await expect(inbox.getByRole("option")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Inbox, 2 notes" })).toBeVisible();
  const text = readFileSync(magpie.note("github--egonex-ai--understand-anything.md"), "utf8");
  expect(text).toContain("## Verdict\nUse when entering a large unfamiliar codebase\n");
  expect(text).toContain("status: reviewed");
});

test("inbox review: kind, tags, tried and rating are saved with the Verdict", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "Verdict" }).fill("fine for quick graphs");
  await page.getByLabel("Kind").selectOption("cli");
  await page.getByRole("group", { name: "Tags" }).getByRole("button", { name: "testing" }).click();
  await page.getByLabel("Tried it").check();
  await page.getByRole("radio", { name: "4 of 5" }).click();
  await page.getByRole("button", { name: /Save Verdict/ }).click();
  await expect(page.getByRole("status").getByText("Verdict saved")).toBeVisible();
  const text = readFileSync(magpie.note("github--egonex-ai--understand-anything.md"), "utf8");
  expect(text).toMatch(/kind: cli/);
  expect(text).toMatch(/tags: \[agent-skills, code-understanding, testing\]/);
  expect(text).toMatch(/tried: true/);
  expect(text).toMatch(/rating: 4/);
});

test("search: / focuses the box, Verdicts first, Enter opens the note; the status filter applies", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.keyboard.type("pdf");
  const results = page.getByRole("listbox", { name: "Search results" });
  await expect(results.getByRole("option").first()).toContainText("pdfkit");
  await expect(results.getByRole("option").first()).toContainText("avoid: async streams painful");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "pdfkit" })).toBeVisible();
  await page.getByRole("searchbox").fill("skills");
  await page.getByRole("radio", { name: "Inbox" }).click();
  for (const row of await results.getByRole("option").all()) await expect(row).toContainText("no verdict yet");
});

test("add: preview a package, write the Verdict, save; the note is on disk", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Package, PURL or GitHub URL").fill("pkg:npm/left-pad");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("region", { name: "Preview" })).toContainText("New note");
  await page.getByLabel(/^Verdict/).fill("avoid: use String.prototype.padStart");
  await page.keyboard.press(`${MOD}+Enter`);
  await expect(page.getByText("Saved to your personal journal: pkg:npm/left-pad")).toBeVisible();
  const text = readFileSync(magpie.note("npm--left-pad.md"), "utf8");
  expect(text).toContain("## Verdict\navoid: use String.prototype.padStart\n");
  await page.getByRole("button", { name: "Open the note" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "left-pad" })).toBeVisible();
});

test("add: a note that already has a Verdict says so before you write one", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Package, PURL or GitHub URL").fill("pkg:npm/pdfkit");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("This note already has a Verdict")).toBeVisible();
  await expect(page.getByLabel(/^Verdict/)).toBeDisabled();
});

test("import: check the lines (nothing written), then import them", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByLabel("Lines").fill("- pkg:npm/left-pad — verdict: avoid; use padStart\n- pkg:pypi/requests — use: HTTP in scripts\n- not a package!");
  await page.getByRole("button", { name: "Check lines" }).click();
  await expect(page.getByText("magpie wrote nothing yet: 2 to create, 0 to update, 0 unchanged, 1 failing.")).toBeVisible();
  expect(existsSync(magpie.note("npm--left-pad.md"))).toBe(false);
  await page.getByRole("button", { name: "Import 3 lines" }).click();
  await expect(page.getByText("2 created, 0 updated, 0 unchanged, 1 failed.")).toBeVisible();
  expect(readFileSync(magpie.note("npm--left-pad.md"), "utf8")).toContain("avoid; use padStart");
  expect(existsSync(magpie.note("pypi--requests.md"))).toBe(true);
  // A change to the lines needs a new check.
  await page.getByLabel("Lines").fill("- pkg:npm/chalk");
  await expect(page.getByRole("main").getByRole("button", { name: "Import", exact: true })).toBeDisabled();
});

test("conflict: a save against an old version gets 409; the banner reloads; nothing was overwritten", async ({ page, magpie }) => {
  await magpie.open(page);
  // Make every edit carry an old version, as if the file had changed since it was read.
  await page.route("**/api/note", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), version: "sha256:old" }) });
  });
  const file = magpie.note("github--egonex-ai--understand-anything.md");
  const before = readFileSync(file, "utf8");
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "Verdict" }).fill("my Verdict");
  await page.keyboard.press(`${MOD}+Enter`);
  await expect(page.getByText("This note changed on disk since you opened it.")).toBeVisible();
  expect(readFileSync(file, "utf8")).toBe(before);
  await page.unroute("**/api/note");
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByRole("textbox", { name: "Verdict" })).toHaveValue("my Verdict");
  await page.getByRole("button", { name: /Save Verdict/ }).click();
  await expect(page.getByRole("status").getByText("Verdict saved")).toBeVisible();
  expect(readFileSync(file, "utf8")).toContain("## Verdict\nmy Verdict\n");
});

test("live: an edit in another editor shows the conflict banner while you write; Reload keeps your text", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "Verdict" }).fill("mine");
  const file = magpie.note("github--egonex-ai--understand-anything.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("## My notes\n", "## My notes\nWritten in Obsidian.\n"));
  await expect(page.getByText("This note changed on disk since you opened it.")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByText("Written in Obsidian.")).toBeVisible();
  await page.getByRole("button", { name: /Save Verdict/ }).click();
  await expect(page.getByRole("status").getByText("Verdict saved")).toBeVisible();
  const text = readFileSync(file, "utf8");
  expect(text).toContain("Written in Obsidian.");
  expect(text).toContain("## Verdict\nmine\n");
});

test("live: a note added on disk appears in the list within 5 seconds", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  writeFileSync(magpie.note("npm--chalk.md"), renderNote({ id: "pkg:npm/chalk", name: "chalk", explored: "2026-10-06", kind: "library", tags: [], verdict: "fine for colours" }));
  await expect(page.getByRole("option", { name: /chalk/ })).toBeVisible({ timeout: 5_000 });
});

test("read-only: a note that can't be parsed shows the banner and no editor", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("option", { name: /npm--broken\.md/ }).click();
  await expect(page.getByRole("note")).toContainText("read-only");
  await expect(page.getByRole("button", { name: "Open in editor" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Write the Verdict|Edit/ })).toHaveCount(0);
});

test("palette: Ctrl/Cmd+K finds a note and runs an action; ? shows the keyboard map", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.keyboard.press(`${MOD}+k`);
  await page.keyboard.type("puppeteer");
  await page.getByRole("option", { name: /^puppeteer/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "puppeteer" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Project" })).toBeChecked();
  await page.keyboard.press(`${MOD}+k`);
  await page.keyboard.type("settings");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("keyboard: j/k move the selection, g i and g s switch screens", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  const selected = page.getByRole("listbox", { name: "All notes" }).locator('[aria-selected="true"]');
  await expect(selected).toContainText("Egonex-AI");
  await page.keyboard.press("j");
  await expect(selected).toContainText("Leonxlnx/taste-skill");
  await page.keyboard.press("k");
  await expect(selected).toContainText("Egonex-AI");
  await page.keyboard.press("g");
  await page.keyboard.press("s");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("g");
  await page.keyboard.press("i");
  await expect(page.getByRole("listbox", { name: "Inbox" })).toBeVisible();
});

test("the first Tab reaches the skip link, which moves focus to the main pane", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.locator("body").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to the main pane" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("the CSP holds: no violation while the app runs", async ({ page, magpie }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/.test(message.text())) violations.push(message.text());
  });
  await magpie.open(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press(`${MOD}+k`);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /All notes/ }).click();
  expect(violations).toEqual([]);
});

test.describe("2,000 notes", () => {
  test.use({ generated: 2000 });
  // From the URL magpie ui printed to the first rows on screen. The budget is for a warm cache, as
  // for search and recall (spec §7); the cold first run, which builds the note-list cache, is reported.
  test("first render under 1 s with a warm cache, with only the visible rows in the DOM", async ({ page, magpie }, info) => {
    const firstRow = page.getByRole("listbox", { name: "Inbox" }).getByRole("option").first();
    let started = Date.now();
    await page.goto(magpie.server.url);
    await expect(firstRow).toBeVisible();
    const cold = Date.now() - started;
    await expect(page.getByRole("button", { name: "All notes, 2000 notes" })).toBeVisible();

    await page.context().clearCookies();
    started = Date.now();
    await page.goto(magpie.server.url);
    await expect(firstRow).toBeVisible();
    const warm = Date.now() - started;
    info.annotations.push({ type: "first render, 2,000 notes", description: `warm cache ${warm} ms; cold ${cold} ms` });
    console.log(`first render with 2,000 notes: warm cache ${warm} ms; cold (building the cache) ${cold} ms`);

    await page.getByRole("button", { name: /All notes/ }).click();
    expect(await page.getByRole("option").count()).toBeLessThan(40);
    expect(warm).toBeLessThan(1000);
  });
});
