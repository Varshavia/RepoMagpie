// The graph page's budget (brief §6, docs/ui.md §10): data fetched, layout settled and first frame
// drawn at 2,000 notes, under 2 s with a warm cache. Its own Playwright project ("timing"), which
// runs after every other end-to-end test, so no other test shares the machine while it measures.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderNote } from "../../src/core/write.ts";
import { expect, test } from "./fixtures.ts";

// A journal shaped like a real one, the same every time: 30 tags used unevenly (0 to 3 per note),
// links in about 3 notes out of 10, an alternative in 1 out of 10, kinds of every group, an inbox share.
function writeBigJournal(notes: string, count: number): void {
  const kinds = ["library", "library", "library", "cli", "framework", "skill-pack", "plugin", "awesome-list", "template", "app", "other"];
  const tags = ["testing", "pdf", "frontend", "react", "cli", "agent-skills", "design", "data-engineering", "browser-automation", "workflow", "auth", "database", "observability", "devops", "security", "parsing", "validation", "http", "queue", "cache", "docs", "markdown", "search", "ai", "mcp", "editor", "git", "build", "bundler", "orm"];
  let seed = 7;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
  const name = (i: number) => `package-${String(i).padStart(4, "0")}`;
  for (let i = 0; i < count; i++) {
    const picked = rand() < 0.2 ? [] : [...new Set(Array.from({ length: 1 + Math.floor(rand() * 3) }, () => tags[Math.floor(tags.length * rand() ** 1.6)]))];
    const related = rand() < 0.3 ? Array.from({ length: 1 + Math.floor(rand() * 2) }, () => `- [[npm--${name(Math.floor(rand() * count))}]]`).join("\n") : undefined;
    const alternative = rand() < 0.1 ? `alternatives: ["[[npm--${name(Math.floor(rand() * count))}]]"]\n` : "";
    const text = renderNote({ id: `pkg:npm/${name(i)}`, name: name(i), explored: "2026-10-08", kind: kinds[Math.floor(rand() * kinds.length)], tags: picked, verdict: rand() < 0.25 ? undefined : `fine for ${name(i)}`, related });
    writeFileSync(join(notes, `npm--${name(i)}.md`), alternative ? text.replace("status: ", `${alternative}status: `) : text);
  }
}

test.use({ empty: true });

// From the click on Graph to the first frame after the layout settled, with the page's performance
// marks: cold (the graph cache is built) and warm. Hover and zoom: the gaps between frames while the
// pointer moves across the graph and the wheel zooms in and out (reported; in SwiftShader they
// measure the software renderer, not the page).
test("graph: data, layout and first frame at 2,000 notes", async ({ page, magpie }, info) => {
  test.setTimeout(120_000);
  writeBigJournal(magpie.note(""), 2000);
  await magpie.open(page);
  const canvas = page.locator(".graph-canvas");
  // Opened from a loaded Inbox, its first note shown: the server answers one request at a time,
  // and the Inbox's own requests would otherwise be counted in the graph's time.
  const open = async () => {
    await expect(page.getByRole("listbox", { name: "Inbox" }).getByRole("option").first()).toBeVisible();
    await expect(page.locator("#note-title")).toBeVisible();
    await page.evaluate(() => performance.mark("graph:open"));
    await page.getByRole("button", { name: "Graph", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-settled", "true", { timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => performance.getEntriesByName("graph:drawn").length)).toBeGreaterThan(0);
    const times = await page.evaluate(() => {
      const last = (name: string) => performance.getEntriesByName(name).at(-1)?.startTime ?? NaN;
      const start = last("graph:open");
      return { fetch: last("graph:fetch") - start, data: last("graph:data") - start, settled: last("graph:settled") - start, drawn: last("graph:drawn") - start };
    });
    await page.evaluate(() => performance.clearMarks());
    return times;
  };
  const cold = await open();
  await page.getByRole("button", { name: /Inbox/ }).click();
  const warm = await open();
  await expect(page.getByRole("status").filter({ hasText: /^Showing/ })).toContainText("Showing 2000 notes");

  const box = (await canvas.boundingBox()) as { x: number; y: number; width: number; height: number };
  // The gaps between animation frames while `act` runs: median, longest, and how many over 50 ms.
  const frames = async (act: () => Promise<void>) => {
    await page.evaluate(() => {
      const w = window as unknown as { gaps: number[]; measuring: boolean };
      w.gaps = [];
      w.measuring = true;
      let last = performance.now();
      const frame = (now: number) => {
        w.gaps.push(now - last);
        last = now;
        if (w.measuring) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await act();
    const gaps = await page.evaluate(() => {
      const w = window as unknown as { gaps: number[]; measuring: boolean };
      w.measuring = false;
      return w.gaps.slice(1).sort((a, b) => a - b);
    });
    return `median ${Math.round(gaps[gaps.length >> 1])} ms, longest ${Math.round(gaps[gaps.length - 1])} ms, ${gaps.filter((g) => g > 50).length} of ${gaps.length} frames over 50 ms`;
  };
  const hover = await frames(async () => {
    for (let i = 0; i <= 60; i++) await page.mouse.move(box.x + (box.width * i) / 60, box.y + box.height / 2);
  });
  const zoom = await frames(async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i < 10 ? -100 : 100);
    await page.waitForTimeout(400);
  });
  const round = (t: { fetch: number; data: number; settled: number; drawn: number }) => `fetch starts ${Math.round(t.fetch)} ms, data ${Math.round(t.data)} ms, settled ${Math.round(t.settled)} ms, first frame ${Math.round(t.drawn)} ms`;
  const report = `cold: ${round(cold)}; warm: ${round(warm)}; hover: ${hover}; zoom: ${zoom}`;
  info.annotations.push({ type: "graph, 2,000 notes", description: report });
  console.log(`graph page with 2,000 notes: ${report}`);
  // The 2 s budget is for a mid-range laptop with a warm cache. Shared CI runners draw WebGL in
  // software (SwiftShader) on few cores, so CI reports the numbers only, as for the benchmarks.
  if (!process.env.CI) expect(warm.drawn).toBeLessThan(2000);
});
