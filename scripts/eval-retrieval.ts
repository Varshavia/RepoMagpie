// npm run eval:retrieval: the retrieval baseline (feat/mcp-setup brief §3.6; RFC 0001 Phase 1).
// Does search find the right note? A journal built only from public GitHub metadata
// (scripts/fixtures/retrieval.json), as repomagpie note <url> writes it: no Verdict, no Use when,
// domains only suggested, the worst case. Each need is labelled with its category (concern,
// technology spelling, use case, Turkish), its split (tuning or held-out) and the structured form
// an agent would pass through MCP (query in the notes' language, domains, tags). Four runs:
//   today       the need as the query, without tag aliases (search before decision 0041);
//   aliases     the need as the query, with the starter aliases (query expansion);
//   structured  the structured form, with aliases, domains and tags;
//   +use when   the structured form, on the same journal with one synthetic Use when item a note.
// For each: the rank of the first expected note in the top 10, recall@5, recall@10 and MRR, by split
// and by category. The weights of decision 0041 are chosen on the tuning split only: a small grid is
// printed, and held-out is reported for the defaults. Then suggest with the need, and the catalog's
// size. Reports only: no threshold. Not in CI. No network; scratch journals, deleted after.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureNote } from "../src/core/capture.ts";
import { catalogForAgent, compactForAgent, runCatalog } from "../src/core/catalog.ts";
import { removeFolder } from "../src/core/copy-folder.ts";
import { countSkillFolders, type RepoMetadata } from "../src/core/github.ts";
import { fileNameFor, resolveTarget } from "../src/core/identity.ts";
import { carried, parseTagList, STARTER_TAGS, type Place } from "../src/core/journals.ts";
import { readNote } from "../src/core/note.ts";
import { searchJournals, searchSources, WEIGHTS, type JournalSource } from "../src/core/search.ts";
import { runSuggest } from "../src/core/suggest.ts";

interface Repository { full_name: string; description: string | null; topics: string[]; language: string | null; license: string; is_template: boolean }
interface Kinds { repositories: { full_name: string; skill_md: string[]; packages: string[]; bin: boolean; plugin: boolean }[] }
export interface Need {
  need: string;
  category: "concern" | "technology" | "use-case" | "turkish";
  split: "tuning" | "held-out";
  expected: string[];
  structured: { query: string; domains: string[]; tags: string[] };
}
const fixture = JSON.parse(readFileSync(new URL("fixtures/retrieval.json", import.meta.url), "utf8")) as {
  repositories: Repository[];
  needs: Need[];
  use_when: { items: Record<string, string[]> };
};
const kinds = JSON.parse(readFileSync(new URL("../src/core/fixtures/kinds.json", import.meta.url), "utf8")) as Kinds;

const base = fileURLToPath(new URL("../.scratch/eval/", import.meta.url));
mkdirSync(base, { recursive: true });

type Rank = number | null; // 1..10, or null when not in the top 10
interface Journal { place: Place; sources: JournalSource[]; ids: Map<string, string> }

// One scratch journal, built and handed to `use`, then deleted: with `useWhen`, each note also has
// the fixture's synthetic Use when items.
function withJournal<T>(useWhen: boolean, use: (journal: Journal) => T): T {
  const root = mkdtempSync(join(base, "retrieval-"));
  try {
    return use(build(root, useWhen));
  } finally {
    removeFolder(root);
  }
}

function build(root: string, useWhen: boolean): Journal {
  mkdirSync(join(root, ".git"));
  const journal = join(root, "journal");
  const project = join(root, "project");
  mkdirSync(join(journal, "notes"), { recursive: true });
  mkdirSync(project);
  const place: Place = { home: join(root, "home"), env: { MAGPIE_HOME: journal }, cwd: project };

  // The journal, note by note, as an import of these URLs builds it: each note's tags ranked against
  // the tag list (starter tags, then the tags earlier notes added) and the topics earlier notes carry.
  const tagList = parseTagList(STARTER_TAGS);
  const shared = new Set<string>();
  const ids = new Map<string, string>(); // full_name → id
  for (const repo of fixture.repositories) {
    const target = resolveTarget(`https://github.com/${repo.full_name}`);
    if (target.kind !== "ok") throw new Error(`${repo.full_name}: ${JSON.stringify(target)}`);
    const kind = kinds.repositories.find((k) => k.full_name === repo.full_name);
    const metadata: RepoMetadata = {
      name: repo.full_name, url: `https://github.com/${repo.full_name}`, description: repo.description, language: repo.language, license: repo.license,
      topics: repo.topics, skills: [], skillFolders: kind ? countSkillFolders(kind.skill_md) : 0, template: repo.is_template,
      packages: kind?.packages ?? [], plugin: kind?.plugin ?? false, bin: kind?.bin ?? false,
    };
    const ownUseWhen = useWhen ? fixture.use_when.items[repo.full_name] : undefined;
    const note = captureNote(null, { purl: target.purl, source: metadata.url, metadata, today: "2026-10-14", known: { tagList, shared }, ownUseWhen });
    if (!note.text) throw new Error(`${repo.full_name}: ${note.error}`);
    writeFileSync(join(journal, "notes", fileNameFor(target.purl)), note.text);
    for (const tag of note.tags) if (!tagList.includes(tag)) tagList.push(tag);
    for (const topic of carried(readNote(note.text).frontmatter)) shared.add(topic);
    ids.set(repo.full_name, target.purl);
  }
  return { place, sources: searchSources("personal", place).sources, ids };
}

const rankIn = (found: (string | null)[], expected: string[], ids: Map<string, string>): Rank => {
  const wanted = new Set(expected.map((name) => ids.get(name)));
  const at = found.slice(0, 10).findIndex((id) => id !== null && wanted.has(id));
  return at < 0 ? null : at + 1;
};
const notes = (results: { type: string; id: string | null }[]) => results.filter((r) => r.type === "note").map((r) => r.id);

function today(j: Journal, n: Need): Rank {
  return rankIn(notes(searchJournals(j.sources.map((s) => ({ ...s, aliases: new Map() })), n.need, { limit: 50 })), n.expected, j.ids);
}
function aliases(j: Journal, n: Need): Rank {
  return rankIn(notes(searchJournals(j.sources, n.need, { limit: 50 })), n.expected, j.ids);
}
function structured(j: Journal, n: Need, weights = WEIGHTS): Rank {
  const { query, domains, tags } = n.structured;
  return rankIn(notes(searchJournals(j.sources, query, { limit: 50, domains, tags, weights })), n.expected, j.ids);
}
function suggest(j: Journal, n: Need): Rank {
  return rankIn(runSuggest({ description: n.need, limit: 10 }, j.place).document.candidates.map((c) => c.id), n.expected, j.ids);
}

const RUNS = ["today", "aliases", "structured", "+use when"] as const;
type Row = { need: Need; ranks: Record<(typeof RUNS)[number], Rank>; suggest: Rank; suggestUseWhen: Rank };

const { rows: plainRows, grid, catalog } = withJournal(false, (j) => {
  const rows = fixture.needs.map((n) => ({ need: n, today: today(j, n), aliases: aliases(j, n), structured: structured(j, n), suggest: suggest(j, n) }));
  // The weights: a grid on the tuning split only (the suggested share stays half, decision 0040).
  const tuning = fixture.needs.filter((n) => n.split === "tuning");
  const grid: { domain: number; tag: number; mrr: number }[] = [];
  for (const domain of [0, 0.15, 0.3, 0.45, 0.6]) {
    for (const tag of [0, 0.1, 0.25, 0.4]) grid.push({ domain, tag, mrr: mrr(tuning.map((n) => structured(j, n, { domain, tag, suggested: WEIGHTS.suggested }))) });
  }
  const found = runCatalog({ limit: 1000 }, j.place);
  const compact = JSON.stringify(compactForAgent(found));
  const full = JSON.stringify(catalogForAgent(found.document));
  const total = found.document.total;
  return { rows, grid, catalog: `catalog --json for these ${total} notes: ${compact.length.toLocaleString("en")} characters (${Math.round(compact.length / total)} a row); --full ${full.length.toLocaleString("en")} (${Math.round(full.length / total)} a row)` };
});
const useWhenRows = withJournal(true, (j) => fixture.needs.map((n) => ({ structured: structured(j, n), suggest: suggest(j, n) })));
const rows: Row[] = plainRows.map((r, k) => ({
  need: r.need,
  ranks: { today: r.today, aliases: r.aliases, structured: r.structured, "+use when": useWhenRows[k].structured },
  suggest: r.suggest,
  suggestUseWhen: useWhenRows[k].suggest,
}));

function mrr(ranks: Rank[]): number {
  return ranks.reduce<number>((sum, r) => sum + (r === null ? 0 : 1 / r), 0) / (ranks.length || 1);
}
const recallAt = (ranks: Rank[], k: number) => ranks.filter((r) => r !== null && r <= k).length;
const pct = (hits: number, of: number) => `${hits}/${of} (${Math.round((100 * hits) / (of || 1))} %)`;
const metrics = (ranks: Rank[]) => `${pct(recallAt(ranks, 5), ranks.length).padEnd(14)}${pct(recallAt(ranks, 10), ranks.length).padEnd(14)}${mrr(ranks).toFixed(2)}`;

const cell = (rank: Rank) => (rank === null ? "-" : String(rank)).padStart(6);
const short = (text: string, width: number) => (text.length > width ? `${text.slice(0, width - 1)}…` : text).padEnd(width);
console.log(`Retrieval eval: ${fixture.repositories.length} notes from GitHub metadata only (no Verdicts, domains only suggested), ${rows.length} needs.`);
console.log(`Rank of the first expected note in the top 10 ("-": not there). Weights: domain ${WEIGHTS.domain}, tag ${WEIGHTS.tag}, suggested domain ${WEIGHTS.suggested} of a confirmed one.\n`);
console.log(`${"need".padEnd(58)} ${"category".padEnd(11)} ${"split".padEnd(9)} ${RUNS.map((r) => r.padStart(10)).join("")}`);
for (const r of rows) console.log(`${short(r.need.need, 58)} ${r.need.category.padEnd(11)} ${r.need.split.padEnd(9)} ${RUNS.map((run) => cell(r.ranks[run]).padStart(10)).join("")}`);

const table = (title: string, pick: (r: Row) => boolean) => {
  const chosen = rows.filter(pick);
  console.log(`\n${title} (${chosen.length} needs)`);
  console.log(`${"".padEnd(14)}${"recall@5".padEnd(14)}${"recall@10".padEnd(14)}MRR`);
  for (const run of RUNS) console.log(`${run.padEnd(14)}${metrics(chosen.map((r) => r.ranks[run]))}`);
};
table("All needs", () => true);
table("Tuning split", (r) => r.need.split === "tuning");
table("Held-out split", (r) => r.need.split === "held-out");
for (const category of ["concern", "technology", "use-case", "turkish"] as const) table(`Category: ${category}`, (r) => r.need.category === category);

console.log(`\nWeights on the tuning split (structured run, no Use when): MRR for each pair, best first`);
for (const g of [...grid].sort((a, b) => b.mrr - a.mrr || a.domain - b.domain || a.tag - b.tag).slice(0, 8)) {
  console.log(`  domain ${g.domain.toFixed(2)}  tag ${g.tag.toFixed(2)}  MRR ${g.mrr.toFixed(3)}${g.domain === WEIGHTS.domain && g.tag === WEIGHTS.tag ? "  (the defaults)" : ""}`);
}
const defaults = grid.find((g) => g.domain === WEIGHTS.domain && g.tag === WEIGHTS.tag);
const queryOnly = grid.find((g) => g.domain === 0 && g.tag === 0);
console.log(`  the defaults: MRR ${defaults?.mrr.toFixed(3)} on tuning; held-out is the table above.`);
console.log(`  the structured query alone (domain 0, tag 0): MRR ${queryOnly?.mrr.toFixed(3)}: what the rewritten words give without domains and tags.`);

console.log(`\nsuggest with the need (as before): all ${metrics(rows.map((r) => r.suggest))}; +use when ${metrics(rows.map((r) => r.suggestUseWhen))}  (recall@5, recall@10, MRR)`);
console.log(`\n${catalog}`);
