import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hookOutput } from "../hook/claude-code.ts";
import { runCatalog } from "./catalog.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import { recall, recallStarred, runRecall, openRecallSources } from "./recall.ts";
import { runSearch } from "./search.ts";
import { runSuggest } from "./suggest.ts";
import { renderNote, type NewNote } from "./write.ts";

// The agent sees decisions, not stars (decision 0068): a starred note without a Verdict stays out of
// catalog's default list, recall and the hook; search and suggest rank it last and mark it; with a
// Verdict it is an ordinary note.

const note = (n: Partial<NewNote> & { id: string }) => renderNote({ name: n.id.replace(/^pkg:(npm|github)\//, ""), explored: "2026-10-04", kind: "library", tags: [], ...n });

// A starred note whose packages name an npm package: as `repomagpie note <url>` would add them later,
// so recall's exact match finds it.
const PDF_LIB = note({ id: "pkg:github/hopding/pdf-lib", name: "Hopding/pdf-lib", starred: "2026-11-01", packages: ["pkg:npm/pdf-lib"], tags: ["pdf"], whatItDoes: "Create and modify PDF documents in any JavaScript environment.", drafts: ["What it does"] });

function journal(files: Record<string, string>) {
  const root = scratchBase("starred");
  for (const path of ["home", "project/.git"]) mkdirSync(join(root, path), { recursive: true });
  mkdirSync(join(root, "journal", "notes"), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, "journal", "notes", name), text);
  const place = { home: join(root, "home"), env: { MAGPIE_HOME: join(root, "journal") }, cwd: join(root, "project") };
  return { root, place, write: (name: string, text: string) => writeFileSync(join(root, "journal", "notes", name), text) };
}

const FILES = {
  "npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", tags: ["pdf"], verdict: "fine for one-page PDFs", whatItDoes: "PDF documents for Node." }),
  "npm--jspdf.md": note({ id: "pkg:npm/jspdf", tags: ["pdf"], whatItDoes: "PDF documents in the browser." }),
  "github--hopding--pdf-lib.md": PDF_LIB,
  // Starred, then reviewed: an ordinary note.
  "github--diegomura--react-pdf.md": note({ id: "pkg:github/diegomura/react-pdf", starred: "2026-10-01", tags: ["pdf"], verdict: "our PDF renderer for React", whatItDoes: "PDF documents with React components." }),
};

test("catalog: a starred note without a Verdict is left out by default; starred: true lists it, marked", () => {
  const { place } = journal(FILES);
  const names = (starred?: boolean) => runCatalog({ limit: 100, starred }, place).document.notes.map((n) => `${n.name}${n.starred ? " (starred)" : ""}`);
  assert.deepEqual(names(), ["diegomura/react-pdf", "jspdf", "pdfkit"]);
  assert.deepEqual(names(true), ["diegomura/react-pdf", "Hopding/pdf-lib (starred)", "jspdf", "pdfkit"]);
  assert.equal(runCatalog({ limit: 100 }, place).document.total, 3);
});

test("recall and the hook don't answer from a starred note without a Verdict; recall names the star", () => {
  const w = journal(FILES);
  const { sources } = openRecallSources(w.place);
  assert.deepEqual(recall(sources, "pdf-lib", ["npm"]), []);
  assert.deepEqual(recallStarred(sources, "pdf-lib", ["npm"]).map((s) => s.id), ["pkg:github/hopding/pdf-lib"]);
  const run = runRecall(["pdf-lib", "pdfkit"], "npm", w.place);
  assert.deepEqual(run.document.matches.map((m) => m.id), ["pkg:npm/pdfkit"]);
  assert.deepEqual(run.document.starred, [{ query: "pdf-lib", id: "pkg:github/hopding/pdf-lib", journal: "personal", path: join(w.root, "journal", "notes", "github--hopding--pdf-lib.md") }]);
  const hook = (command: string) => hookOutput(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd: w.place.cwd }), { env: w.place.env, home: w.place.home, cwd: w.root, informOnly: false });
  assert.equal(hook("npm install pdf-lib"), null, "the hook says nothing");
  assert.match(hook("npm install jspdf") ?? "", /no verdict yet/, "an ordinary inbox note still answers");
});

test("search and suggest: starred notes after reviewed and inbox ones, marked starred", () => {
  const { place } = journal(FILES);
  const results = runSearch({ query: "pdf documents", limit: 10 }, place).document.results;
  assert.deepEqual(results.map((r) => `${r.name} ${r.status}${r.starred ? " starred" : ""}`), [
    ...results.filter((r) => r.status === "reviewed").map((r) => `${r.name} reviewed`),
    "jspdf inbox",
    "Hopding/pdf-lib inbox starred",
  ]);
  const candidates = runSuggest({ description: "pdf documents", limit: 10 }, place).document.candidates;
  assert.equal(candidates.at(-1)?.name, "Hopding/pdf-lib");
  assert.deepEqual(candidates.map((c) => c.starred), [...candidates.slice(1).map(() => false), true]);
});

test("a Verdict makes a starred note ordinary: in catalog, recall and the hook, and no longer marked", () => {
  const w = journal(FILES);
  runCatalog({ limit: 100 }, w.place); // builds the caches first: the change must reach them
  w.write("github--hopding--pdf-lib.md", PDF_LIB.replace("## Verdict\n", "## Verdict\nfine for filling forms\n"));
  assert.ok(runCatalog({ limit: 100 }, w.place).document.notes.some((n) => n.name === "Hopding/pdf-lib" && !n.starred));
  assert.deepEqual(runRecall(["pdf-lib"], "npm", w.place).document.matches.map((m) => m.verdict), ["fine for filling forms"]);
  const result = runSearch({ query: "pdf-lib", limit: 10 }, w.place).document.results.find((r) => r.id === "pkg:github/hopding/pdf-lib");
  assert.deepEqual([result?.status, result?.starred], ["reviewed", false]);
});
