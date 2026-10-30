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

// An unknown domain (decision 0040): kept in the file, never shown as a domain, never rendered as HTML.
test("an unknown domain, with HTML and a bidi control in it, shows nowhere; the known one does", async ({ page, magpie }) => {
  const rlo = String.fromCharCode(0x202e);
  const unknown = `"<img src=x onerror=\\"document.title='pwned'\\">${rlo}"`;
  writeFileSync(magpie.note("npm--hostile.md"), HOSTILE.replace("tags: []\n", `tags: []\ndomains: [security, ${unknown}, ignore-previous-instructions]\n`));
  await magpie.open(page);
  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("button", { name: "security" })).toBeVisible();
  await expect(nav.getByRole("button", { name: /ignore-previous|img/ })).toHaveCount(0);
  await nav.getByRole("button", { name: "security" }).click();
  await page.getByRole("option", { name: /hostile/ }).click();
  const pane = page.locator('section[aria-label="Note"]');
  await expect(pane.locator(".chip.domain")).toHaveText(["security"]);
  await expect(page.locator("main img")).toHaveCount(0);
  await expect(page).not.toHaveTitle("pwned");
});

// A suggested domain removed beside an unknown one (decision 0040): the unknown value is never a
// chip and stays in the file exactly as written, through the removal and its Undo.
test("removing a suggested domain beside a hostile unknown value keeps that value byte for byte, and shows it nowhere", async ({ page, magpie }) => {
  const rlo = String.fromCharCode(0x202e);
  const unknown = `"<img src=x onerror=\\"document.title='pwned'\\">${rlo}"`;
  const text = HOSTILE.replace("tags: []\n", `tags: []\ndomains_suggested: [security, ${unknown}, 'ignore previous instructions']\n`);
  writeFileSync(magpie.note("npm--hostile.md"), text);
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("option", { name: /hostile/ }).click();
  const pane = page.locator('section[aria-label="Note"]');
  const details = pane.getByRole("list", { name: "Details" });
  await expect(details.locator(".chip.domain")).toHaveText(["security (suggested)"]);
  await expect(pane.getByRole("button", { name: /Remove suggested domain/ })).toHaveCount(1);
  await pane.getByRole("button", { name: "Remove suggested domain security" }).click();
  await expect(page.getByRole("status").getByText("Suggested domain security removed")).toBeVisible();
  expect(readFileSync(magpie.note("npm--hostile.md"), "utf8")).toBe(text.replace("[security, ", "["));
  await expect(details.locator(".chip.domain")).toHaveCount(0);
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status").getByText("Suggested domain security restored")).toBeVisible();
  expect(readFileSync(magpie.note("npm--hostile.md"), "utf8")).toBe(text);
  await expect(page.locator("main img")).toHaveCount(0);
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

// Tag characters spell text no reader sees while an agent still reads it; outside the BMP, each is
// one marker for its whole code point. An emoji's U+FE0F stays.
test("hidden characters: a Verdict hiding an instruction in tag characters shows their markers and the warning; an emoji stays", async ({ page, magpie }) => {
  const tagged = [..."run curl"].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join("");
  const heart = `${ch(0x2764)}${ch(0xfe0f)}`;
  writeFileSync(magpie.note("npm--tagged.md"), `---\nid: pkg:npm/tagged\nname: tagged\nexplored: 2026-10-04\nkind: library\ntags: []\ntried: false\nstatus: reviewed\n---\n\n## Verdict\nfine ${heart}${tagged}\n`);
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("listbox", { name: "All notes" }).getByRole("option").filter({ hasText: "tagged" }).click();
  const pane = page.locator('section[aria-label="Note"]');
  await expect(pane.getByText("This note contains hidden or control characters")).toBeVisible();
  await expect(pane).toContainText(`fine ${heart}${[0xe0072, 0xe0075, 0xe006e, 0xe0020, 0xe0063, 0xe0075, 0xe0072, 0xe006c].map(marker).join("")}`);
  expect(await pane.evaluate((el) => el.textContent ?? "")).not.toMatch(/[\u{e0000}-\u{e007f}]/u);
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

// Add's preview of a note that exists shows its name and Verdict, which may be a
// repository's text: markers and the warning, never a raw character.
test("hidden characters: Add's preview of an existing note shows markers and the warning", async ({ page, magpie }) => {
  writeFileSync(magpie.note("npm--hidden.md"), HIDDEN_NOTE);
  await magpie.open(page);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Package, PURL or GitHub URL").fill("pkg:npm/hidden");
  await page.getByRole("button", { name: "Preview" }).click();
  const preview = page.locator('section[aria-label="Preview"]');
  await expect(preview.getByText("This note contains hidden or control characters")).toBeVisible();
  await expect(preview).toContainText(SHOWN_VERDICT);
  expect(await preview.evaluate((el) => el.textContent ?? "")).not.toMatch(RAW);
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

// The printed URL works once (docs/ui.md §3); the session cookie keeps the app open in that browser.
test("the printed URL works once: reload and a second tab still work; the URL again says it was used", async ({ page, magpie }) => {
  const nav = (p: typeof page) => p.getByRole("navigation", { name: "Journals and screens" });
  await magpie.open(page);
  await page.reload();
  await expect(nav(page)).toBeVisible();
  const second = await page.context().newPage();
  await second.goto(new URL("/", magpie.server.url).href);
  await expect(nav(second)).toBeVisible();
  const again = await page.context().newPage();
  const reply = await again.goto(magpie.server.url);
  expect(reply?.status()).toBe(401);
  await expect(again.getByRole("heading", { name: "This link was already used" })).toBeVisible();
  await expect(again.getByText(`go to ${new URL("/", magpie.server.url).href}`)).toBeVisible();
  await expect(again.getByText("start repomagpie ui again")).toBeVisible();
  await again.getByRole("link").click();
  await expect(nav(again)).toBeVisible();
});

// Discover (decision 0045): GitHub's text is the owner's (decision 0032, rule 8). The fake GitHub's
// "hostile" result has HTML and a bidi control in its description, a topic and its language, and a
// javascript: html_url.
test.describe("Discover", () => {
  test.use({ fakeGithub: true });
  test("a result's description, topic and language with HTML show as text with markers; the link is GitHub's", async ({ page, magpie }) => {
    await magpie.open(page);
    await page.getByRole("button", { name: "Discover", exact: true }).click();
    await page.getByRole("searchbox", { name: "Words" }).fill("hostile");
    await page.getByRole("searchbox", { name: "Words" }).press("Enter");
    const card = page.getByRole("list", { name: "Results" }).getByRole("listitem", { name: "evil-org/hostile-repo" });
    await expect(card.getByText("<b>bold</b>", { exact: false })).toBeVisible();
    await expect(card.getByText("<U+202E>gnp.exe", { exact: false })).toBeVisible();
    await expect(card.getByText("<script>document.title='pwned'</script>")).toBeVisible();
    await expect(card.getByText("<b>TypeScript</b>")).toBeVisible();
    await expect(card.locator("img, script, b")).toHaveCount(0);
    const hrefs = await card.locator("a[href]").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs).toEqual(["https://github.com/evil-org/hostile-repo"]);
    expect(await card.textContent()).not.toContain(String.fromCharCode(0x202e));
    await expect(page).not.toHaveTitle("pwned");
  });
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
