// The Discover page's logic (docs/ui.md §7, decision 0045): the filters as GET /api/discover's query,
// how a result card writes its numbers, what to loosen when nothing matches, and which selected
// results "Add N to inbox" adds. The page only shows; GitHub's search runs in magpie ui's server.
import type { DiscoverJson, DiscoverResult, Sort } from "../../../src/core/discover.ts";
import { compactCount, journalSummary, licenceText } from "../../../src/core/discover-format.ts";
import { visible } from "./text.ts";

export interface Filters {
  domain: string; // "" for any
  kind: string; // "" for any
  language: string;
  minStars: number;
  updatedWithin: number; // months, 0 for any time
  sort: Sort | null; // null until chosen: Best match with words, Stars without (decision 0054)
  archived: boolean;
  lists: boolean; // show lists, courses, books and cheatsheets
  hideOwned: boolean; // the app's own: hide the results a journal has a note on; never sent
}

export const DEFAULT_FILTERS: Filters = { domain: "", kind: "", language: "", minStars: 10, updatedWithin: 24, sort: null, archived: false, lists: false, hideOwned: false };

// The sort a search uses when none was chosen (core's default).
export const sortFor = (text: string, sort: Sort | null): Sort => sort ?? (text.trim() ? "best" : "stars");
export const STAR_STEPS = [10, 100, 1000, 10000];
export const UPDATED_STEPS: { months: number; label: string }[] = [
  { months: 0, label: "Any time" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
  { months: 24, label: "2 years" },
];
export const SORT_LABELS: Record<Sort, string> = { stars: "Stars", forks: "Forks", updated: "Recently updated", best: "Best match" };
export const LANGUAGES = ["TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", "C#", "C++", "Ruby", "PHP", "Swift", "Kotlin"];
// The kinds GitHub's topics can't name: chosen from the results by their estimated kind, so the
// filter is approximate (core's APPROXIMATE_KINDS; discover.test.ts keeps them equal).
export const APPROXIMATE_KINDS = ["cli", "library", "plugin", "app", "other"];

// GET /api/discover's query string for a search and a page.
export function discoverParams(text: string, filters: Filters, page = 1): Record<string, string | undefined> {
  return {
    q: text.trim() || undefined,
    domain: filters.domain || undefined,
    kind: filters.kind || undefined,
    language: filters.language.trim() || undefined,
    min_stars: String(filters.minStars),
    updated_within: String(filters.updatedWithin),
    include_archived: filters.archived ? "true" : undefined,
    include_lists: filters.lists ? "true" : undefined,
    sort: filters.sort ?? undefined,
    page: page === 1 ? undefined : String(page),
  };
}

// The results shown: without the ones a journal has a note on, when the person asked.
export function shownResults(results: DiscoverResult[], hideOwned: boolean): DiscoverResult[] {
  return hideOwned ? results.filter((r) => !r.in_journal.length) : results;
}

// "N lists and courses hidden."
export function listsHiddenText(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "list or course" : "lists and courses"} hidden.`;
}

// Why a card is in the results: the domain's or kind's topics whose search found it, and the
// search's words its name, description or topics hold; null when neither says anything.
export function matchedLine(result: Pick<DiscoverResult, "matched_topics" | "matched_words">): string | null {
  const parts: string[] = [];
  const { matched_topics: topics, matched_words: words } = result;
  if (topics.length) parts.push(`Matched ${topics.length === 1 ? "topic" : "topics"}: ${topics.join(", ")}`);
  if (words.length) parts.push(`${parts.length ? "matched" : "Matched"} ${words.length === 1 ? "word" : "words"}: ${visible(words.join(", "))}`);
  return parts.length ? parts.join(" · ") : null;
}

// Counts read aloud in full: "12,345 stars".
const whole = (n: number) => n.toLocaleString("en-US");

// What a card shows on its line of numbers. `date` is the last push's day, for the age's tooltip.
export function cardMeta(result: Pick<DiscoverResult, "stars" | "forks" | "pushed_at" | "updated" | "license">) {
  return {
    stars: compactCount(result.stars),
    starsLabel: `${whole(result.stars)} ${result.stars === 1 ? "star" : "stars"}`,
    forks: compactCount(result.forks),
    forksLabel: `${whole(result.forks)} ${result.forks === 1 ? "fork" : "forks"}`,
    age: result.updated,
    date: result.pushed_at ? `Last push ${result.pushed_at.slice(0, 10)}` : null,
    licence: result.license === "none" ? "No licence" : result.license === "unknown" ? "Licence unknown" : visible(licenceText(result.license)),
    noLicence: result.license === "none",
  };
}

// The "in your journal" badge's link: the note's Verdict, or What it does without one, named and on
// one line of about 100 characters (the CLI's rule, journalSummary); else that it has no Verdict yet.
export function badgeText(entry: Pick<DiscoverResult["in_journal"][number], "verdict" | "what_it_does">): string {
  if (!entry.verdict && !entry.what_it_does) return "Open the note (no Verdict yet)";
  return journalSummary({ verdict: entry.verdict && visible(entry.verdict), what_it_does: entry.what_it_does && visible(entry.what_it_does) });
}

// The filters a search with no results could loosen, named as the page shows them; the defaults
// aren't named (they are already loose).
export function looserFilters(query: DiscoverJson["query"]): string[] {
  const named: string[] = [];
  if (query.domain) named.push(`domain ${query.domain}`);
  if (query.kind) named.push(`kind ${query.kind}`);
  if (query.language) named.push(`language ${visible(query.language)}`);
  if (query.min_stars > DEFAULT_FILTERS.minStars) named.push(`at least ${compactCount(query.min_stars)} stars`);
  if (query.updated_within && query.updated_within < DEFAULT_FILTERS.updatedWithin) named.push(`updated within ${UPDATED_STEPS.find((s) => s.months === query.updated_within)?.label ?? `${query.updated_within} months`}`);
  if (query.topics.length) named.push(`topics ${query.topics.join(", ")}`);
  return named;
}

// A new page's results after the ones shown, each repository once.
export function appendResults(shown: DiscoverResult[], more: DiscoverResult[]): DiscoverResult[] {
  const names = new Set(shown.map((r) => r.name));
  return [...shown, ...more.filter((r) => !names.has(r.name))];
}

// The selection: owner/repo names, toggled one at a time.
export function toggle(selected: ReadonlySet<string>, name: string): Set<string> {
  const next = new Set(selected);
  if (!next.delete(name)) next.add(name);
  return next;
}

export type AddState = { status: "adding" } | { status: "added"; journal: "personal" | "project"; id: string | null } | { status: "failed"; error: string };

// Whether the current journal already has a note on the result.
export function inJournal(result: Pick<DiscoverResult, "in_journal">, journal: "personal" | "project") {
  return result.in_journal.find((entry) => entry.journal === journal) ?? null;
}

// What "Add N to inbox" does with the selection, in the results' order: the ones to add, and the ones
// the journal already has or that were added already (left as they are, counted as already there).
export function bulkPlan(results: DiscoverResult[], selected: ReadonlySet<string>, added: ReadonlyMap<string, AddState>, journal: "personal" | "project") {
  const picked = results.filter((r) => selected.has(r.name));
  const there = picked.filter((r) => inJournal(r, journal) || added.get(r.name)?.status === "added");
  return { add: picked.filter((r) => !there.includes(r)), there: there.map((r) => r.name) };
}

// Without a token, GitHub allows 60 requests an hour, and each add uses about 3 to 5: more than 5
// adds in a row is worth a warning first.
export const TOKEN_WARNING_ABOVE = 5;
export const needsTokenWarning = (count: number, tokenSet: boolean) => !tokenSet && count > TOKEN_WARNING_ABOVE;

export interface BulkOutcome {
  added: number;
  there: number;
  failed: { name: string; error: string }[];
}

export function bulkSummary({ added, there, failed }: BulkOutcome): string {
  const parts = [`Added ${added}`];
  if (there) parts.push(`${there} already in this journal`);
  if (failed.length) parts.push(`${failed.length} failed`);
  return `${parts.join(", ")}.`;
}

// The sentence after a rate limit's message: its reset in the reader's own time, or, for a time
// already past, "in a minute", never a time in the past.
export function resetSentence(reset: string | undefined, now = Date.now(), locale?: string): string | null {
  if (!reset) return null;
  const at = new Date(reset);
  if (Number.isNaN(at.getTime())) return null;
  return at.getTime() <= now ? "Try again in a minute." : `That is ${at.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} your time.`;
}
