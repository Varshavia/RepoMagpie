// End-to-end flows of the graph page (decision 0028, docs/ui.md §7): how you get there, the status
// line, drawing with WebGL and the layout worker under the app's CSP, the empty and no-WebGL
// states; hover, click, the note pane, the search box, local mode, Esc and "Show in graph"; the
// filters, the toggles, missing notes and the neighbours list; the notices over the canvas,
// resizing across 960 px, and live updates. The 2,000-note timing is in graph-timing.spec.ts.
import { readFileSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { GraphJson } from "../../src/core/documents.ts";
import { renderNote } from "../../src/core/write.ts";
import { DEFAULT_SOURCES, drawable, neighbourGroups, NO_FILTERS, nodeLabel, statusLine, type Filters } from "../src/logic/graph.ts";
import { expect, test } from "./fixtures.ts";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

// The status line for the default sources (tags, links, alternatives), from the API's own answer.
async function expectedStatus(page: Page): Promise<string> {
  const doc = await page.evaluate(async () => (await fetch("/api/graph?journal=personal")).json() as Promise<GraphJson>);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const connections = doc.counts.edges_by_type.tagged + doc.counts.edges_by_type.link + doc.counts.edges_by_type.alternative;
  return `Showing ${plural(doc.counts.notes, "note")}, ${plural(doc.counts.tags, "tag")} and ${plural(connections, "connection")}`;
}

const status = (page: Page) => page.getByRole("status").filter({ hasText: /^Showing/ });
const canvas = (page: Page) => page.locator(".graph-canvas");

async function openGraph(page: Page, magpie: { open: (page: Page) => Promise<void> }) {
  await magpie.open(page);
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(canvas(page)).toHaveAttribute("data-settled", "true", { timeout: 10_000 });
}

// How many pixels of the canvas, as the page shows it, differ from its background (its top-left
// corner, which the stage padding keeps clear of nodes). The screenshot is decoded in a blank page,
// outside the app's CSP. A blank canvas gives 0.
async function drawnPixels(page: Page): Promise<number> {
  const png = await canvas(page).screenshot();
  const blank = await page.context().newPage();
  try {
    return await blank.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const context = new OffscreenCanvas(image.width, image.height).getContext("2d") as OffscreenCanvasRenderingContext2D;
      context.drawImage(image, 0, 0);
      const px = context.getImageData(0, 0, image.width, image.height).data;
      let drawn = 0;
      for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - px[0]) + Math.abs(px[i + 1] - px[1]) + Math.abs(px[i + 2] - px[2]) > 30) drawn++;
      return drawn;
    }, png.toString("base64"));
  } finally {
    await blank.close();
  }
}

// Where a node is on the page, from the graph's own positions (the canvas has no DOM per node).
async function nodeAt(page: Page, key: string): Promise<{ x: number; y: number; width: number; height: number; left: number; top: number }> {
  const box = await canvas(page).boundingBox();
  const at = await canvas(page).evaluate((el, k) => (el as unknown as { nodePosition: (k: string) => { x: number; y: number } }).nodePosition(k), key);
  return { x: (box?.x ?? 0) + at.x, y: (box?.y ?? 0) + at.y, width: box?.width ?? 0, height: box?.height ?? 0, left: box?.x ?? 0, top: box?.y ?? 0 };
}

// The same, once the node has stopped moving (after the note pane resized the graph).
async function nodeAtRest(page: Page, key: string) {
  let last = "";
  let at = await nodeAt(page, key);
  await expect
    .poll(async () => {
      at = await nodeAt(page, key);
      const now = `${Math.round(at.x)} ${Math.round(at.y)}`;
      const same = now === last;
      last = now;
      return same;
    }, { intervals: [100] })
    .toBe(true);
  return at;
}

test("graph: hover lights a node; a click on a note opens it beside the graph, on a tag selects it; Esc clears the selection", async ({ page, magpie }) => {
  await openGraph(page, magpie);
  const tag = await nodeAt(page, "tag:agent-skills");
  await page.mouse.move(tag.x, tag.y);
  await expect(canvas(page)).toHaveAttribute("data-hovered", "tag:agent-skills");

  const note = await nodeAt(page, "note:github--vercel-labs--agent-skills.md");
  await page.mouse.click(note.x, note.y);
  await expect(canvas(page)).toHaveAttribute("data-selected", "note:github--vercel-labs--agent-skills.md");
  const pane = page.getByRole("complementary", { name: "Note" });
  await expect(pane.getByRole("heading", { level: 2, name: "vercel-labs/agent-skills" })).toBeVisible();
  await expect(page.getByText("Selected: vercel-labs/agent-skills")).toBeVisible();

  const again = await nodeAtRest(page, "tag:agent-skills"); // the pane narrowed the graph: positions moved
  await page.waitForTimeout(350); // sigma reads two clicks within 300 ms as a double click (a zoom), as a person wouldn't click
  await page.mouse.click(again.x, again.y);
  await expect(canvas(page)).toHaveAttribute("data-selected", "tag:agent-skills");
  await expect(pane).toHaveCount(0);
  await expect(page.getByText("Selected: #agent-skills")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(canvas(page)).toHaveAttribute("data-selected", "");
  await expect(page.getByText(/^Selected:/)).toHaveCount(0);
});

test("graph: a note clicked in the graph opens beside it, and an edit there shows in the graph", async ({ page, magpie }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${e.message} ${e.stack?.split("\n").slice(0, 5).join(" | ")}`));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 400)));
  await openGraph(page, magpie);
  const before = await expectedStatus(page);
  const key = "note:github--vercel-labs--agent-skills.md";
  const note = await nodeAt(page, key);
  await page.mouse.click(note.x, note.y);
  const pane = page.getByRole("complementary", { name: "Note" });
  await expect(pane.getByRole("heading", { level: 2, name: "vercel-labs/agent-skills" })).toBeVisible();

  await pane.getByRole("button", { name: "Edit Related" }).click();
  await pane.getByRole("textbox", { name: "Related" }).fill("- [[github--leonxlnx--taste-skill]]");
  await page.keyboard.press(`${MOD}+Enter`);
  await expect(page.getByRole("status").getByText("Related saved")).toBeVisible();
  // The file changed on disk: the graph is fetched again and draws the new link.
  const connections = (text: string) => Number(/and (\d+) connections?$/.exec(text)?.[1]);
  await expect.poll(async () => connections((await status(page).textContent()) ?? "")).toBe(connections(before) + 1);
  await expect(page.getByRole("listbox", { name: "Neighbours of vercel-labs/agent-skills" }).getByRole("group", { name: "Links" })).toContainText("Leonxlnx/taste-skill");
  await expect(canvas(page)).toHaveAttribute("data-selected", key);
  expect(errors).toEqual([]); // the refetch synced into a graph with a selection, which dims the rest
});

test("graph: adding an alternative in the note pane draws an alternative edge", async ({ page, magpie }) => {
  await openGraph(page, magpie);
  await expect(page.getByRole("group", { name: "Legend" })).not.toContainText("Alternative");
  await page.getByRole("combobox", { name: "Find a note or tag in the graph" }).fill("taste");
  await page.keyboard.press("Enter");
  const pane = page.getByRole("complementary", { name: "Note" });
  const row = pane.getByRole("region", { name: "Alternatives" });
  await row.getByRole("button", { name: "Add an alternative" }).click();
  await page.getByRole("combobox", { name: /^Add an alternative/ }).pressSequentially("vercel");
  await expect(page.getByRole("listbox", { name: "Alternatives to add" }).getByRole("option").first()).toContainText("vercel-labs/agent-skills");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").getByText("vercel-labs/agent-skills added as an alternative")).toBeVisible();
  const neighbours = page.getByRole("listbox", { name: "Neighbours of Leonxlnx/taste-skill" });
  await expect(neighbours.getByRole("group", { name: "Alternatives" })).toContainText("vercel-labs/agent-skills");
  await expect(page.getByRole("group", { name: "Legend" })).toContainText("Alternative");
});

test("graph: the search box finds a note, selects it and centres it; Esc clears the selection, then the search", async ({ page, magpie }) => {
  await openGraph(page, magpie);
  const search = page.getByRole("combobox", { name: "Find a note or tag in the graph" });
  await search.fill("taste");
  await expect(page.getByRole("listbox", { name: "Matching notes and tags" }).getByRole("option")).toHaveText([/Leonxlnx\/taste-skill/]);
  await page.keyboard.press("Enter");
  const key = "note:github--leonxlnx--taste-skill.md";
  await expect(canvas(page)).toHaveAttribute("data-selected", key);
  await expect(search).toHaveValue("Leonxlnx/taste-skill");
  await expect
    .poll(async () => {
      const at = await nodeAt(page, key);
      return Math.abs(at.x - (at.left + at.width / 2)) < at.width * 0.05 && Math.abs(at.y - (at.top + at.height / 2)) < at.height * 0.05;
    })
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(canvas(page)).toHaveAttribute("data-selected", "");
  await expect(search).toHaveValue("Leonxlnx/taste-skill");
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
});

test("graph: local mode shows the selected node and its neighbours, counted in the status line; Everything shows all again", async ({ page, magpie }) => {
  await openGraph(page, magpie);
  const everything = await status(page).textContent();
  const doc = await page.evaluate(async () => (await fetch("/api/graph?journal=personal")).json() as Promise<GraphJson>);
  const tagged = doc.edges.filter((e) => e.type === "tagged" && e.target === "tag:agent-skills").length;
  await page.getByRole("combobox", { name: "Find a note or tag in the graph" }).fill("#agent");
  await page.keyboard.press("Enter");
  await page.getByRole("radio", { name: "1 step" }).click();
  await expect(status(page)).toHaveText(`Showing ${tagged} notes, 1 tag and ${tagged} connections`);
  await page.getByRole("radio", { name: "Everything" }).click();
  await expect(status(page)).toHaveText(everything ?? "");
});

test("graph: a [[link]] in the note pane selects that note in the graph", async ({ page, magpie }) => {
  const file = magpie.note("github--leonxlnx--taste-skill.md");
  writeFileSync(file, `${readFileSync(file, "utf8").replace(/\n*$/, "\n")}\nSee also [[github--vercel-labs--agent-skills]].\n`);
  await openGraph(page, magpie);
  await page.getByRole("combobox", { name: "Find a note or tag in the graph" }).fill("taste");
  await page.keyboard.press("Enter");
  const pane = page.getByRole("complementary", { name: "Note" });
  await pane.getByRole("link", { name: "vercel-labs/agent-skills" }).click();
  await expect(canvas(page)).toHaveAttribute("data-selected", "note:github--vercel-labs--agent-skills.md");
  await expect(pane.getByRole("heading", { level: 2, name: "vercel-labs/agent-skills" })).toBeVisible();
});

test("Show in graph: from the note view, the graph opens on that note, in local mode", async ({ page, magpie }) => {
  await magpie.open(page);
  await page.getByRole("button", { name: /All notes/ }).click();
  await page.getByRole("listbox", { name: "All notes" }).getByText("vercel-labs/agent-skills").click();
  await page.getByRole("button", { name: "Show in graph" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Graph" })).toBeVisible();
  await expect(canvas(page)).toHaveAttribute("data-selected", "note:github--vercel-labs--agent-skills.md", { timeout: 10_000 });
  await expect(page.getByRole("radio", { name: "1 step" })).toHaveAttribute("aria-checked", "true");
  const doc = await page.evaluate(async () => (await fetch("/api/graph?journal=personal")).json() as Promise<GraphJson>);
  const tags = doc.edges.filter((e) => e.type === "tagged" && e.source === "note:github--vercel-labs--agent-skills.md").length;
  await expect(status(page)).toHaveText(`Showing 1 note, ${tags} tags and ${tags} connections`);
  await expect(page.getByRole("complementary", { name: "Note" }).getByRole("button", { name: "Show in graph" })).toHaveCount(0);
});

test("graph: the filters choose the notes, and the status line counts what is drawn", async ({ page, magpie }) => {
  await openGraph(page, magpie);
  const everything = await status(page).textContent();
  const doc = await page.evaluate(async () => (await fetch("/api/graph?journal=personal")).json() as Promise<GraphJson>);
  const expected = (filters: Partial<Filters>) => statusLine(drawable(doc, DEFAULT_SOURCES, { ...NO_FILTERS, ...filters }).counts);
  const filters = page.getByRole("group", { name: "Filters" });

  await filters.getByRole("combobox", { name: "Kind group" }).selectOption("Skill pack");
  await expect(status(page)).toHaveText(expected({ kindGroup: "skill-pack" }));
  await expect(status(page)).toContainText("Showing 4 notes");
  await filters.getByRole("button", { name: "Clear the filters" }).click();
  await expect(status(page)).toHaveText(everything ?? "");

  // Several tags: notes with any of them.
  const tag = filters.getByRole("combobox", { name: /Add a tag filter/ });
  await tag.selectOption({ label: "agent-skills (5)" });
  await expect(status(page)).toContainText("Showing 5 notes");
  await tag.selectOption({ label: "testing (1)" });
  await expect(status(page)).toHaveText(expected({ tags: ["agent-skills", "testing"] }));
  await expect(status(page)).toContainText("Showing 6 notes");
  await filters.getByRole("button", { name: "Remove the #agent-skills filter" }).click();
  await expect(status(page)).toHaveText(expected({ tags: ["testing"] }));

  await filters.getByRole("radio", { name: "Inbox" }).click();
  await expect(status(page)).toHaveText(expected({ tags: ["testing"], status: "inbox" }));
  await filters.getByRole("checkbox", { name: "Tried only" }).check();
  await expect(status(page)).toHaveText("Showing 0 notes, 0 tags and 0 connections");
  await page.getByText("No notes match these filters.").getByRole("button", { name: "Clear the filters" }).click();
  await expect(status(page)).toHaveText(everything ?? "");
  await expect(filters.getByRole("checkbox", { name: "Tried only" })).not.toBeChecked();
});

test("graph: the toggles draw connections and missing notes without moving what is drawn; a missing note offers Add", async ({ page, magpie }) => {
  const file = magpie.note("github--leonxlnx--taste-skill.md");
  // A link, so that without tags something is still connected (no notice above the canvas to resize it).
  writeFileSync(file, `${readFileSync(file, "utf8").replace(/\n*$/, "\n")}\nTried next to [[puppeteer]]; see also [[github--vercel-labs--agent-skills]].\n`);
  await openGraph(page, magpie);
  const doc = await page.evaluate(async () => (await fetch("/api/graph?journal=personal&ghosts=1")).json() as Promise<GraphJson>);
  const draw = page.getByRole("group", { name: "Draw" });
  const key = "note:github--vercel-labs--agent-skills.md";
  const before = await nodeAt(page, key);

  await draw.getByRole("checkbox", { name: "Tags" }).uncheck();
  await expect(status(page)).toHaveText(statusLine(drawable(doc, { ...DEFAULT_SOURCES, tagged: false }).counts));
  await expect(status(page)).toContainText("0 tags");
  const after = await nodeAt(page, key);
  expect([Math.round(after.x), Math.round(after.y)]).toEqual([Math.round(before.x), Math.round(before.y)]);
  await draw.getByRole("checkbox", { name: "Tags" }).check();

  const search = page.getByRole("combobox", { name: "Find a note or tag in the graph" });
  await search.fill("puppeteer");
  await expect(page.getByRole("listbox", { name: "Matching notes and tags" })).toHaveCount(0); // missing notes are off
  await draw.getByRole("checkbox", { name: "Missing notes" }).check();
  await expect(page.getByRole("group", { name: "Legend" })).toContainText("no note yet");
  await search.fill("puppetee");
  await search.fill("puppeteer");
  await expect(page.getByRole("listbox", { name: "Matching notes and tags" }).getByRole("option")).toHaveText([/puppeteer\s*No note yet/]);
  await page.keyboard.press("Enter");
  await expect(canvas(page)).toHaveAttribute("data-selected", "ghost:puppeteer");
  await page.getByRole("button", { name: "Add a note" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a note" })).toBeVisible();
  await expect(page.getByLabel("Package, PURL or GitHub URL")).toHaveValue("puppeteer");
});

test("graph: an ambiguous missing note offers Search with its name; a file stem's Add gets the PURL it stands for", async ({ page, magpie }) => {
  const file = magpie.note("github--leonxlnx--taste-skill.md");
  writeFileSync(file, `${readFileSync(file, "utf8").replace(/\n*$/, "\n")}\nNot [[zod]], nor [[npm--puppeteer]].\n`);
  for (const type of ["npm", "pypi"]) {
    writeFileSync(magpie.note(`${type}--zod.md`), renderNote({ id: `pkg:${type}/zod`, name: "zod", explored: "2026-10-04", kind: "library", tags: [], verdict: `the ${type} one` }));
  }
  await openGraph(page, magpie);
  await page.getByRole("group", { name: "Draw" }).getByRole("checkbox", { name: "Missing notes" }).check();
  const find = page.getByRole("combobox", { name: "Find a note or tag in the graph" });
  const matches = page.getByRole("listbox", { name: "Matching notes and tags" }).getByRole("option");

  await find.fill("zod");
  await matches.filter({ hasText: "No note yet" }).click();
  await expect(page.getByRole("button", { name: "Add a note" })).toHaveCount(0);
  await page.getByRole("button", { name: "Search notes" }).click();
  await expect(page.getByRole("searchbox", { name: "Search both journals" })).toHaveValue("zod");

  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await page.getByRole("group", { name: "Draw" }).getByRole("checkbox", { name: "Missing notes" }).check();
  await find.fill("npm--puppeteer");
  await matches.filter({ hasText: "No note yet" }).click();
  await page.getByRole("button", { name: "Add a note" }).click();
  await expect(page.getByLabel("Package, PURL or GitHub URL")).toHaveValue("pkg:npm/puppeteer");
});

test("graph: the neighbours list names the selected node's neighbours by type; the arrows and Enter walk the graph", async ({ page, magpie }) => {
  await openGraph(page, magpie);
  await expect(page.getByRole("listbox", { name: "The nodes with the most connections" }).getByRole("option").first()).toBeVisible();
  const doc = await page.evaluate(async () => (await fetch("/api/graph?journal=personal")).json() as Promise<GraphJson>);
  const shown = drawable(doc, DEFAULT_SOURCES);

  await page.getByRole("combobox", { name: "Find a note or tag in the graph" }).fill("#agent");
  await page.keyboard.press("Enter");
  const list = page.getByRole("listbox", { name: "Neighbours of #agent-skills" });
  const [group] = neighbourGroups(shown, "tag:agent-skills");
  expect(group.label).toBe("Same tag");
  await expect(list.getByRole("group", { name: "Same tag" }).getByRole("option")).toHaveText(group.nodes.map((n) => new RegExp(`^${nodeLabel(n)}`)));

  await list.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const second = group.nodes[1];
  await expect(canvas(page)).toHaveAttribute("data-selected", second.key);
  await expect(page.getByRole("complementary", { name: "Note" }).getByRole("heading", { level: 2, name: nodeLabel(second) })).toBeVisible();
  const next = page.getByRole("listbox", { name: `Neighbours of ${nodeLabel(second)}` });
  await expect(next).toBeFocused();
  await expect(next.getByRole("group", { name: "Same tag" })).toContainText("#agent-skills");
});

test("graph: resized across 960 px with a node selected, the canvas follows its container and still draws", async ({ page, magpie }) => {
  // Below 960 px the neighbours list moves under the graph, so the canvas's container changes size.
  await page.setViewportSize({ width: 1280, height: 800 });
  await openGraph(page, magpie);
  await page.getByRole("combobox", { name: "Find a note or tag in the graph" }).fill("#agent");
  await page.keyboard.press("Enter");
  await expect(canvas(page)).toHaveAttribute("data-selected", "tag:agent-skills");
  await expect.poll(() => drawnPixels(page)).toBeGreaterThan(1000);
  for (const width of [900, 1280, 900, 1280]) {
    const before = await canvas(page).boundingBox();
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(async () => (await canvas(page).boundingBox())?.height !== before?.height).toBe(true);
    // Sigma's canvases have the container's size, and something is drawn on them.
    await expect
      .poll(() => canvas(page).evaluate((el) => [...el.querySelectorAll("canvas")].every((c) => c.clientWidth === el.clientWidth && c.clientHeight === el.clientHeight)))
      .toBe(true);
    await expect.poll(() => drawnPixels(page), { message: `drawn at ${width} px` }).toBeGreaterThan(1000);
  }
});

test("graph: a node picked right after a toggle is still centred (not from positions sigma hasn't normalised yet)", async ({ page, magpie }) => {
  await openGraph(page, magpie);
  const search = page.getByRole("combobox", { name: "Find a note or tag in the graph" });
  await search.fill("taste");
  await expect(page.getByRole("listbox", { name: "Matching notes and tags" }).getByRole("option")).toHaveCount(1);
  // In one task: the toggle (React runs its effects, which recolour the graph; sigma normalises the
  // new positions on its next frame), then Enter in the search box, before that frame.
  await page.evaluate(() => {
    [...document.querySelectorAll("label")].find((label) => label.textContent?.trim() === "Similar")?.querySelector("input")?.click();
    document.querySelector('input[name="graph-search"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  const key = "note:github--leonxlnx--taste-skill.md";
  await expect(canvas(page)).toHaveAttribute("data-selected", key);
  await expect
    .poll(async () => {
      const at = await nodeAt(page, key);
      return Math.abs(at.x - (at.left + at.width / 2)) < at.width * 0.05 && Math.abs(at.y - (at.top + at.height / 2)) < at.height * 0.05;
    })
    .toBe(true);
});

test("graph: a notice lies over the canvas; with every connection switched off it says how to turn them on, and nothing moves", async ({ page, magpie }) => {
  await openGraph(page, magpie);
  const box = await canvas(page).boundingBox();
  const key = "note:github--vercel-labs--agent-skills.md";
  const before = await nodeAt(page, key);
  await page.getByRole("group", { name: "Draw" }).getByRole("checkbox", { name: "Tags" }).uncheck(); // the journal has tags, no links
  await expect(page.getByText("No connections drawn. Turn on Tags or Links to see how your notes connect.")).toBeVisible();
  expect(await canvas(page).boundingBox()).toEqual(box);
  const after = await nodeAt(page, key);
  expect([after.x, after.y]).toEqual([before.x, before.y]);
});

test.describe("notes without connections", () => {
  test.use({ empty: true });

  test("graph: the journal has no connections yet: the notice says how to add them", async ({ page, magpie }) => {
    for (const name of ["zod", "pdfkit"]) writeFileSync(magpie.note(`npm--${name}.md`), renderNote({ id: `pkg:npm/${name}`, name, explored: "2026-10-08", kind: "library", tags: [] }));
    await openGraph(page, magpie);
    await expect(page.getByText("Your notes aren't connected yet. Add tags, or [[links]] in My notes.")).toBeVisible();
    await expect(status(page)).toHaveText("Showing 2 notes, 0 tags and 0 connections");
  });
});

test("graph: a change on disk updates it in place: what is drawn keeps its place, a new note starts next to its neighbour", async ({ page, magpie }) => {
  await openGraph(page, magpie);
  const doc = await page.evaluate(async () => (await fetch("/api/graph?journal=personal")).json() as Promise<GraphJson>);
  const key = "note:github--vercel-labs--agent-skills.md";
  const before = await nodeAt(page, key);

  // A link written in another editor: one more connection.
  const file = magpie.note("github--leonxlnx--taste-skill.md");
  writeFileSync(file, `${readFileSync(file, "utf8").replace(/\n*$/, "\n")}\nSee also [[github--vercel-labs--agent-skills]].\n`);
  const linked = statusLine(drawable({ ...doc, edges: [...doc.edges, { type: "link", source: "note:github--leonxlnx--taste-skill.md", target: key, count: 1 }] }, DEFAULT_SOURCES).counts);
  await expect(status(page)).toHaveText(linked);

  // A new note with a tag: it joins next to that tag.
  writeFileSync(magpie.note("npm--skills-kit.md"), renderNote({ id: "pkg:npm/skills-kit", name: "skills-kit", explored: "2026-10-08", kind: "library", tags: ["data-engineering"] }));
  await expect(status(page)).toContainText(`Showing ${doc.counts.notes + 1} notes`);
  const added = await nodeAt(page, "note:npm--skills-kit.md");
  const tag = await nodeAt(page, "tag:data-engineering");
  expect(Math.hypot(added.x - tag.x, added.y - tag.y)).toBeLessThan(60);

  const after = await nodeAt(page, key);
  expect([after.x, after.y]).toEqual([before.x, before.y]); // the camera didn't move
  await expect(canvas(page)).toHaveAttribute("data-settled", "true"); // no new layout
});

test("graph: the sidebar, g g and the palette open it; the status line counts in words; it draws, and the layout settles under the CSP", async ({ page, magpie }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/.test(message.text())) violations.push(message.text());
  });
  await magpie.open(page);
  await page.getByRole("button", { name: "Graph", exact: true }).click();
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
  await page.getByRole("button", { name: "Graph", exact: true }).click();
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
    await page.getByRole("button", { name: "Graph", exact: true }).click();
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
    await page.getByRole("button", { name: "Graph", exact: true }).click();
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
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(page.getByText("This browser can't draw the graph: WebGL is off or not available.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Showing/ })).toHaveText(await expectedStatus(page));
  await expect(page.locator(".graph-canvas")).toHaveCount(0);
  // The accessible path still works: the neighbours list and the search box.
  await page.getByRole("combobox", { name: "Find a note or tag in the graph" }).fill("#agent");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox", { name: "Neighbours of #agent-skills" }).getByRole("option")).toHaveCount(5);
});
