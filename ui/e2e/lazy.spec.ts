// The parts the first screen doesn't show (docs/ui.md §10): Add, Import, Check a package, Settings,
// Suggest, the palette, the keyboard map and the delete dialog load in one chunk after the first rows
// are on screen. Each still opens on the first click or key while that chunk is slow, a chunk that
// can't load says so with a Reload button, and once it is in, opening a page fetches nothing.
import type { Page, Route } from "@playwright/test";
import { runSearch } from "../../src/core/search.ts";
import { expect, test, throttle } from "./fixtures.ts";

const MOD = process.platform === "darwin" ? "Meta" : "Control";
const LATER = /\/assets\/later-[\w-]+\.js$/;

// What each shows while the chunk loads: a quiet line in the page's frame, or Suggest's skeleton rows.
const LINE = (page: Page) => page.getByRole("main").getByText("Loading…");
const PAGES = [
  { button: "Add", action: "Add a note", heading: "Add a note", loading: LINE },
  { button: "Import", action: "Import lines", heading: "Import", loading: LINE },
  { button: "Check a package", action: "Check a package", heading: "Check a package", loading: LINE },
  { button: "Settings", action: "Settings", heading: "Settings", loading: LINE },
  { button: "Suggest", action: "Suggest for this project", heading: "Suggest for this project", loading: (page: Page) => page.getByRole("status", { name: "Loading Suggest" }) },
];

// Holds the later chunk until release() is called: the slowest network the parts can meet.
async function holdLater(page: Page): Promise<() => void> {
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(LATER, async (route: Route) => {
    await released;
    await route.continue();
  });
  return release;
}

for (const { button, action, heading, loading } of PAGES) {
  test(`lazy: ${button} opens on a cold load from the sidebar and from its palette action, while the chunk is slow`, async ({ page, magpie }) => {
    let release = await holdLater(page);
    await magpie.open(page);
    await page.getByRole("navigation").getByRole("button", { name: button, exact: true }).click();
    await expect(loading(page)).toBeVisible();
    release();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();

    await page.unrouteAll();
    release = await holdLater(page);
    await magpie.open(page);
    await page.keyboard.press(`${MOD}+k`);
    await page.keyboard.type(action);
    await page.keyboard.press("Enter");
    release();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("lazy: the palette opens on the first key while its chunk is held; what you type is kept; Esc gives the focus back", async ({ page, magpie }) => {
  const release = await holdLater(page);
  await magpie.open(page);
  const list = page.getByRole("listbox", { name: "Inbox" });
  await list.focus();
  await page.keyboard.press(`${MOD}+k`);
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  // The letters go into the shell's input, not to single-key shortcuts (j and k would move the list).
  const shell = palette.getByRole("textbox", { name: "Search notes or run an action" });
  await expect(shell).toBeFocused();
  await page.keyboard.type("jk pupp");
  await expect(shell).toHaveValue("jk pupp");
  await page.keyboard.press("Backspace");
  await expect(shell).toHaveValue("jk pup");
  release();
  const input = palette.getByRole("combobox", { name: "Search notes or run an action" });
  await expect(input).toHaveValue("jk pup");
  await expect(input).toBeFocused();
  await input.fill("");
  await page.keyboard.type("puppeteer");
  await expect(palette.getByRole("option", { name: /^puppeteer/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(list).toBeFocused();

  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard" })).toBeVisible();
});

// The chunk arrives while you type, on a busy machine: the palette renders with what was typed so
// far, and takes the keys pressed meanwhile in the same step it replaces the shell. No key is lost
// or reaches a single-key shortcut, and the search is for exactly what was typed.
test("lazy: keys typed while the palette's chunk arrives all land in it, on a slow CPU; it shows the results for exactly that", async ({ page, magpie }) => {
  const { document } = runSearch({ query: "design", limit: 6 }, { home: magpie.home, env: { MAGPIE_HOME: magpie.journal }, cwd: magpie.project });
  const expected = document.results.map((r) => (r.type === "skill" ? `${r.skill} · ${r.name}` : r.name));
  const release = await holdLater(page);
  await magpie.open(page);
  await throttle(page, 4);
  await page.keyboard.press(`${MOD}+k`);
  await page.keyboard.type("d");
  release();
  await page.keyboard.type("esign", { delay: 15 });
  const palette = page.getByRole("dialog", { name: "Command palette" });
  const input = palette.getByRole("combobox", { name: "Search notes or run an action" });
  await expect(input).toHaveValue("design");
  await expect(input).toBeFocused();
  await expect(palette.getByRole("group", { name: "Notes and skills" }).getByRole("option").locator(".label")).toHaveText(expected);
});

test("lazy: Enter pressed while the palette's chunk arrives runs the first action for everything typed, on a slow CPU", async ({ page, magpie }) => {
  const release = await holdLater(page);
  await magpie.open(page);
  await throttle(page, 4);
  await page.keyboard.press(`${MOD}+k`);
  await page.keyboard.type("i");
  release();
  await page.keyboard.type("mport lines", { delay: 15 });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Import" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("lazy: a chunk that can't load shows Reload in the page's frame, and as a dialog for the palette; Reload brings it back", async ({ page, magpie }) => {
  await page.route(LATER, (route) => route.abort());
  await magpie.open(page);
  await page.getByRole("navigation").getByRole("button", { name: "Add", exact: true }).click();
  const main = page.getByRole("main");
  await expect(main.getByText("Couldn't load this part of RepoMagpie.")).toBeVisible();
  await expect(main.getByRole("button", { name: "Reload" })).toBeVisible();
  await expect(page.getByRole("navigation")).toBeVisible(); // the rest of the app stays

  await page.keyboard.press(`${MOD}+k`);
  const failed = page.getByRole("alertdialog", { name: "Couldn't load" });
  await expect(failed.getByRole("button", { name: "Reload" })).toBeVisible();
  await failed.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await page.unrouteAll();
  await main.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByRole("navigation", { name: "Journals and screens" })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a note" })).toBeVisible();
});

test("lazy: after the first rows the chunk loads on its own (not the graph's, not Discover's); then Add opens with no request and no loading state", async ({ page, magpie }) => {
  const assets: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/")) assets.push(new URL(request.url()).pathname);
  });
  const later = page.waitForResponse(LATER);
  await magpie.open(page);
  await expect(page.getByRole("listbox", { name: "Inbox" }).getByRole("option").first()).toBeVisible();
  await later;
  await expect.poll(() => assets.some((path) => /\/later-[\w-]+\.css$/.test(path))).toBe(true);
  expect(assets.filter((path) => /GraphPage|DiscoverPage|layout\.worker/.test(path))).toEqual([]);

  await page.evaluate(() => {
    const seen: string[] = ((window as unknown as { seen: string[] }).seen = []);
    new MutationObserver(() => {
      for (const status of document.querySelectorAll('[role="status"]')) if (status.textContent?.startsWith("Loading")) seen.push(status.textContent);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  const before = assets.length;
  await page.getByRole("navigation").getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a note" })).toBeVisible();
  expect(assets.slice(before)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual([]);
});
