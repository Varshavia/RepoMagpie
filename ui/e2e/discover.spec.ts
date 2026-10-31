// The Discover page (decision 0045, docs/ui.md §7) against magpie ui with a fake GitHub
// (fake-github.ts): the search's words pick GitHub's answer, so nothing leaves the machine.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

test.use({ fakeGithub: true });

const FAILING = "Netflix/Hystrix"; // fake-github.ts answers 404 for it, as for a deleted repository

async function discover(page: Page, words: string) {
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Discover" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Words" }).fill(words);
  await page.getByRole("searchbox", { name: "Words" }).press("Enter");
}

const results = (page: Page) => page.getByRole("list", { name: "Results" });
const card = (page: Page, name: string) => results(page).getByRole("listitem", { name, exact: true });
const cards = (page: Page) => results(page).locator(":scope > li"); // not the topics' chips

test("first visit: what Discover sends; a search on Enter shows cards with stars, age, licence and a GitHub link", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByText("Discover sends your words and filters to GitHub's search API, nothing from your journals.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try “design system”" })).toBeVisible();

  await discover(page, "design system");
  await expect(cards(page)).toHaveCount(20);
  const blueprint = card(page, "palantir/blueprint");
  const link = blueprint.getByRole("link", { name: "palantir/blueprint" });
  await expect(link).toHaveAttribute("href", "https://github.com/palantir/blueprint");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noreferrer");
  await expect(blueprint.getByText(/^\d[\d.]*k? stars$/)).toBeVisible(); // compact, as shown
  await expect(blueprint.getByText(/^\d[\d,]* stars$/)).toHaveCount(1); // in full, for screen readers
  await expect(blueprint.getByText(/^Pushed /)).toHaveAttribute("title", /^Last push \d{4}-\d{2}-\d{2}$/);
  await expect(blueprint.getByText("Apache-2.0")).toBeVisible();
  await expect(card(page, FAILING).getByText("No licence")).toBeVisible(); // GitHub found none
  await expect(results(page).getByText("estimated").first()).toBeVisible();
  await expect(page.getByRole("status").getByText("20 shown of 23 on GitHub.")).toBeVisible();
});

test("filters: a change sends nothing; Search sends them all", async ({ page, magpie }) => {
  await magpie.open(page);
  await discover(page, "design system");
  await expect(cards(page)).toHaveCount(20);
  const asked: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/discover")) asked.push(r.url());
  });
  await page.getByLabel("Domain").selectOption("styling");
  await expect(page.getByText("styling: CSS, design systems and UI components.")).toBeVisible();
  await page.getByLabel("Kind").selectOption("library");
  await page.getByLabel("Language").fill("TypeScript");
  await page.getByLabel("Min stars").selectOption("1000");
  await page.getByLabel("Updated within").selectOption("6");
  await page.getByLabel("Sort").selectOption("updated");
  await page.getByLabel("Show archived").check();
  expect(asked).toEqual([]);
  await expect(page.getByRole("option", { name: "library (approximate)" })).toHaveCount(1);

  await page.getByRole("search", { name: "Search GitHub" }).getByRole("button", { name: "Search", exact: true }).click();
  await expect.poll(() => asked.length).toBe(1);
  const params = new URL(asked[0]).searchParams;
  expect(Object.fromEntries(params)).toMatchObject({ q: "design system", domain: "styling", kind: "library", language: "TypeScript", min_stars: "1000", updated_within: "6", sort: "updated", include_archived: "true" });
});

test("add one: Add to inbox becomes Added, focused, and opens the new inbox note", async ({ page, magpie }) => {
  await magpie.open(page);
  await discover(page, "design system");
  await page.getByRole("button", { name: "Add radix-ui/primitives to your inbox" }).click();
  const added = card(page, "radix-ui/primitives").getByRole("link", { name: "Added" });
  await expect(added).toBeFocused();
  await expect(page.getByRole("button", { name: "Inbox, 4 notes" })).toBeVisible();
  expect(readFileSync(magpie.note("github--radix-ui--primitives.md"), "utf8")).toContain("status: inbox");
  await added.click();
  await expect(page.getByRole("heading", { level: 2, name: "radix-ui/primitives" })).toBeVisible();
});

test("add with a Verdict: the Verdict and a Use when item are written; the note is reviewed", async ({ page, magpie }) => {
  await magpie.open(page);
  await discover(page, "design system");
  await page.getByRole("button", { name: "Add palantir/blueprint with a Verdict" }).click();
  const form = page.getByRole("group", { name: "Verdict for palantir/blueprint" });
  await expect(form.getByRole("textbox", { name: "Verdict" })).toBeFocused();
  await form.getByRole("textbox", { name: "Verdict" }).fill("good for dense internal tools");
  await form.getByRole("textbox", { name: "Use when" }).fill("an admin dashboard with many tables");
  await form.getByRole("button", { name: "Save note" }).click();
  await expect(card(page, "palantir/blueprint").getByRole("link", { name: "Added" })).toBeFocused();
  const text = readFileSync(magpie.note("github--palantir--blueprint.md"), "utf8");
  expect(text).toContain("good for dense internal tools");
  expect(text).toContain("- an admin dashboard with many tables");
  expect(text).toContain("status: reviewed");
});

test("add several: one by one with progress, then what was added, what was there and what failed, with the reason", async ({ page, magpie }) => {
  await magpie.open(page);
  await discover(page, "design system");
  await page.getByRole("button", { name: "Add radix-ui/primitives to your inbox" }).click();
  await expect(card(page, "radix-ui/primitives").getByRole("link", { name: "Added" })).toBeVisible();
  for (const name of ["palantir/blueprint", FAILING, "cheat/cheat"]) await page.getByRole("checkbox", { name: `Select ${name}` }).check();
  await expect(page.getByRole("checkbox", { name: "Select radix-ui/primitives" })).toBeDisabled(); // added already
  await page.getByRole("button", { name: "Add 3 to inbox" }).click();
  const summary = page.locator(".discover-summary");
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("Added 2, 1 failed.");
  await expect(summary).toContainText(new RegExp(`${FAILING}: GitHub has no repository ${FAILING}`, "i"));
  await expect(card(page, FAILING).getByRole("alert")).toContainText("GitHub has no repository");
  await expect(card(page, "cheat/cheat").getByRole("link", { name: "Added" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Inbox, 6 notes" })).toBeVisible();
});

test("without a token, more than 5 adds ask first; Cancel adds nothing", async ({ page, magpie }) => {
  await magpie.open(page);
  await discover(page, "design system");
  const boxes = results(page).getByRole("checkbox");
  for (let i = 0; i < 6; i++) await boxes.nth(i).check();
  await page.getByRole("button", { name: "Add 6 to inbox" }).click();
  await expect(page.getByRole("alert").getByText(/Without a GitHub token, GitHub allows 60 requests an hour/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Add 6 anyway" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inbox, 3 notes" })).toBeVisible();
});

test("a repository in this journal: a badge linking to the note, and no Add", async ({ page, magpie }) => {
  await magpie.open(page);
  await discover(page, "design system");
  const there = card(page, "VoltAgent/awesome-design-md");
  await expect(there.getByText("In your personal journal")).toBeVisible();
  await expect(there.getByRole("button", { name: /to your inbox/ })).toHaveCount(0);
  await expect(there.getByRole("checkbox")).toHaveCount(0);
  // No Verdict (back in the inbox): What it does, named, on one line of about 100 characters.
  const link = there.getByRole("link", { name: /^What it does: About 70 ready-made DESIGN\.md files/ });
  const text = (await link.textContent()) ?? "";
  expect(text.length).toBeLessThanOrEqual("What it does: ".length + 100);
  expect(text).not.toContain("\n");
  await link.click();
  await expect(page.getByRole("heading", { level: 2, name: "VoltAgent/awesome-design-md" })).toBeVisible();
});

test("a domain search that meets the limit on its second request shows the first one's results, with a warning", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.getByLabel("Domain").selectOption("styling");
  await page.getByRole("searchbox", { name: "Words" }).fill("halfway");
  await page.getByRole("searchbox", { name: "Words" }).press("Enter");
  await expect(card(page, "VoltAgent/awesome-design-md")).toBeVisible();
  await expect(page.getByText("Searched 2 of 3 styling topics to stay within GitHub's limit. Connect GitHub to search all.")).toBeVisible();
  await expect(page.getByText(/^Only 1 of 2 searches ran: GitHub's search limit is used up until \d\d:\d\d UTC\./)).toBeVisible();
  // The two warnings, not a failure banner as well.
  await expect(page.getByRole("alert")).toHaveCount(2);
});

test("not connected: the GitHub line and its steps; the partial-search warning shows once and stays dismissed for the session", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByText("GitHub: not connected, limited to 10 searches a minute.")).toBeVisible();
  const how = page.getByRole("button", { name: "How to connect" });
  await expect(how).toHaveAttribute("aria-expanded", "false");
  await how.click();
  await expect(how).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Install the GitHub CLI (cli.github.com) and run gh auth login.")).toBeVisible();

  const warning = page.getByText("Searched 2 of 3 security topics to stay within GitHub's limit. Connect GitHub to search all.");
  await page.getByLabel("Domain").selectOption("security");
  await page.getByRole("searchbox", { name: "Words" }).fill("design system");
  await page.getByRole("searchbox", { name: "Words" }).press("Enter");
  await expect(cards(page).first()).toBeVisible();
  await expect(warning).toHaveCount(1);
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(warning).toHaveCount(0);

  // Another partial search, and a reload of the page: still dismissed.
  await page.getByRole("searchbox", { name: "Words" }).fill("design");
  await page.getByRole("searchbox", { name: "Words" }).press("Enter");
  await expect(page.getByText(/^Searched 2 of 3 security topics/)).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.getByLabel("Domain").selectOption("security");
  await page.getByRole("searchbox", { name: "Words" }).fill("design system");
  await page.getByRole("searchbox", { name: "Words" }).press("Enter");
  await expect(cards(page).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
});

test("Import shows the same GitHub line", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("GitHub: not connected, limited to 10 searches a minute.")).toBeVisible();
  await expect(page.getByRole("button", { name: "How to connect" })).toBeVisible();
});

test("a secondary rate limit says so and when to try again; a reset already past is never shown", async ({ page, magpie }) => {
  await magpie.open(page);
  await discover(page, "secondary");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("GitHub's secondary rate limit stopped the request (too many requests too fast); try again in 90 seconds.");
  await expect(alert).toContainText(/That is \d\d:\d\d.* your time\./);

  await page.getByRole("searchbox", { name: "Words" }).fill("pastreset");
  await page.getByRole("searchbox", { name: "Words" }).press("Enter");
  await expect(alert).toContainText("GitHub's search limit is used up; try again in a minute.");
  await expect(alert).not.toContainText(/UTC|That is/);
});

test("a limit over within a minute is waited out: the page stays loading, then shows the results, no warning", async ({ page, magpie }) => {
  await magpie.open(page);
  await discover(page, "shortwait");
  await expect(page.getByRole("button", { name: "Searching…" })).toBeVisible();
  await expect(cards(page)).toHaveCount(20, { timeout: 10_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("rate limited: GitHub's message, the reset in local time, and how to connect GitHub", async ({ page, magpie }) => {
  await magpie.open(page);
  await discover(page, "ratelimit");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("GitHub's search limit is used up until");
  await expect(alert).toContainText(/That is \d\d:\d\d.* your time\./);
  await expect(alert).toContainText("Connect GitHub (gh auth login, or GITHUB_TOKEN) for 30 a minute of your own.");
});

test("offline: can't reach GitHub, with Try again", async ({ page, magpie }) => {
  await magpie.open(page);
  await discover(page, "offline");
  await expect(page.getByRole("alert")).toContainText("Can't reach GitHub");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("no results: says so and names the filters to loosen", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.getByLabel("Min stars").selectOption("10000");
  await discover(page, "nothing");
  await expect(page.getByText("No repositories match. Try loosening: at least 10k stars.")).toBeVisible();
});

test("More results: the next page after the shown one, then no button", async ({ page, magpie }) => {
  await magpie.open(page);
  await discover(page, "design system");
  await expect(cards(page)).toHaveCount(20);
  await page.getByRole("button", { name: "More results" }).click();
  await expect(cards(page)).toHaveCount(23);
  await expect(card(page, "example-org/more-results-3")).toBeVisible();
  await expect(page.getByRole("button", { name: "More results" })).toHaveCount(0);
});

test("the page keeps its search while another screen is open", async ({ page, magpie }) => {
  await magpie.open(page);
  await discover(page, "design system");
  await expect(cards(page)).toHaveCount(20);
  await page.getByRole("button", { name: /^Inbox/ }).click();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Words" })).toHaveValue("design system");
  await expect(cards(page)).toHaveCount(20);
});
