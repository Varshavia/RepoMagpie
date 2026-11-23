// "Import my GitHub stars" and the Inbox's Starred tab (decision 0068, docs/ui.md §7) against magpie
// ui with a fake GitHub (fake-github.ts: 130 starred repositories) and a made-up token, so nothing
// leaves the machine.
import { mkdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

test.use({ fakeGithub: true, fakeToken: true });

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function openStars(page: Page) {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import my GitHub stars" }).click();
  await expect(page.getByRole("status").filter({ hasText: "130 stars: 130 new, 0 already in your journal." })).toBeVisible();
}

async function importTwo(page: Page) {
  await page.getByRole("button", { name: "Uncheck all" }).click();
  await page.getByRole("checkbox", { name: "Import microsoft/playwright" }).check();
  await page.getByRole("checkbox", { name: "Import colinhacks/zod" }).check();
  await page.getByRole("button", { name: "Import selected (2)" }).click();
  await expect(page.getByText("Imported 2 starred notes. They are in the Inbox's Starred tab until you write a Verdict.")).toBeVisible();
}

test("preview: the summary, 100 rows a page with the 100 newest checked, the filters; then only the checked rows are imported", async ({ page, magpie }) => {
  await magpie.open(page);
  await openStars(page);
  const table = page.getByRole("table", { name: "Your GitHub stars" });
  await expect(table.getByRole("row")).toHaveCount(101); // the header and one page
  await expect(page.getByRole("button", { name: "Import selected (100)" })).toBeVisible();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: "request/request" })).toContainText("archived");

  await page.getByRole("combobox", { name: "Language" }).selectOption("Rust");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Import selected (1)" })).toBeVisible();
  await page.getByRole("combobox", { name: "Language" }).selectOption("");

  await importTwo(page);
  await expect(page.getByRole("status").filter({ hasText: "130 stars: 128 new, 2 already in your journal." })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Import colinhacks/zod" })).toBeDisabled();
  const zod = readFileSync(magpie.note("github--colinhacks--zod.md"), "utf8");
  expect(zod).toContain("starred: 2026-11-12");
  expect(zod).toContain("status: inbox");
  expect(() => readFileSync(magpie.note("github--astral-sh--ruff.md"), "utf8")).toThrow(); // not checked: not written
});

test("a star whose note is in the trash: skipped, counted in the summary, and its row can't be checked", async ({ page, magpie }) => {
  await magpie.open(page);
  await openStars(page);
  await importTwo(page);
  // As repomagpie delete leaves it: the file moved to the journal's trash with a stamp.
  mkdirSync(join(magpie.journal, ".trash"), { recursive: true });
  renameSync(magpie.note("github--colinhacks--zod.md"), join(magpie.journal, ".trash", "github--colinhacks--zod.20261124-090000Z.md"));

  await page.reload();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import my GitHub stars" }).click();
  await expect(page.getByRole("status").filter({ hasText: "130 stars: 128 new, 1 already in your journal, 1 skipped because they're in the trash." })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Import colinhacks/zod" })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "Import colinhacks/zod" })).not.toBeChecked();
  await expect(page.getByRole("table", { name: "Your GitHub stars" }).getByRole("row").filter({ hasText: "colinhacks/zod" })).toContainText("personal trash");
});

test("the Starred tab: starred notes leave the main inbox, each tab shows its count, and a Verdict moves a note out", async ({ page, magpie }) => {
  await magpie.open(page);
  await expect(page.getByRole("radiogroup", { name: "Inbox" })).toHaveCount(0); // no tab before there are starred notes
  await openStars(page);
  await importTwo(page);

  await page.getByRole("navigation", { name: "Journals and screens" }).getByRole("button", { name: /^Inbox/ }).click();
  const tabs = page.getByRole("radiogroup", { name: "Inbox" });
  await expect(tabs.getByRole("radio", { name: "Inbox 3" })).toBeChecked();
  await expect(tabs.getByRole("radio", { name: "Starred 2" })).toBeVisible();
  const list = page.getByRole("listbox", { name: "Inbox" });
  await expect(list.getByRole("option")).toHaveCount(3);
  await expect(list.getByRole("option").filter({ hasText: "colinhacks/zod" })).toHaveCount(0);

  await tabs.getByRole("radio", { name: "Starred 2" }).click();
  await expect(list.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Enter");
  const verdict = page.getByRole("textbox", { name: "Verdict" });
  await expect(verdict).toBeFocused();
  await page.keyboard.type("default for schema validation");
  await page.keyboard.press(`${MOD}+Enter`);
  await expect(page.getByRole("status").getByText("Verdict saved")).toBeVisible();
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(tabs.getByRole("radio", { name: "Starred 1" })).toBeChecked();
  await expect(tabs.getByRole("radio", { name: "Inbox 3" })).toBeVisible();
});
