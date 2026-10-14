// repomagpie catalog (spec §2): the journals at a glance, one compact row per note, in pages, so an
// agent can read what the user has and make the semantic choice itself (decision 0034). Rows come
// from the search index's stored fields, alternatives from recall's entries: no cache of its own.
// Never prints.
import MiniSearch from "minisearch";
import { findProjectJournal, homeJournal, resolvePersonalJournal, samePath, type Place } from "./journals.ts";
import type { Outcome } from "./outcome.ts";
import { alternativesOfFile, loadRecallEntries } from "./recall.ts";
import type { JournalSource } from "./search.ts";
import { loadIndex, type SearchDoc } from "./search-index.ts";
import { CAPS, forAgent } from "./text.ts";

type Scope = JournalSource["scope"];

// One row, in the shape of `repomagpie catalog --json`.
export interface CatalogRow {
  id: string | null;
  name: string;
  kind: string | null;
  tags: string[];
  summary: string | null; // the first Use when item, else the first line of What it does
  verdict: string | null; // null for a note without one
  status: "inbox" | "reviewed";
  journal: Scope;
  alternatives: string[]; // the names of its alternatives, in recall's order (decision 0029)
  truncated?: string[]; // for an agent: the fields that were cut, only when one was (decision 0032)
}

export interface CatalogJson {
  notes: CatalogRow[];
  total: number; // rows the filters keep, on every page
  next_cursor: string | null; // pass it back as cursor for the next page; null on the last
  error?: string;
}

export interface CatalogRequest {
  limit: number;
  cursor?: string;
  tags?: string[]; // every tag must be present
  kind?: string;
  journal?: Scope; // one journal only
}

export interface CatalogRun {
  outcome: Outcome;
  document: CatalogJson; // the --json document, as read
  warnings: string[];
}

// Shorter caps than decision 0032's for the Verdict and the summary: a row is one line of a list an
// agent may read whole, and recall or search give the full note. An honest Verdict is far shorter
// (the example vault's longest is 113 characters); the other fields keep 0032's caps.
export const CATALOG_CAPS = { verdict: 200, summary: 200 } as const;

// A row's place in the order: its name ignoring case (cut, so a cursor stays short), the project
// journal before the personal one for the same name (spec §3), then its file. Unique per row.
type Key = [string, Scope, string];
const keyOf = (row: CatalogRow, file: string): Key => [row.name.toLowerCase().slice(0, CAPS.id), row.journal, file];
const rank = (scope: Scope) => (scope === "project" ? 0 : 1);
const compare = (a: Key, b: Key) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : rank(a[1]) - rank(b[1]) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));

// A cursor is the last row's key as base64url JSON: the next page starts after it, so a note added or
// removed before it doesn't shift the pages.
const encode = (key: Key) => Buffer.from(JSON.stringify(key)).toString("base64url");
function decode(cursor: string): Key | null {
  try {
    const key: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const ok = Array.isArray(key) && key.length === 3 && typeof key[0] === "string" && (key[1] === "personal" || key[1] === "project") && typeof key[2] === "string";
    return ok ? (key as Key) : null;
  } catch {
    return null;
  }
}

// The document as agent-facing output shows it (decision 0032, rule 2), for the CLI and MCP alike;
// people get the rows as read.
export function catalogForAgent(document: CatalogJson): CatalogJson {
  const notes = document.notes.map((row) => forAgent(row, {
    id: CAPS.id, name: CAPS.name, kind: CAPS.tag, tags: { each: CAPS.tag, count: CAPS.tags },
    summary: CATALOG_CAPS.summary, verdict: CATALOG_CAPS.verdict, alternatives: { each: CAPS.name, count: CAPS.alternatives },
  }));
  return forAgent({ ...document, notes }, { next_cursor: Infinity });
}

export function runCatalog(request: CatalogRequest, place: Place): CatalogRun {
  const personal = resolvePersonalJournal({ home: place.home, env: place.env, cwd: place.cwd, flag: place.homeFlag });
  const after = request.cursor === undefined ? null : decode(request.cursor);
  if (request.cursor !== undefined && !after) {
    const error = "Not a cursor from repomagpie catalog. Pass next_cursor from the previous page as it is, or leave it out for the first page.";
    return { outcome: "usage", document: { notes: [], total: 0, next_cursor: null, error }, warnings: personal.warnings };
  }

  const journals: { scope: Scope; path: string }[] = [];
  if (request.journal !== "project") journals.push({ scope: "personal", path: personal.path });
  const project = findProjectJournal({ cwd: place.cwd, home: place.home, personalJournal: personal.path, flag: place.projectFlag });
  if (request.journal !== "personal" && project && !samePath(project, personal.path) && !samePath(project, homeJournal(place.home))) {
    journals.push({ scope: "project", path: project });
  }

  const keep = (doc: SearchDoc) => doc.type === "note" && (!request.kind || doc.kind === request.kind) && (request.tags ?? []).every((tag) => doc.tags.includes(tag));
  const rows: { row: CatalogRow; key: Key }[] = [];
  for (const journal of journals) {
    const index = loadIndex(journal.path).index;
    const source = { ...journal, entries: loadRecallEntries(journal.path).entries };
    for (const hit of index.search(MiniSearch.wildcard, { filter: (r) => keep(r as unknown as SearchDoc) })) {
      const doc = hit as unknown as SearchDoc;
      const row: CatalogRow = {
        id: doc.purl,
        name: doc.name,
        kind: doc.kind,
        tags: doc.tags,
        summary: firstLine(doc.useWhen) ?? firstLine(doc.whatItDoes),
        verdict: doc.verdict || null,
        status: doc.status,
        journal: journal.scope,
        alternatives: alternativesOfFile(source, doc.file).map((a) => a.name),
      };
      rows.push({ row, key: keyOf(row, doc.file) });
    }
  }
  rows.sort((a, b) => compare(a.key, b.key));
  const start = after ? rows.findIndex((r) => compare(r.key, after) > 0) : 0;
  const page = start < 0 ? [] : rows.slice(start, start + request.limit);
  const last = page.at(-1);
  const more = last !== undefined && start + page.length < rows.length;
  return {
    outcome: "ok",
    document: { notes: page.map((r) => r.row), total: rows.length, next_cursor: more ? encode(last.key) : null },
    warnings: personal.warnings,
  };
}

// A section's first line of text, without a list item's marker; null when it has none.
function firstLine(text: string): string | null {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean);
  return line ? line.replace(/^[-*+]\s+/, "") : null;
}
