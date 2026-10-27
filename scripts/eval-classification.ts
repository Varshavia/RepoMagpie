// npm run eval:classification: how well a new note's drafted kind and suggested domains fit what each
// repository is (decision 0046). Repositories in scripts/fixtures/classification.json, each with its
// recorded signals (topics, description, manifest keywords, file facts, the README's start) and the
// kind and domains written by hand before the classifier ran. Two runs, as `repomagpie note <url>`
// drafts them:
//   before  topics and files only, as 0.2.0-beta.13 did;
//   after   with the manifests' keywords, a GitHub Action's file and the README (decision 0046), and
//           the root folders (decision 0047).
// Kind: accuracy. Domains: precision and recall over every suggestion, and how many repositories got
// exactly their expected set. Then the misses, and the cases named in the brief. Reports only: no
// threshold. Not in CI. No network. `--json` prints only the scores.
//
// The held-out set (scripts/fixtures/classification-holdout.json) has kinds only, labelled before any
// code ran on it. Rules are tuned on the first set; the held-out set is read only with `--holdout`,
// which adds its kind accuracy, the two sets together, and its misses.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { suggestDomains, type Domain } from "../src/core/domains.ts";
import { draftKind } from "../src/core/github.ts";
import { topicTags } from "../src/core/topic-tags.ts";

export interface Case {
  full_name: string;
  expected: { kind: string; domains?: Domain[]; reason?: string }; // the held-out set has no domains, and a reason per kind
  description: string | null;
  topics: string[];
  is_template: boolean;
  keywords: string[];
  skill_folders: number | null;
  root_folders: string[] | null; // re-recorded on 2026-10-27 for decision 0047
  packages: string[] | null;
  plugin: boolean;
  bin: boolean;
  action: boolean;
  readme: string | null;
}

const read = (file: string) => JSON.parse(readFileSync(new URL(`fixtures/${file}`, import.meta.url), "utf8")) as { repositories: Case[] };
export const fixture = read("classification.json");
export const holdout = read("classification-holdout.json");

// The kind and domains a new note would get, with or without decision 0046's signals, in a journal
// that knows no tags yet (so keywords fill no tag slot, as on a first note).
export function classify(c: Case, signals: boolean): { kind: string; domains: Domain[] } {
  const id = `pkg:github/${c.full_name.toLowerCase()}`;
  const known = { tagList: [], shared: new Set<string>() };
  const extra = signals ? { keywords: c.keywords, readme: c.readme } : {};
  const files = { skillFolders: c.skill_folders, rootFolders: c.root_folders, packages: c.packages, plugin: c.plugin, bin: c.bin, action: signals && c.action };
  const kind = draftKind({ name: c.full_name, topics: c.topics, template: c.is_template, ...files, ...extra });
  const tags = topicTags(c.topics, id, known, signals ? c.keywords : []);
  const domains = suggestDomains({ tags, topics: c.topics, ...extra, hints: signals && c.action ? ["devops"] : [] });
  return { kind, domains };
}

export interface Score { kindRight: number; suggested: number; right: number; expected: number; exact: number }

// Domains count only where the case has expected domains (the first set).
export function score(cases: Case[], signals: boolean): Score {
  const s: Score = { kindRight: 0, suggested: 0, right: 0, expected: 0, exact: 0 };
  for (const c of cases) {
    const got = classify(c, signals);
    if (got.kind === c.expected.kind) s.kindRight++;
    const expected = c.expected.domains;
    if (!expected) continue;
    s.suggested += got.domains.length;
    s.expected += expected.length;
    s.right += got.domains.filter((d) => expected.includes(d)).length;
    if (got.domains.length === expected.length && got.domains.every((d) => expected.includes(d))) s.exact++;
  }
  return s;
}

const NAMED = [
  "browser-use/browser-use", "unclecode/crawl4ai", "getmaxun/maxun", "Stirling-Tools/Stirling-PDF", "supabase/supabase", "Leonxlnx/taste-skill",
  "microsoft/playwright", "radix-ui/primitives", "chakra-ui/chakra-ui", "actions/checkout", "docker/build-push-action", "sorrycc/awesome-javascript", "punkpeye/awesome-mcp-servers",
];

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const withHoldout = process.argv.includes("--holdout");
// --json: only the scores, for npm run measure: { repositories, before, after }, each a Score, for the
// first set; with --holdout also `holdout`, the same for the held-out set (kinds only).
if (isMain && process.argv.includes("--json")) {
  const scores = (cases: Case[]) => ({ repositories: cases.length, before: score(cases, false), after: score(cases, true) });
  console.log(JSON.stringify({ ...scores(fixture.repositories), ...(withHoldout ? { holdout: scores(holdout.repositories) } : {}) }));
} else if (isMain) {
  const n = fixture.repositories.length;
  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
  console.log(`${n} repositories (scripts/fixtures/classification.json)\n`);
  console.log("run     kind accuracy     domain precision     domain recall     exact domain sets");
  for (const [label, signals] of [["before", false], ["after", true]] as const) {
    const s = score(fixture.repositories, signals);
    console.log(`${label.padEnd(8)}${`${s.kindRight}/${n} ${pct(s.kindRight, n)}`.padEnd(18)}${`${s.right}/${s.suggested} ${pct(s.right, s.suggested)}`.padEnd(21)}${`${s.right}/${s.expected} ${pct(s.right, s.expected)}`.padEnd(18)}${s.exact}/${n}`);
  }
  const list = (d: string[]) => `[${d.join(", ")}]`;
  console.log("\nMisses after (expected → got), with the run before when it differs:");
  for (const c of fixture.repositories) {
    const expected = c.expected.domains ?? [];
    const [before, after] = [classify(c, false), classify(c, true)];
    const kindMiss = after.kind !== c.expected.kind;
    const wrong = after.domains.filter((d) => !expected.includes(d));
    const missed = expected.filter((d) => !after.domains.includes(d));
    const changed = before.kind !== after.kind || list(before.domains) !== list(after.domains);
    if (!kindMiss && !wrong.length && !missed.length && !changed) continue;
    const parts = [];
    if (kindMiss) parts.push(`kind ${c.expected.kind} → ${after.kind}`);
    if (wrong.length) parts.push(`wrong ${list(wrong)}`);
    if (missed.length) parts.push(`missed ${list(missed)}`);
    if (!parts.length) parts.push("right now");
    const was = changed ? `  (before: ${before.kind} ${list(before.domains)})` : "";
    console.log(`  ${c.full_name}: ${parts.join("; ")}${was}`);
  }
  console.log("\nNamed cases (after):");
  for (const name of NAMED) {
    const c = fixture.repositories.find((r) => r.full_name === name);
    if (!c) continue;
    const got = classify(c, true);
    const ok = got.kind === c.expected.kind && list([...got.domains].sort()) === list([...(c.expected.domains ?? [])].sort());
    console.log(`  ${ok ? "right" : "WRONG"}  ${name}: ${got.kind} ${list(got.domains)}${ok ? "" : `, expected ${c.expected.kind} ${list(c.expected.domains ?? [])}`}`);
  }
  if (withHoldout) {
    const h = holdout.repositories.length;
    const all = [...fixture.repositories, ...holdout.repositories];
    console.log(`\nKind accuracy by set (held-out: scripts/fixtures/classification-holdout.json, ${h} repositories)\n`);
    console.log(`run     first ${n}`.padEnd(26) + `held-out ${h}`.padEnd(18) + `all ${all.length}`);
    for (const [label, signals] of [["before", false], ["after", true]] as const) {
      const cell = (cases: Case[]) => `${score(cases, signals).kindRight}/${cases.length} ${pct(score(cases, signals).kindRight, cases.length)}`;
      console.log(`${label.padEnd(8)}${cell(fixture.repositories).padEnd(18)}${cell(holdout.repositories).padEnd(18)}${cell(all)}`);
    }
    console.log("\nHeld-out misses after (expected → got):");
    for (const c of holdout.repositories) {
      const got = classify(c, true).kind;
      if (got !== c.expected.kind) console.log(`  ${c.full_name}: ${c.expected.kind} → ${got}`);
    }
  }
}
