// npm run eval:retrieval: the retrieval baseline (feat/mcp-setup brief §3.6). Does keyword search
// find the right note before anyone proposes embeddings? A journal built only from public GitHub
// metadata (scripts/fixtures/retrieval.json), as repomagpie note <url> writes it: no Verdict, no
// Use when, the worst case. For each need, the rank of its first expected repository in `search`
// and in `suggest` with that need; then recall@5 and recall@10, and the catalog's size for the
// journal. Reports only: no threshold yet. Not in CI. No network; a scratch journal, deleted after.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureNote } from "../src/core/capture.ts";
import { catalogForAgent, compactForAgent, runCatalog } from "../src/core/catalog.ts";
import { countSkillFolders, type RepoMetadata } from "../src/core/github.ts";
import { fileNameFor, resolveTarget } from "../src/core/identity.ts";
import { carried, parseTagList, STARTER_TAGS, type Place } from "../src/core/journals.ts";
import { readNote } from "../src/core/note.ts";
import { runSearch } from "../src/core/search.ts";
import { runSuggest } from "../src/core/suggest.ts";

interface Repository { full_name: string; description: string | null; topics: string[]; language: string | null; license: string; is_template: boolean }
interface Kinds { repositories: { full_name: string; skill_md: string[]; packages: string[]; bin: boolean; plugin: boolean }[] }
const fixture = JSON.parse(readFileSync(new URL("fixtures/retrieval.json", import.meta.url), "utf8")) as { repositories: Repository[]; needs: { need: string; expected: string[] }[] };
const kinds = JSON.parse(readFileSync(new URL("../src/core/fixtures/kinds.json", import.meta.url), "utf8")) as Kinds;

const base = fileURLToPath(new URL("../.scratch/eval/", import.meta.url));
mkdirSync(base, { recursive: true });
const root = mkdtempSync(join(base, "retrieval-"));
try {
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
    const note = captureNote(null, { purl: target.purl, source: metadata.url, metadata, today: "2026-10-14", known: { tagList, shared } });
    if (!note.text) throw new Error(`${repo.full_name}: ${note.error}`);
    writeFileSync(join(journal, "notes", fileNameFor(target.purl)), note.text);
    for (const tag of note.tags) if (!tagList.includes(tag)) tagList.push(tag);
    for (const topic of carried(readNote(note.text).frontmatter)) shared.add(topic);
    ids.set(repo.full_name, target.purl);
  }

  const rankOf = (found: (string | null)[], expected: string[]) => {
    const wanted = new Set(expected.map((name) => ids.get(name)));
    const at = found.findIndex((id) => id !== null && wanted.has(id));
    return at < 0 ? null : at + 1;
  };
  const rows = fixture.needs.map(({ need, expected }) => {
    const search = runSearch({ query: need, limit: 10 }, place).document.results.filter((r) => r.type === "note").map((r) => r.id);
    const suggest = runSuggest({ description: need, limit: 10 }, place).document.candidates.map((c) => c.id);
    return { need, expected, search: rankOf(search, expected), suggest: rankOf(suggest, expected) };
  });

  const recall = (key: "search" | "suggest", k: number) => {
    const hits = rows.filter((r) => r[key] !== null && (r[key] as number) <= k).length;
    return `${hits}/${rows.length} (${Math.round((100 * hits) / rows.length)} %)`;
  };
  const cell = (rank: number | null) => (rank === null ? "-" : String(rank)).padStart(6);
  console.log(`Retrieval baseline: ${fixture.repositories.length} notes from GitHub metadata only (no Verdicts), ${rows.length} needs.`);
  console.log(`Rank of the first expected note in the top 10 ("-": not there).\n`);
  console.log(`${"need".padEnd(66)} search suggest  expected`);
  for (const r of rows) console.log(`${r.need.padEnd(66)} ${cell(r.search)} ${cell(r.suggest)}  ${r.expected.join(", ")}`);
  console.log(`\n${"".padEnd(10)}${"recall@5".padEnd(16)}recall@10`);
  for (const key of ["search", "suggest"] as const) console.log(`${key.padEnd(10)}${recall(key, 5).padEnd(16)}${recall(key, 10)}`);

  const catalog = runCatalog({ limit: 1000 }, place);
  const compact = JSON.stringify(compactForAgent(catalog));
  const full = JSON.stringify(catalogForAgent(catalog.document));
  console.log(`\ncatalog --json for these ${catalog.document.total} notes: ${compact.length.toLocaleString("en")} characters (${Math.round(compact.length / catalog.document.total)} a row); --full ${full.length.toLocaleString("en")} (${Math.round(full.length / catalog.document.total)} a row)`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
