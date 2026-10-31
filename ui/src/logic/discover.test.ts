import { test } from "node:test";
import assert from "node:assert/strict";
import { APPROXIMATE_KINDS as CORE_APPROXIMATE, emptyDiscover, type DiscoverResult } from "../../../src/core/discover.ts";
import { appendResults, APPROXIMATE_KINDS, bulkPlan, bulkSummary, cardMeta, DEFAULT_FILTERS, discoverParams, inJournal, listsHiddenText, looserFilters, matchedLine, needsTokenWarning, resetSentence, shownResults, sortFor, toggle, badgeText, type AddState } from "./discover.ts";

// The Discover page (docs/ui.md §7, decision 0045): what a card shows, the query it sends, and what
// "Add N to inbox" adds.

const result = (name: string, over: Partial<DiscoverResult> = {}): DiscoverResult => ({
  name,
  url: `https://github.com/${name}`,
  description: null,
  stars: 10,
  forks: 0,
  open_issues: 0,
  pushed_at: "2026-07-01T10:00:00Z",
  updated: "3 months ago",
  license: "MIT",
  archived: false,
  language: null,
  topics: [],
  estimated_kind: null,
  suggested_domains: [],
  matched_topics: [],
  matched_words: [],
  list_or_course: false,
  in_journal: [],
  ...over,
});

test("the approximate kinds are core's", () => {
  assert.deepEqual(APPROXIMATE_KINDS, CORE_APPROXIMATE);
});

test("a card's numbers: compact counts, read aloud in full; the age with the push's day; the licence in words", () => {
  const meta = cardMeta(result("a/b", { stars: 12_345, forks: 1, license: "Apache-2.0" }));
  assert.equal(meta.stars, "12.3k");
  assert.equal(meta.starsLabel, "12,345 stars");
  assert.equal(meta.forks, "1");
  assert.equal(meta.forksLabel, "1 fork");
  assert.equal(meta.age, "3 months ago");
  assert.equal(meta.date, "Last push 2026-07-01");
  assert.equal(meta.licence, "Apache-2.0");
  assert.equal(meta.noLicence, false);
  assert.equal(cardMeta(result("a/b", { stars: 1, forks: 2_500_000 })).starsLabel, "1 star");
  assert.equal(cardMeta(result("a/b", { forks: 2_500_000 })).forks, "2.5M");
  assert.deepEqual([cardMeta(result("a/b", { license: "none" })).licence, cardMeta(result("a/b", { license: "none" })).noLicence], ["No licence", true]);
  assert.deepEqual([cardMeta(result("a/b", { license: "unknown" })).licence, cardMeta(result("a/b", { license: "unknown" })).noLicence], ["Licence unknown", false]);
  assert.equal(cardMeta(result("a/b", { pushed_at: null, updated: null })).date, null);
});

test("the query: the filters as the API's parameters; defaults sent, empty ones left out; page 1 implied; hiding owned ones never sent", () => {
  assert.deepEqual(discoverParams(" design system ", DEFAULT_FILTERS), {
    q: "design system", domain: undefined, kind: undefined, language: undefined, min_stars: "10", updated_within: "24", include_archived: undefined, include_lists: undefined, sort: undefined, page: undefined,
  });
  const params = discoverParams("", { domain: "frontend", kind: "library", language: " TypeScript ", minStars: 1000, updatedWithin: 0, sort: "best", archived: true, lists: true, hideOwned: true }, 3);
  assert.deepEqual(params, { q: undefined, domain: "frontend", kind: "library", language: "TypeScript", min_stars: "1000", updated_within: "0", include_archived: "true", include_lists: "true", sort: "best", page: "3" });
});

test("the sort: Best match with words and Stars without, until one is chosen (decision 0054)", () => {
  assert.equal(sortFor("pdf", null), "best");
  assert.equal(sortFor("  ", null), "stars");
  assert.equal(sortFor("pdf", "forks"), "forks");
  assert.equal(DEFAULT_FILTERS.sort, null);
  assert.deepEqual([DEFAULT_FILTERS.lists, DEFAULT_FILTERS.hideOwned], [false, false]);
});

test("hiding the ones I already have: a note in either journal hides the result; off, every result shows", () => {
  const results = [result("a/b"), result("c/d", { in_journal: [{ journal: "project", id: "pkg:github/c/d", verdict: null, what_it_does: null }] })];
  assert.deepEqual(shownResults(results, true).map((r) => r.name), ["a/b"]);
  assert.equal(shownResults(results, false), results);
});

test("the lists line and the matched line", () => {
  assert.equal(listsHiddenText(1), "1 list or course hidden.");
  assert.equal(listsHiddenText(1200), "1,200 lists and courses hidden.");
  assert.equal(matchedLine(result("a/b")), null);
  assert.equal(matchedLine(result("a/b", { matched_topics: ["react"] })), "Matched topic: react");
  assert.equal(matchedLine(result("a/b", { matched_words: ["pdf"] })), "Matched word: pdf");
  assert.equal(matchedLine(result("a/b", { matched_topics: ["react", "vue"], matched_words: ["design", "system"] })), "Matched topics: react, vue · matched words: design, system");
  assert.equal(matchedLine(result("a/b", { matched_words: [`a${String.fromCharCode(0x202e)}b`] })), "Matched word: a<U+202E>b");
});

test("no results: the filters to loosen are named; the defaults aren't", () => {
  assert.deepEqual(looserFilters(emptyDiscover({ text: "x" }).query), []);
  const query = emptyDiscover({ text: "x", domain: "frontend", kind: "cli", language: "Go", minStars: 10_000, updatedWithin: 6, topics: ["react"] }).query;
  assert.deepEqual(looserFilters(query), ["domain frontend", "kind cli", "language Go", "at least 10k stars", "updated within 6 months", "topics react"]);
  assert.deepEqual(looserFilters(emptyDiscover({ text: "x", updatedWithin: 0 }).query), [], "any time is already loose");
});

test("the badge: the Verdict, else What it does, named, on one line of about 100 characters, as the CLI writes it", () => {
  assert.equal(badgeText({ verdict: "use for agent browser tests", what_it_does: null }), "Verdict: use for agent browser tests");
  const long = "use it for the invoice export at work, never for anything that streams large files, and pin the major version because the API changed twice";
  assert.equal(badgeText({ verdict: long, what_it_does: null }), "Verdict: use it for the invoice export at work, never for anything that streams large files, and pin the…");
  assert.equal(badgeText({ verdict: null, what_it_does: "Renders PDF invoices\nfrom HTML templates." }), "What it does: Renders PDF invoices from HTML templates.");
  assert.equal(badgeText({ verdict: null, what_it_does: null }), "Open the note (no Verdict yet)");
  assert.equal(badgeText({ verdict: `team ${String.fromCharCode(0x202e)}says yes`, what_it_does: null }), "Verdict: team <U+202E>says yes");
});

test("More results: a page's results after the shown ones, each repository once", () => {
  assert.deepEqual(appendResults([result("a/b"), result("c/d")], [result("c/d"), result("e/f")]).map((r) => r.name), ["a/b", "c/d", "e/f"]);
});

test("the selection: a click adds a name, a second removes it; the old set stays as it was", () => {
  const one = toggle(new Set(), "a/b");
  const two = toggle(one, "c/d");
  assert.deepEqual([...two], ["a/b", "c/d"]);
  assert.deepEqual([...toggle(two, "a/b")], ["c/d"]);
  assert.deepEqual([...one], ["a/b"]);
});

test("Add N: in the results' order; a note this journal has, or one added already, is counted as already there", () => {
  const results = [
    result("a/b"),
    result("c/d", { in_journal: [{ journal: "personal", id: "pkg:github/c/d", verdict: null, what_it_does: null }] }),
    result("e/f", { in_journal: [{ journal: "project", id: "pkg:github/e/f", verdict: "fine", what_it_does: null }] }),
    result("g/h"),
    result("i/j"),
  ];
  const added = new Map<string, AddState>([["g/h", { status: "added", journal: "personal", id: "pkg:github/g/h" }], ["i/j", { status: "failed", error: "x" }]]);
  const plan = bulkPlan(results, new Set(["i/j", "g/h", "e/f", "c/d", "a/b"]), added, "personal");
  assert.deepEqual(plan.add.map((r) => r.name), ["a/b", "e/f", "i/j"], "a failed one is tried again; the project's note doesn't count for personal");
  assert.deepEqual(plan.there, ["c/d", "g/h"]);
  assert.deepEqual(bulkPlan(results, new Set(["e/f"]), new Map(), "project").there, ["e/f"]);
  assert.equal(inJournal(results[2], "personal"), null);
});

test("the token warning: only without a token, and only above 5 adds", () => {
  assert.equal(needsTokenWarning(5, false), false);
  assert.equal(needsTokenWarning(6, false), true);
  assert.equal(needsTokenWarning(50, true), false);
});

test("the summary names what was added, what was there already, and what failed", () => {
  assert.equal(bulkSummary({ added: 4, there: 0, failed: [] }), "Added 4.");
  assert.equal(bulkSummary({ added: 2, there: 1, failed: [{ name: "x/y", error: "GitHub has no repository x/y." }] }), "Added 2, 1 already in this journal, 1 failed.");
});

test("a rate limit's reset in the reader's time; in a minute once it is past; none without one", () => {
  const now = Date.parse("2026-10-26T14:01:00Z");
  assert.equal(resetSentence(undefined, now), null);
  assert.equal(resetSentence("not a date", now), null);
  assert.match(resetSentence("2026-10-26T14:05:00.000Z", now, "en-GB") ?? "", /^That is \d\d:\d\d your time\.$/);
  assert.equal(resetSentence("2026-10-26T13:58:00.000Z", now, "en-GB"), "Try again in a minute.");
  assert.equal(resetSentence("2026-10-26T14:01:00.000Z", now, "en-GB"), "Try again in a minute.");
});
