import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, rmSync, writeFileSync, type watch } from "node:fs";
import { join } from "node:path";
import { sandbox } from "../cli/fixtures/sandbox.ts";
import { fakeFetch } from "../core/fixtures/fake-fetch.ts";
import { events } from "./fixtures/http.ts";
import { changedFiles, type LiveOptions } from "./live.ts";
import { startServer } from "./server.ts";

// Live updates (docs/ui.md §4): a note changed on disk reaches an open events stream, through
// fs.watch or, when that fails, through the periodic signature check.

const NOTE = "---\nid: pkg:npm/pdfkit\nname: pdfkit\n---\n\n## Verdict\nok\n";
const changed = (journal: string, files: string[]) => `event: notes-changed\ndata: ${JSON.stringify({ journal, files })}\n\n`;

async function start(t: TestContext, live: LiveOptions & { keepAliveMs?: number } = {}, files: Record<string, string | null> = {}) {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": NOTE, "project/.magpie/notes/": null, ...files });
  const server = await startServer({
    context: { home: box.home, env: { MAGPIE_HOME: box.journal }, cwd: box.project, fetch: fakeFetch({}), today: () => "2026-10-05" },
    open: async () => {},
    log: () => {},
    live,
  });
  t.after(() => server.close());
  const stream = events(server);
  t.after(() => stream.close());
  await stream.until(/^: connected\n\n/, 2000);
  return { box, server, stream };
}

test("a note written by another editor reaches an open events stream within 5 seconds", async (t) => {
  const { box, stream } = await start(t);
  assert.equal(stream.status(), 200);
  writeFileSync(box.note("npm--chalk.md"), NOTE.replace(/pdfkit/g, "chalk"));
  await stream.until((text) => text.includes(changed("personal", ["npm--chalk.md"])), 5000);
});

test("changes in the project journal are reported as project; deleted notes too", async (t) => {
  const { box, stream } = await start(t, { pollMs: 200 });
  writeFileSync(join(box.project, ".magpie", "notes", "npm--chalk.md"), NOTE);
  await stream.until((text) => text.includes(changed("project", ["npm--chalk.md"])), 5000);
  rmSync(box.note("npm--pdfkit.md"));
  await stream.until((text) => text.includes(changed("personal", ["npm--pdfkit.md"])), 5000);
});

test("when fs.watch throws, the periodic check alone finds the change", async (t) => {
  const throwing = (() => { throw new Error("watching is not possible here"); }) as unknown as typeof watch;
  const { box, stream } = await start(t, { watch: throwing, pollMs: 200 });
  writeFileSync(box.note("npm--pdfkit.md"), `${NOTE}\nedited\n`);
  await stream.until((text) => text.includes(changed("personal", ["npm--pdfkit.md"])), 3000);
});

test("a watcher that reports an error is closed; the periodic check goes on", async (t) => {
  const watchers: (EventEmitter & { closed: boolean })[] = [];
  const failing = (() => {
    const watcher = Object.assign(new EventEmitter(), { closed: false, close() { watcher.closed = true; } });
    watchers.push(watcher);
    return watcher;
  }) as unknown as typeof watch;
  const { box, stream } = await start(t, { watch: failing, pollMs: 200 });
  for (const watcher of watchers) watcher.emit("error", new Error("EPERM"));
  assert.ok(watchers.length > 0 && watchers.every((w) => w.closed));
  writeFileSync(box.note("npm--chalk.md"), NOTE);
  await stream.until((text) => text.includes(changed("personal", ["npm--chalk.md"])), 3000);
});

test("a journal created after the server started is picked up by the periodic check", async (t) => {
  const box = sandbox();
  const server = await startServer({
    context: { home: box.home, env: { MAGPIE_HOME: box.journal }, cwd: box.project, fetch: fakeFetch({}), today: () => "2026-10-05" },
    open: async () => {},
    log: () => {},
    live: { pollMs: 200 },
  });
  t.after(() => server.close());
  const stream = events(server);
  t.after(() => stream.close());
  await stream.until(/^: connected/, 2000);
  mkdirSync(join(box.journal, "notes"), { recursive: true });
  writeFileSync(box.note("npm--chalk.md"), NOTE);
  await stream.until((text) => text.includes(changed("personal", ["npm--chalk.md"])), 3000);
});

test("a comment keeps the stream open", async (t) => {
  const { stream } = await start(t, { keepAliveMs: 50 });
  await stream.until(/: keep-alive\n\n/, 2000);
});

test("closing the server ends open streams", async (t) => {
  const { server, stream } = await start(t);
  await server.close();
  await stream.until(() => stream.ended(), 2000);
});

test("changedFiles lists added, removed and modified notes, sorted", () => {
  assert.deepEqual(changedFiles({ "a.md": [1, 1], "b.md": [1, 1], "c.md": [1, 1] }, { "a.md": [1, 1], "b.md": [2, 1], "d.md": [1, 1] }), ["b.md", "c.md", "d.md"]);
  assert.deepEqual(changedFiles({ "a.md": [1, 1] }, { "a.md": [1, 1] }), []);
});
