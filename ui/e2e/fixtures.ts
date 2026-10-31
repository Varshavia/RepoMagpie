// The `magpie` fixture: a fresh journal and a running magpie ui for each test, with the page opened
// through the session URL (the token becomes a cookie, as for a person), then through / once used.
import { test as base, expect, type Page } from "@playwright/test";
import { makeJournal, removeJournal, startMagpie, type Journal, type Running } from "./journal.ts";

export interface Magpie extends Journal {
  server: Running;
  open: (page: Page) => Promise<void>;
}

// A slower machine, for hunting races: REPOMAGPIE_CPU_THROTTLE=4 runs every page's CPU 4 times
// slower (Chromium's own throttle), REPOMAGPIE_LATER_DELAY=<ms> holds the later chunk that long.
const THROTTLE = Number(process.env.REPOMAGPIE_CPU_THROTTLE ?? 0);
const LATER_DELAY = Number(process.env.REPOMAGPIE_LATER_DELAY ?? 0);

// The page's CPU `rate` times slower: a busy runner, where a frame can come before React's commit.
export async function throttle(page: Page, rate: number): Promise<void> {
  await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate });
}

export const test = base.extend<{ magpie: Magpie; generated: number; empty: boolean; screens: boolean; showcase: boolean; fakeGithub: boolean; noProject: boolean }>({
  page: async ({ page }, use) => {
    if (THROTTLE > 1) await throttle(page, THROTTLE);
    if (LATER_DELAY > 0) {
      await page.route(/\/assets\/later-[\w-]+\.js$/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, LATER_DELAY));
        await route.continue();
      });
    }
    await use(page);
  },
  generated: [0, { option: true }],
  empty: [false, { option: true }],
  screens: [false, { option: true }],
  showcase: [false, { option: true }],
  fakeGithub: [false, { option: true }],
  noProject: [false, { option: true }],
  magpie: async ({ generated, empty, screens, showcase, fakeGithub, noProject }, use) => {
    const journal = makeJournal({ generated, empty, screens, showcase });
    const server = await startMagpie(journal, { fakeGithub, noProject });
    let opened = false; // the printed URL works once; then the cookie opens the app, as for a person
    await use({
      ...journal,
      server,
      open: async (page) => {
        await page.goto(opened ? new URL("/", server.url).href : server.url);
        opened = true;
        await expect(page.getByRole("navigation", { name: "Journals and screens" })).toBeVisible();
      },
    });
    await server.stop();
    removeJournal(journal);
  },
});

export { expect };
