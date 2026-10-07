// End-to-end flows of the local app (docs/ui.md §11) against magpie ui on a temporary journal:
// inbox review, search, add, import, conflicts, live updates, the palette and the keyboard map.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { STARTER_TAGS } from "../../src/core/journals.ts";
import { runSearch } from "../../src/core/search.ts";
import { runSuggest } from "../../src/core/suggest.ts";
import { whyLine } from "../src/logic/suggest.ts";
import { renderNote } from "../../src/core/write.ts";
import { expect, test } from "./fixtures.ts";
import { PDFKIT } from "./journal.ts";

const MOD = process.platform === "darwin" ? "Meta" : "Control";
// Today in local time, as magpie writes it (adopted:).
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

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

test("note view: Tried and the rating under the title; nothing for a note neither tried nor rated", async ({ page, magpie }) => {
  const file = magpie.note("github--egonex-ai--understand-anything.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("tried: false", "tried: true").replace(/^rating:.*$/m, "rating: 3"));
  await magpie.open(page);
  const inbox = page.getByRole("listbox", { name: "Inbox" });
  await inbox.getByRole("option").filter({ hasText: "Understand-Anything" }).click();
  await expect(page.locator(".note-head").getByText("Tried · rated 3 of 5")).toBeVisible();
  await inbox.getByRole("option").filter({ hasNotText: "Understand-Anything" }).first().click();
  await expect(page.locator(".note-head h2")).not.toHaveText("Egonex-AI/Understand-Anything");
  await expect(page.locator(".note-head .note-tried")).toHaveCount(0);
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

test("import: a list copied out of a chat is read leniently; without items, the hint names the first line", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const lines = page.getByLabel("Lines");
  await lines.fill("1. pkg:npm/left-pad — verdict: fine");
  await expect(page.getByText('No items yet. Each item is a line that starts with "- ". Line 1 starts with "1.".')).toBeVisible();
  await lines.fill("\\- pkg:npm/left-pad — verdict: fine\n* pkg:npm/chalk\n+ pkg:pypi/requests");
  await expect(page.getByText("3 items.")).toBeVisible();
  await page.getByRole("button", { name: "Check lines" }).click();
  await expect(page.getByText("magpie wrote nothing yet: 3 to create, 0 to update, 0 unchanged, 0 failing.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "pkg:npm/left-pad" })).toBeVisible();
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

test("palette: a word finds what magpie search finds, by name and by tag, in its order", async ({ page, magpie }) => {
  const { document } = runSearch({ query: "design", limit: 6 }, { home: magpie.home, env: { MAGPIE_HOME: magpie.journal }, cwd: magpie.project });
  const expected = document.results.map((r) => (r.type === "skill" ? `${r.skill} · ${r.name}` : r.name));
  expect(expected).toEqual(expect.arrayContaining(["VoltAgent/awesome-design-md", "Leonxlnx/taste-skill"])); // by name; tagged design
  await magpie.open(page);
  await page.keyboard.press(`${MOD}+k`);
  await page.keyboard.type("design");
  // Inside the palette: the inbox list behind it has the same note names.
  const notes = page.getByRole("dialog", { name: "Command palette" }).getByRole("group", { name: "Notes and skills" });
  await expect(notes.getByRole("option").locator(".label")).toHaveText(expected);
});

test("palette: no 'nothing matches' before the search answers; a failed search says why", async ({ page, magpie }) => {
  let answer: () => void = () => {};
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route("**/api/search?*", async (route) => {
    await answered;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ query: "design", results: [], error: "The search index can't be read." }) });
  });
  await magpie.open(page);
  await page.keyboard.press(`${MOD}+k`);
  await page.keyboard.type("design");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette.getByText("Searching…")).toBeVisible();
  await expect(palette).not.toContainText("Nothing matches");
  answer();
  await expect(palette.getByText("The search index can't be read.")).toBeVisible();
  await expect(palette).not.toContainText("Nothing matches");
});

test("a scoped npm package is shown as people write it; the copied PURL stays encoded", async ({ page, magpie, context }) => {
  writeFileSync(magpie.note("npm--babel--core.md"), renderNote({ id: "pkg:npm/%40babel/core", name: "@babel/core", explored: "2026-10-06", kind: "library", tags: [], verdict: "fine", packages: ["pkg:npm/%40babel/core"] }));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("option", { name: /microsoft\/playwright-cli/ }).click();
  const note = page.getByRole("article");
  await expect(note.getByRole("list", { name: "Details" }).getByText("@playwright/cli", { exact: true })).toBeVisible();
  await expect(note).not.toContainText("%40");
  await page.getByRole("option", { name: /@babel\/core/ }).click();
  await expect(note.getByText("pkg:npm/@babel/core", { exact: true })).toBeVisible();
  await expect(note).not.toContainText("%40");
  await note.getByRole("button", { name: "Copy PURL" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("pkg:npm/%40babel/core");
});

test("a journal without tags.md: an empty state, and the starter list only on the user's click", async ({ page, magpie }) => {
  const tagList = join(magpie.journal, "tags.md");
  rmSync(tagList);
  await magpie.open(page);
  const tags = page.getByRole("navigation", { name: "Journals and screens" });
  await expect(tags.getByText("No tag list yet.")).toBeVisible();
  // The review form offers the same, instead of opening a file that isn't there.
  await page.keyboard.press("Enter");
  const form = page.getByRole("article");
  await expect(form.getByRole("button", { name: "Create tag list" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Edit tag list" })).toHaveCount(0);
  expect(existsSync(tagList)).toBe(false);

  await tags.getByRole("button", { name: "Create tag list" }).click();
  await expect(tags.getByText("No tag list yet.")).toHaveCount(0);
  expect(readFileSync(tagList, "utf8")).toBe(STARTER_TAGS);
  await expect(form.getByRole("button", { name: "workflow" })).toBeVisible(); // a starter tag to pick
  await expect(form.getByRole("button", { name: "Edit tag list" })).toBeVisible();
});

test("a tags.md without tags: an empty state with 'Edit tag list', which opens tags.md", async ({ page, magpie }) => {
  const tagList = join(magpie.journal, "tags.md");
  writeFileSync(tagList, "# Tags\n\nNo tags yet.\n");
  const opened: unknown[] = [];
  // Don't start an editor on the test machine; record the request instead.
  await page.route("**/api/open", async (route) => {
    opened.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ opened: true, path: tagList }) });
  });
  await magpie.open(page);
  const nav = page.getByRole("navigation", { name: "Journals and screens" });
  await expect(nav.getByText("Your tag list is empty.")).toBeVisible();
  await expect(nav.getByText("No tag list yet.")).toHaveCount(0);
  await nav.getByRole("button", { name: "Edit tag list" }).click();
  await expect(page.getByText("Opened tags.md in your editor")).toBeVisible();
  expect(opened).toEqual([{ journal: "personal", tag_list: true }]);
  expect(readFileSync(tagList, "utf8")).toBe("# Tags\n\nNo tags yet.\n");
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

test("paths under the home directory show with ~, as magpie recall prints them: note view, Check a package, Settings, Suggest", async ({ page, magpie }) => {
  const shown = async () => page.locator("body").innerText();
  writeFileSync(join(magpie.project, "package.json"), JSON.stringify({ description: "Render PDF invoices" }));
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("listbox", { name: "All notes" }).getByRole("option").filter({ hasText: "pdfkit" }).click();
  await expect(page.getByRole("article").getByText(`~${sep}.magpie${sep}notes${sep}npm--pdfkit.md`)).toBeVisible();
  expect(await shown()).not.toContain(magpie.home);

  await page.getByRole("button", { name: "Check a package" }).click();
  await page.getByLabel("Packages").fill("pdfkit puppeteer");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText(`~${sep}.magpie${sep}notes${sep}npm--pdfkit.md`)).toBeVisible();
  expect(await shown()).not.toContain(magpie.home);

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText(`~${sep}.magpie`, { exact: true })).toBeVisible();
  expect(await shown()).not.toContain(magpie.home);

  await page.getByRole("navigation").getByRole("button", { name: "Suggest" }).click();
  await expect(page.getByText(/From the manifests and README in ~/)).toBeVisible();
  expect(await shown()).not.toContain(magpie.home);
});

test("the favicon: the magpie mark, an SVG served by magpie ui", async ({ page, magpie }) => {
  await magpie.open(page);
  const href = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(href).toBeTruthy();
  const icon = await page.evaluate(async (url) => {
    const r = await fetch(url);
    return { status: r.status, type: r.headers.get("content-type") ?? "", text: await r.text() };
  }, href ?? "");
  expect(icon.status).toBe(200);
  expect(icon.type).toContain("image/svg+xml");
  expect(icon.text).toContain("<title");
});

test("suggest: what magpie suggest finds for this project, in its order; the in-use avoid note apart; a description instead", async ({ page, magpie }) => {
  writeFileSync(join(magpie.project, "package.json"), JSON.stringify({ description: "Let an agent test a web UI in the browser", dependencies: { pdfkit: "*" } }));
  const place = { home: magpie.home, env: { MAGPIE_HOME: magpie.journal }, cwd: magpie.project };
  const expected = runSuggest({ limit: 20 }, place).document;
  expect(expected.candidates.length).toBeGreaterThan(1);
  expect(expected.in_use_avoid.map((m) => m.id)).toEqual(["pkg:npm/pdfkit"]);
  await magpie.open(page);
  await page.getByRole("navigation").getByRole("button", { name: "Suggest" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Suggest for this project" })).toBeVisible();
  const rows = page.getByRole("listbox", { name: "Suggestions" }).getByRole("option");
  await expect(rows).toHaveCount(expected.candidates.length + 1);
  for (const [i, c] of expected.candidates.entries()) {
    await expect(rows.nth(i)).toContainText(c.name);
    await expect(rows.nth(i)).toContainText(whyLine(c.why));
  }
  await expect(rows.last()).not.toContainText("Why:");
  await expect(rows.last()).toContainText("pdfkit");
  await expect(rows.last()).toContainText("In use, avoid");
  await expect(rows.last()).toContainText("avoid: async streams painful");
  // A candidate opens beside the list; the list stays.
  await rows.first().click();
  await expect(page.getByRole("heading", { level: 2, name: expected.candidates[0].name })).toBeVisible();
  await expect(rows).toHaveCount(expected.candidates.length + 1);

  const described = runSuggest({ description: "design system", limit: 20 }, place).document;
  await page.getByLabel("Describe the project instead").fill("design system");
  await page.getByRole("main").getByRole("button", { name: "Suggest", exact: true }).click();
  await expect(page.getByText(`Looked for: ${described.keywords.join(", ")}`)).toBeVisible();
  await expect(rows).toHaveCount(described.candidates.length + described.in_use_avoid.length);
  await expect(rows.first()).toContainText(described.candidates[0].name);
});

test("suggest: a project with nothing to go on asks for a description", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("navigation").getByRole("button", { name: "Suggest" }).click();
  await expect(page.getByText("Nothing to go on here: no package.json, pyproject.toml, Cargo.toml or README.")).toBeVisible();
  await expect(page.getByLabel("Describe the project instead")).toBeFocused();
});

test("adopt: the note reaches the project journal only after the confirm; the install command shows; nothing is installed", async ({ page, magpie }) => {
  writeFileSync(join(magpie.project, "pnpm-lock.yaml"), "");
  const fine = PDFKIT.replace("avoid: async streams painful; use puppeteer", "fine for invoices");
  writeFileSync(magpie.note("npm--pdfkit.md"), fine);
  const before = readdirSync(magpie.project).sort();
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("listbox", { name: "All notes" }).getByRole("option").filter({ hasText: "pdfkit" }).click();
  await page.getByRole("button", { name: "Adopt to project" }).click();
  await expect(page.getByText("The project journal is committed with the code; anyone who can read this repository can read this note.")).toBeVisible();
  expect(existsSync(magpie.note("npm--pdfkit.md", "project"))).toBe(false);
  await page.getByRole("button", { name: "Copy to the project journal" }).click();
  await expect(page.getByText("pnpm add pdfkit")).toBeVisible();
  await expect(page.getByRole("status").getByText("Copied to the project journal")).toBeVisible();
  expect(readFileSync(magpie.note("npm--pdfkit.md", "project"), "utf8")).toBe(fine.replace(/\n---\n/, `\nadopted: ${today()}\n---\n`));
  expect(readdirSync(magpie.project).sort()).toEqual(before);
  await page.getByRole("button", { name: "Open the project's note" }).click();
  await expect(page.getByRole("radio", { name: "Project" })).toBeChecked();
  await expect(page.getByRole("heading", { level: 2, name: "pdfkit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adopt to project" })).toHaveCount(0);
});

test("adopt: a note whose Verdict says to avoid is copied, with no install command", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("listbox", { name: "All notes" }).getByRole("option").filter({ hasText: "pdfkit" }).click();
  await page.getByRole("button", { name: "Adopt to project" }).click();
  await page.getByRole("button", { name: "Copy to the project journal" }).click();
  await expect(page.getByText("Your note says to avoid pdfkit; no install command.")).toBeVisible();
  await expect(page.getByText("npm install pdfkit")).toHaveCount(0);
  expect(existsSync(magpie.note("npm--pdfkit.md", "project"))).toBe(true);
});

test("adopt: a repository note with one package gets its command; with several, one per package to choose from", async ({ page, magpie }) => {
  writeFileSync(magpie.note("github--acme--tool.md"), renderNote({ id: "pkg:github/acme/tool", name: "acme/tool", explored: "2026-10-01", kind: "cli", tags: [], verdict: "fine", packages: ["pkg:npm/acme-tool", "pkg:cargo/acme-tool"] }));
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  const notes = page.getByRole("listbox", { name: "All notes" });
  await notes.getByRole("option", { name: /^microsoft\/playwright-cli / }).click();
  await page.getByRole("button", { name: "Adopt to project" }).click();
  await page.getByRole("button", { name: "Copy to the project journal" }).click();
  await expect(page.getByText("npm install @playwright/cli")).toBeVisible();

  await notes.getByRole("option", { name: /^acme\/tool / }).click();
  await page.getByRole("button", { name: "Adopt to project" }).click();
  await page.getByRole("button", { name: "Copy to the project journal" }).click();
  await expect(page.getByText("This repository publishes 2 packages; install the one you need:")).toBeVisible();
  await expect(page.getByText("npm install acme-tool")).toBeVisible();
  await expect(page.getByText("cargo add acme-tool")).toBeVisible();
});

test("adopt: a note the project already has is refused and left as it is", async ({ page, magpie }) => {
  const team = readFileSync(magpie.note("npm--puppeteer.md", "project"), "utf8");
  writeFileSync(magpie.note("npm--puppeteer.md"), renderNote({ id: "pkg:npm/puppeteer", name: "puppeteer", explored: "2026-10-01", kind: "library", tags: [], verdict: "my own take" }));
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("listbox", { name: "All notes" }).getByRole("option", { name: /^puppeteer / }).click();
  await page.getByRole("button", { name: "Adopt to project" }).click();
  await page.getByRole("button", { name: "Copy to the project journal" }).click();
  await expect(page.getByRole("alert").getByText(/Already in this project: .*npm--puppeteer\.md/)).toBeVisible();
  expect(readFileSync(magpie.note("npm--puppeteer.md", "project"), "utf8")).toBe(team);
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
