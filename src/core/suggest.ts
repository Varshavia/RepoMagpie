// magpie suggest (spec §2, §5): what the user already has that fits a project. Narrows candidates
// by keyword and tags across both journals, Verdict first; the coding agent makes the semantic
// choice (SKILL.md). The project's own dependencies are never suggested; those with an avoid note
// are listed apart, as recall shows them. No embeddings in v0.1. Never prints.
import { join } from "node:path";
import { findProjectJournal, homeJournal, resolvePersonalJournal, samePath, type Place } from "./journals.ts";
import { readProject } from "./manifests.ts";
import type { Outcome } from "./outcome.ts";
import { isAvoid, loadRecallEntries, recall, type RecallMatch, type RecallSource } from "./recall.ts";
import { projectFirst, type JournalSource } from "./search.ts";
import { loadIndex, type SearchDoc } from "./search-index.ts";

export interface SuggestRequest {
  description?: string; // instead of the project's manifests and README
  limit: number;
  journal?: JournalSource["scope"]; // one journal only
}

// One candidate, in the shape of `magpie suggest --json`.
export interface Candidate {
  id: string | null;
  journal: JournalSource["scope"];
  name: string;
  verdict: string | null; // null for a note without a Verdict
  status: "inbox" | "reviewed";
  tags: string[];
  score: number;
  why: {
    keywords: string[]; // the keywords the note matched, in keyword order
    dependencies: string[]; // the project's dependencies whose every word it matched; [] for a description
  };
  path: string;
}

// A candidate scoring under this share of the best candidate's score is dropped (spec §5). Picked
// with the quality tests (suggest-quality.test.ts): the notes they expect score 0.43 of the best or
// more; open-lakehouse, which shares a word or two ("agent", "app"), 0.09 or less.
export const MIN_SHARE = 0.2;

export interface SuggestJson {
  source: "manifests" | "description";
  keywords: string[];
  candidates: Candidate[];
  in_use_avoid: Omit<RecallMatch, "name">[]; // as in `magpie recall --json`
  error?: string;
}

export interface SuggestRun {
  outcome: Outcome;
  document: SuggestJson; // the --json document (spec §2)
  total: number; // candidates before the limit
  in_use_names: string[]; // the names of the in_use_avoid notes, in the same order, for people
  warnings: string[];
}

export function runSuggest(request: SuggestRequest, place: Place): SuggestRun {
  const project = readProject(place.cwd, place.home);
  const source = request.description === undefined ? "manifests" : "description";
  const keywords = keywordsOf(source === "description"
    ? [request.description ?? ""]
    : [...project.dependencies.map((d) => d.name), ...project.keywords, ...project.texts]);

  const personal = resolvePersonalJournal({ home: place.home, env: place.env, cwd: place.cwd, flag: place.homeFlag });
  const document: SuggestJson = { source, keywords, candidates: [], in_use_avoid: [] };
  const run = (outcome: Outcome, total = 0, inUseNames: string[] = []): SuggestRun => ({ outcome, document, total, in_use_names: inUseNames, warnings: personal.warnings });
  if (!keywords.length) {
    document.error = source === "description"
      ? "The description has no words to look for. Name what the project does, for example: magpie suggest \"a TypeScript CLI with tests\""
      : `Nothing to go on in ${project.folder}: no package.json, pyproject.toml, Cargo.toml or README. Describe the project instead: magpie suggest "a TypeScript CLI with tests"`;
    return run("usage");
  }

  const journals: { scope: JournalSource["scope"]; path: string }[] = [];
  if (request.journal !== "project") journals.push({ scope: "personal", path: personal.path });
  const projectJournal = findProjectJournal({ cwd: place.cwd, home: place.home, personalJournal: personal.path, flag: place.projectFlag });
  if (request.journal !== "personal" && projectJournal && !samePath(projectJournal, personal.path) && !samePath(projectJournal, homeJournal(place.home))) {
    journals.unshift({ scope: "project", path: projectJournal });
  }

  // What the project already uses: what recall would match for each dependency (spec §5).
  const sources: RecallSource[] = project.dependencies.length ? journals.map((j) => ({ ...j, entries: loadRecallEntries(j.path).entries })) : [];
  const inUse = project.dependencies.flatMap((d) => recall(sources, d.name, [d.type]));
  const usedIds = new Set(inUse.map((m) => m.id));
  const dependencyNames = [...new Set(project.dependencies.map((d) => d.name))];
  const avoid = inUse.filter((m, i) => isAvoid(m) && inUse.findIndex((o) => o.id === m.id && o.journal === m.journal) === i);
  document.in_use_avoid = avoid.map(({ name: _name, ...match }) => match);

  const scored: { candidate: Candidate; group: number }[] = [];
  for (const journal of journals) {
    const index = loadIndex(journal.path).index;
    const best = new Map<string, { score: number; terms: Set<string> }>(); // note file → its best document's score, the keywords of all
    // Prefix matching only: the keywords are real words from manifests and descriptions, and fuzzy
    // matching turns test into rest and text. A plural is looked up as its singular instead.
    for (const hit of index.search(keywords.map(singular).join(" "), { fuzzy: false })) {
      const file = (hit as unknown as SearchDoc).file;
      const note = best.get(file) ?? { score: 0, terms: new Set<string>() };
      note.score = Math.max(note.score, hit.score);
      for (const term of hit.queryTerms) note.terms.add(term);
      best.set(file, note);
    }
    for (const [file, { score, terms }] of best) {
      const doc = index.getStoredFields(file) as unknown as SearchDoc | undefined;
      if (!doc || (doc.purl && usedIds.has(doc.purl))) continue;
      const matched = keywords.filter((k) => terms.has(singular(k)));
      scored.push({
        group: doc.status === "reviewed" ? 0 : 1,
        candidate: {
          id: doc.purl,
          journal: journal.scope,
          name: doc.name,
          verdict: doc.verdict || null,
          status: doc.status,
          tags: doc.tags,
          score: Math.round((score + tagPoints(doc.tags, keywords)) * 100) / 100,
          why: { keywords: matched, dependencies: source === "manifests" ? matchedDependencies(dependencyNames, matched) : [] },
          path: join(journal.path, "notes", file),
        },
      });
    }
  }
  const floor = Math.max(0, ...scored.map((s) => s.candidate.score)) * MIN_SHARE;
  const kept = scored.filter((s) => s.candidate.score >= floor);
  kept.sort((a, b) => a.group - b.group || b.candidate.score - a.candidate.score);
  const candidates = projectFirst(kept.map((s) => s.candidate), (c) => c.id);
  document.candidates = candidates.slice(0, request.limit);
  return run("ok", candidates.length, avoid.map((m) => m.name));
}

// Words that say nothing about what a project does.
const STOP_WORDS = new Set(("a all also an and any are as at be but by can do for from has have how i if in into is it its just let lets me more " +
  "my no not of on only or our so that the their them then there these this to up us use used uses using via was we what when which while " +
  "who will with you your").split(" "));

// The keywords of some texts: lowercase words, each once, in order; no stop words, no numbers.
// Package names split into their words (@types/node → types, node).
export function keywordsOf(texts: string[]): string[] {
  const words = texts.flatMap((text) => text.toLowerCase().split(/[^a-z0-9]+/));
  return [...new Set(words.filter((word) => word && !STOP_WORDS.has(word) && !/^\d+$/.test(word)))];
}

// A keyword as suggest looks it up: one trailing "s" dropped from words of four letters or more.
// With prefix matching this only widens the match: test still finds tests and testing.
const singular = (word: string) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);

// The dependencies a note matched: those with words, every one of them among the matched keywords.
function matchedDependencies(names: string[], matched: string[]): string[] {
  return names.filter((name) => {
    const words = keywordsOf([name]);
    return words.length > 0 && words.every((word) => matched.includes(word));
  });
}

// One point per tag that matches the keywords: the tag itself, or each word of a hyphenated tag.
export function tagPoints(tags: string[], keywords: string[]): number {
  return tags.filter((tag) => tag.split("-").every((word) => keywords.includes(word))).length;
}
