import { test } from "node:test";
import assert from "node:assert/strict";
import type { NoteSummary } from "../../../src/core/documents.ts";
import { browseRows, emptyText, whyLine } from "./search.ts";

test("whyLine: domains (suggested ones say so), then tags, then the words; null when nothing matched by name", () => {
  const why = (domains: string[], tags: string[], words: string[]) => ({ why: { domains, tags, words }, domains_suggested: ["testing"] });
  assert.equal(whyLine(why(["database", "testing"], ["postgresql"], ["orm", "sql"])), "domain database · domain testing (suggested) · tag postgresql · words orm, sql");
  assert.equal(whyLine(why([], [], ["orm"])), "word orm");
  assert.equal(whyLine(why([], [], [])), null);
});

const note = (name: string, over: Partial<NoteSummary> = {}): NoteSummary => ({
  id: `pkg:npm/${name}`, file: `npm--${name}.md`, name, kind: "library", tags: [], domains: [], domains_suggested: [], status: "reviewed", verdict: "fine", tried: false, rating: null, explored: "2026-10-01", read_only: false, ...over,
});
const ANY = { journal: "", kind: "", tag: "", domain: "" } as const;

test("browseRows: every note the filters keep, a Verdict first, then the most recently explored; a note that can't be read is left out", () => {
  const personal = [
    note("old"),
    note("inbox", { status: "inbox", verdict: "", explored: "2026-10-30" }),
    note("new", { explored: "2026-10-20", tags: ["pdf"], domains_suggested: ["testing"] }),
    note("broken", { id: null, name: null }),
  ];
  const project = [note("team", { explored: "2026-10-10", kind: "cli" })];
  const rows = browseRows({ personal, project }, ANY);
  assert.deepEqual(rows.map((r) => `${r.journal} ${r.name} ${r.status}`), ["personal new reviewed", "project team reviewed", "personal old reviewed", "personal inbox inbox"]);
  assert.deepEqual(rows[3], { id: "pkg:npm/inbox", journal: "personal", type: "note", skill: null, name: "inbox", verdict: null, status: "inbox", domains: [], domains_suggested: [], why: { domains: [], tags: [], words: [] }, score: 0, path: "" });
  assert.deepEqual(browseRows({ personal, project }, { ...ANY, journal: "project" }).map((r) => r.name), ["team"]);
  assert.deepEqual(browseRows({ personal, project }, { ...ANY, kind: "cli" }).map((r) => r.name), ["team"]);
  assert.deepEqual(browseRows({ personal, project }, { ...ANY, tag: "pdf" }).map((r) => r.name), ["new"]);
  assert.deepEqual(browseRows({ personal, project }, { ...ANY, domain: "testing" }).map((r) => r.name), ["new"], "a suggested domain counts, as in All notes");
  assert.deepEqual(browseRows({ personal: null }, ANY), []);
});

test("emptyText: a match the status filter hides is named, with the button that shows it", () => {
  const base = { query: "pdf", rows: [{ status: "inbox" as const }, { status: "inbox" as const }], filtered: true, unfiltered: null, total: 3, journals: 1 };
  assert.deepEqual(emptyText({ ...base, status: "reviewed" }), { text: "No reviewed notes match “pdf”. 2 inbox notes do.", fix: { kind: "status", status: "inbox", label: "Show inbox notes" } });
  assert.deepEqual(emptyText({ ...base, status: "inbox", rows: [{ status: "reviewed" }] }), { text: "No inbox notes match “pdf”. 1 reviewed note does.", fix: { kind: "status", status: "reviewed", label: "Show reviewed notes" } });
  assert.equal(emptyText({ ...base, query: "", status: "reviewed" }).text, "No reviewed notes with these filters yet. There are 2 inbox notes.");
});

test("emptyText: other filters, nothing at all, and an empty journal; never a journal that isn't there", () => {
  const base = { query: "pdf", status: "" as const, rows: [], total: 3, journals: 1 };
  assert.deepEqual(emptyText({ ...base, filtered: true, unfiltered: 3 }), { text: "No notes match “pdf” with these filters. 3 notes do without them.", fix: { kind: "clear" } });
  assert.deepEqual(emptyText({ ...base, filtered: false, unfiltered: null }), { text: "No notes match “pdf”. Try other words.", fix: null });
  assert.deepEqual(emptyText({ ...base, filtered: true, unfiltered: 0 }), { text: "No notes match “pdf”. Try other words.", fix: { kind: "clear" } });
  assert.deepEqual(emptyText({ ...base, query: "", filtered: true, unfiltered: null }), { text: "No notes have these filters.", fix: { kind: "clear" } });
  const empty = emptyText({ ...base, query: "", filtered: false, unfiltered: null, total: 0 });
  assert.deepEqual(empty, { text: "No notes in this journal yet. Add one from Discover or Import, or ask your agent to note a package.", fix: { kind: "add" } });
  assert.match(emptyText({ ...base, total: 0, filtered: false, unfiltered: null, journals: 2 }).text, /^No notes in your journals yet\./);
  for (const o of [empty, emptyText({ ...base, filtered: true, unfiltered: 3 })]) assert.doesNotMatch(o.text, /both|project/i);
});
