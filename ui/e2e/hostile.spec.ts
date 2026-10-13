// Hostile notes in the local app (decision 0032, rule 7, docs/ui.md §3): links only for http and
// https, note text never rendered as HTML, and files the journal skipped shown to the user. The
// payloads are inert: they would only set document.title, and they must never run.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
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
