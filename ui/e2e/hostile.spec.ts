// Hostile notes in the local app (decision 0032, rule 7, docs/ui.md §3): links only for http and
// https, note text never rendered as HTML, and files the journal skipped shown to the user. The
// payloads are inert: they would only set document.title, and they must never run.
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./fixtures.ts";

const HOSTILE = `---
id: pkg:npm/hostile
name: hostile
url: "javascript:void(document.title='pwned')"
homepage: "data:text/html,<b>pwned</b>"
explored: 2026-10-04
kind: library
tags: []
tried: false
status: reviewed
---

## Verdict
avoid: <img src=x onerror="document.title='pwned'"><b>bold</b> <script>document.title='pwned'</script>

## My notes
[js link](javascript:void(document.title='pwned')) and [vb link](vbscript:msgbox) and [data link](data:text/html,pwned) and [fine](https://example.invalid/ok)
`;

test("hostile URLs: javascript:, data: and vbscript: in url, homepage and a body link render as text; https stays a link", async ({ page, magpie }) => {
  writeFileSync(magpie.note("npm--hostile.md"), HOSTILE);
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("option", { name: /hostile/ }).click();
  const pane = page.locator('section[aria-label="Note"]');
  await expect(pane.getByRole("heading", { level: 2, name: "hostile" })).toBeVisible();

  const hrefs = await pane.locator("a[href]").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  for (const href of hrefs) expect(href, href).toMatch(/^(https?:\/\/|#)/);
  await expect(pane.locator('a[href="https://example.invalid/ok"]')).toHaveText("fine");
  await expect(pane.getByRole("link", { name: "Open repository" })).toHaveCount(0); // url isn't http(s)
  for (const text of ["[js link](javascript:", "[vb link](vbscript:msgbox)", "[data link](data:text/html,pwned)"]) {
    await expect(pane.getByText(text, { exact: false })).toBeVisible();
  }
  await expect(page).not.toHaveTitle("pwned");
});

test("a Verdict with HTML in it shows the text, not markup", async ({ page, magpie }) => {
  writeFileSync(magpie.note("npm--hostile.md"), HOSTILE);
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("option", { name: /hostile/ }).click();
  const pane = page.locator('section[aria-label="Note"]');
  await expect(pane.getByText("<b>bold</b>", { exact: false }).first()).toBeVisible();
  await expect(pane.locator("img, script, b")).toHaveCount(0);
  await expect(page.locator("main img, main script:not([src])")).toHaveCount(0);
  await expect(page).not.toHaveTitle("pwned");
});

// Hidden characters (decision 0032, rule 1, in the app): read views show each control, bidi or
// zero-width character as a visible marker, never raw and never dropped; the note warns; the editor
// keeps the raw text. Every special character is built from its code point.
const ch = (code: number) => String.fromCharCode(code);
const marker = (code: number) => `<U+${code.toString(16).toUpperCase().padStart(4, "0")}>`;
const RAW = new RegExp(`[${ch(0x00)}-${ch(0x08)}${ch(0x0b)}${ch(0x0c)}${ch(0x0e)}-${ch(0x1f)}${ch(0x7f)}-${ch(0x9f)}${ch(0x200b)}-${ch(0x200f)}${ch(0x202a)}-${ch(0x202e)}${ch(0x2066)}-${ch(0x2069)}${ch(0xfeff)}]`);
const HIDDEN_NOTE = `---
id: pkg:npm/hidden
name: "hid${ch(0x200b)}den"
explored: 2026-10-04
kind: library
tags: []
tried: false
alternatives: ["[[${ch(0x0440)}ad-left]]", "[[pad kit]]"]
status: reviewed
---

## Verdict
avoid: see ${ch(0x202e)}txt.exe${ch(0x202c)} now ${ch(0x1b)}[2J and ${ch(0x07)}

## My notes
plain${ch(0x200b)}text
`;
const SHOWN_VERDICT = `avoid: see ${marker(0x202e)}txt.exe${marker(0x202c)} now ${marker(0x1b)}[2J and ${marker(0x07)}`;

test("hidden characters: the note view shows markers in order, warns above the sections, and the editor keeps the raw text", async ({ page, magpie }) => {
  writeFileSync(magpie.note("npm--hidden.md"), HIDDEN_NOTE);
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  const row = page.getByRole("listbox", { name: "All notes" }).getByRole("option").filter({ hasText: "txt.exe" });
  await expect(row).toContainText(`hid${marker(0x200b)}den`); // the list preview
  await expect(row).toContainText(SHOWN_VERDICT);
  expect(await row.evaluate((el) => el.textContent ?? "")).not.toMatch(RAW);
  await row.click();
  const pane = page.locator('section[aria-label="Note"]');
  await expect(pane.getByRole("heading", { level: 2 })).toHaveText(`hid${marker(0x200b)}den`);
  const warning = pane.getByText("This note contains hidden or control characters");
  await expect(warning).toBeVisible();
  await expect(pane).toContainText(SHOWN_VERDICT); // "txt.exe" stays in order
  await expect(pane).toContainText(`plain${marker(0x200b)}text`);
  expect(await pane.evaluate((el) => el.textContent ?? "")).not.toMatch(RAW);

  await pane.getByRole("button", { name: "Edit My notes" }).click();
  await expect(warning).toBeVisible(); // still there while editing
  expect(await pane.getByRole("textbox", { name: "My notes" }).inputValue()).toBe(`plain${ch(0x200b)}text`); // the raw text
});

test("hidden characters: search results and Check a package show the markers too", async ({ page, magpie }) => {
  writeFileSync(magpie.note("npm--hidden.md"), HIDDEN_NOTE);
  await magpie.open(page);
  await page.keyboard.press("/");
  await page.getByRole("searchbox", { name: "Search both journals" }).fill("hidden");
  const results = page.getByRole("listbox", { name: "Search results" });
  await expect(results).toContainText(SHOWN_VERDICT);
  expect(await results.evaluate((el) => el.textContent ?? "")).not.toMatch(RAW);
  await page.getByRole("button", { name: "Check a package" }).click();
  await page.getByLabel("Packages").fill("hidden");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  const card = page.locator("article").filter({ hasText: "txt.exe" });
  await expect(card).toContainText(SHOWN_VERDICT);
  expect(await card.evaluate((el) => el.textContent ?? "")).not.toMatch(RAW);
});

test("hidden characters: a Use when item typed in Add shows markers in the form, is written as typed, and shows markers on the note", async ({ page, magpie }) => {
  const typed = `invoices ${ch(0x202e)}fdp${ch(0x07)}`;
  await magpie.open(page);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Package, PURL or GitHub URL").fill("pkg:npm/hidden-item");
  const use = page.getByRole("textbox", { name: "Use when" });
  await use.fill(typed);
  await use.press("Enter");
  const list = page.getByRole("list", { name: "Use when: items to add" });
  await expect(list).toContainText(`invoices ${marker(0x202e)}fdp${marker(0x07)}`);
  expect(await list.evaluate((el) => el.textContent ?? "")).not.toMatch(RAW);
  await page.getByRole("button", { name: /Save note/ }).click();
  await expect(page.getByText(/Saved to your personal journal/)).toBeVisible();
  expect(readFileSync(magpie.note("npm--hidden-item.md"), "utf8")).toContain(`## Use when\n- ${typed}\n`);
  await page.getByRole("button", { name: "Open the note" }).click();
  const pane = page.locator('section[aria-label="Note"]');
  await expect(pane).toContainText(`invoices ${marker(0x202e)}fdp${marker(0x07)}`);
  expect(await pane.evaluate((el) => el.textContent ?? "")).not.toMatch(RAW);
});

test("the note view's alternative chips flag look-alike and invalid names, as Check a package does", async ({ page, magpie }) => {
  writeFileSync(magpie.note("npm--hidden.md"), HIDDEN_NOTE);
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("listbox", { name: "All notes" }).getByRole("option").filter({ hasText: "txt.exe" }).click();
  const chip = (name: string) => page.locator('section[aria-label="Note"] .alternatives .chips li').filter({ hasText: name });
  await expect(chip(`${ch(0x0440)}ad-left`)).toContainText("(non-ASCII letters)");
  await expect(chip("pad kit")).toContainText("(not a valid package name)");
});

test("delete: a name with HTML and a bidi control shows as text with a marker, in the dialog and the toast", async ({ page, magpie }) => {
  const name = `<img src=x onerror=document.title="pwned">pdf${ch(0x202e)}kit`;
  const shown = `<img src=x onerror=document.title="pwned">pdf${marker(0x202e)}kit`;
  writeFileSync(magpie.note("npm--hostile.md"), `---\nid: pkg:npm/hostile\nname: '${name}'\nexplored: 2026-10-04\nkind: library\ntags: []\ntried: false\nstatus: reviewed\n---\n\n## Verdict\nfine\n`);
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("listbox", { name: "All notes" }).getByRole("option").filter({ hasText: "onerror" }).click();
  await page.getByRole("button", { name: "Delete note" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading")).toHaveText(`Move ${shown} to the trash?`);
  await expect(dialog.getByRole("button", { name: "Move to trash" })).toBeEnabled();
  expect(await dialog.evaluate((el) => el.textContent ?? "")).not.toMatch(RAW);
  await dialog.getByRole("button", { name: "Move to trash" }).click();
  const toast = page.locator(".toast").filter({ hasText: "to the trash" });
  await expect(toast).toContainText(`Moved ${shown} to the trash`);
  expect(await toast.evaluate((el) => el.textContent ?? "")).not.toMatch(RAW);
  await expect(page.locator("img")).toHaveCount(0);
  await expect(page).not.toHaveTitle("pwned");
});

// Red-team R6 (a web page): the session token never leaves the app through a link.
test("R6: after the first load the token isn't in the address bar; pages send no Referer; note links open with noreferrer", async ({ page, magpie }) => {
  writeFileSync(magpie.note("npm--hostile.md"), HOSTILE);
  const first = page.waitForResponse((r) => r.url().includes("?token="));
  await magpie.open(page);
  expect((await first).status()).toBe(303);
  expect(page.url()).not.toContain("token");
  const html = await page.request.get(new URL("/", page.url()).href);
  expect(html.headers()["referrer-policy"]).toBe("no-referrer");
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("option", { name: /hostile/ }).click();
  const external = page.locator('a[target="_blank"]');
  await expect(external.first()).toBeVisible();
  for (const rel of await external.evaluateAll((links) => links.map((a) => a.getAttribute("rel") ?? ""))) {
    expect(rel.split(/\s+/)).toContain("noreferrer"); // implies noopener
  }
  expect(await page.evaluate(() => document.referrer)).toBe("");
});

test("a note that is a link to a file outside the journal shows up as skipped, and its text doesn't", async ({ page, magpie }) => {
  const outside = join(magpie.root, "outside");
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "secret.md"), "---\nid: pkg:npm/secret\nname: secret\n---\n\n## Verdict\nSECRET-TOKEN-example-invalid\n");
  try {
    symlinkSync(join(outside, "secret.md"), magpie.note("npm--secret.md"), "file");
  } catch (error) {
    test.skip(true, `can't create a file link here: ${(error as NodeJS.ErrnoException).code}`);
  }
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  const skipped = page.getByRole("region", { name: "Skipped files" });
  await expect(skipped).toContainText("Skipped 1 file in this journal");
  await expect(skipped).toContainText("npm--secret.md is a link (a symbolic link or junction)");
  await expect(page.getByText("SECRET-TOKEN-example-invalid")).toHaveCount(0);
  await expect(page.getByRole("option", { name: /secret/ })).toHaveCount(0);
});
