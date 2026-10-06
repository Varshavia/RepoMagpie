// The `magpie` fixture: a fresh journal and a running magpie ui for each test, with the page opened
// through the session URL (the token becomes a cookie, as for a person).
import { test as base, expect, type Page } from "@playwright/test";
import { makeJournal, removeJournal, startMagpie, type Journal, type Running } from "./journal.ts";

export interface Magpie extends Journal {
  server: Running;
  open: (page: Page) => Promise<void>;
}

export const test = base.extend<{ magpie: Magpie; generated: number; empty: boolean; screens: boolean }>({
  generated: [0, { option: true }],
  empty: [false, { option: true }],
  screens: [false, { option: true }],
  magpie: async ({ generated, empty, screens }, use) => {
    const journal = makeJournal({ generated, empty, screens });
    const server = await startMagpie(journal);
    await use({
      ...journal,
      server,
      open: async (page) => {
        await page.goto(server.url);
        await expect(page.getByRole("navigation", { name: "Journals and screens" })).toBeVisible();
      },
    });
    await server.stop();
    removeJournal(journal);
  },
});

export { expect };
