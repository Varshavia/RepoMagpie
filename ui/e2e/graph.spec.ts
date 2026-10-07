// End-to-end flows of the graph page (decision 0028, docs/ui.md §7): how you get there, the status
// line, drawing with WebGL and the layout worker under the app's CSP, and the empty and no-WebGL
// states.
import type { Page } from "@playwright/test";
import type { GraphJson } from "../../src/core/documents.ts";
import { expect, test } from "./fixtures.ts";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

// The status line for the default sources (tags, links, alternatives), from the API's own answer.
async function expectedStatus(page: Page): Promise<string> {
  const doc = await page.evaluate(async () => (await fetch("/api/graph?journal=personal")).json() as Promise<GraphJson>);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const connections = doc.counts.edges_by_type.tagged + doc.counts.edges_by_type.link + doc.counts.edges_by_type.alternative;
  return `Showing ${plural(doc.counts.notes, "note")}, ${plural(doc.counts.tags, "tag")} and ${plural(connections, "connection")}`;
}

test("graph: the sidebar, g g and the palette open it; the status line counts in words; it draws, and the layout settles under the CSP", async ({ page, magpie }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/.test(message.text())) violations.push(message.text());
  });
  await magpie.open(page);
  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Graph" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Showing/ })).toHaveText(await expectedStatus(page));
  const canvas = page.locator(".graph-canvas");
  await expect(canvas).toHaveAttribute("aria-hidden", "true");
  await expect(canvas.locator("canvas").first()).toBeVisible();
  await expect(canvas).toHaveAttribute("data-settled", "true", { timeout: 10_000 });
  await expect(page.getByRole("group", { name: "Legend" })).toContainText("Skill pack");
  await expect(page.getByRole("button", { name: "Re-run layout" })).toBeEnabled();

  await page.getByRole("button", { name: /Inbox/ }).click();
  await page.keyboard.press("g");
  await page.keyboard.press("g");
  await expect(page.getByRole("heading", { level: 1, name: "Graph" })).toBeVisible();

  await page.getByRole("button", { name: /Inbox/ }).click();
  await page.keyboard.press(`${MOD}+k`);
  await page.getByRole("combobox", { name: "Search notes or run an action" }).fill("open graph");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Graph" })).toBeVisible();
  expect(violations).toEqual([]);
});

test("graph: other screens don't load its chunk", async ({ page, magpie }) => {
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(new URL(request.url()).pathname);
  });
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("button", { name: "Search" }).click();
  expect(scripts.filter((path) => /GraphPage|layout\.worker/.test(path))).toEqual([]);
  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.locator(".graph-canvas")).toHaveAttribute("data-settled", "true", { timeout: 10_000 });
  expect(scripts.some((path) => /GraphPage/.test(path))).toBe(true);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("graph: only the settled layout is shown; the canvas waits, invisible, until then", async ({ page, magpie }) => {
    await page.addInitScript(() => {
      // Record every state the canvas was in, from the first frame on.
      (window as unknown as { seen: string[] }).seen = [];
      new MutationObserver(() => {
        const canvas = document.querySelector(".graph-canvas");
        if (canvas) (window as unknown as { seen: string[] }).seen.push(`${canvas.getAttribute("data-waiting")} ${canvas.getAttribute("data-settled")}`);
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-settled", "data-waiting"] });
    });
    await magpie.open(page);
    await page.getByRole("button", { name: "Graph" }).click();
    const canvas = page.locator(".graph-canvas");
    await expect(canvas).toHaveAttribute("data-settled", "true", { timeout: 10_000 });
    await expect(canvas).toHaveAttribute("data-waiting", "false");
    await expect(canvas).toBeVisible();
    const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
    expect(seen[0]).toBe("true false"); // invisible while the layout runs
    expect(seen.every((s) => s === "true false" || s === "false true")).toBe(true); // never visible before it settles
  });
});

test.describe("an empty journal", () => {
  test.use({ empty: true });

  test("graph: nothing to draw yet, with Add", async ({ page, magpie }) => {
    await magpie.open(page);
    await page.getByRole("button", { name: "Graph" }).click();
    await expect(page.getByText("Nothing to draw yet. Add a repository here, or from the palette")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /^Showing/ })).toHaveText("Showing 0 notes, 0 tags and 0 connections");
    await page.getByRole("button", { name: "Add a note" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Add a note" })).toBeVisible();
  });
});

test("graph: without WebGL it says so, and the status line still counts", async ({ page, magpie }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return /webgl/.test(type) ? null : original.call(this, type as "2d", ...(rest as []));
    } as typeof original;
  });
  await magpie.open(page);
  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByText("This browser can't draw the graph: WebGL is off or not available.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Showing/ })).toHaveText(await expectedStatus(page));
  await expect(page.locator(".graph-canvas")).toHaveCount(0);
});
