// repomagpie discover (decision 0045): searches GitHub's repositories by words, a domain, a kind,
// topics, a language, stars and activity, and says which results a journal already has. One to three
// read-only GET requests to GitHub's search (two without a token), one after another, only when the
// user searches; never a write. The CLI
// prints the document as --json and the app's GET /api/discover returns it (decision 0023).
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { DOMAIN_IDS, isDomain, suggestDomains, type Domain } from "./domains.ts";
import { ageText } from "./discover-format.ts";
import { noteDocument, noteListDocument } from "./documents.ts";
import { get, kindFromTopics, PLATFORM, RATE_LIMITS, SKILL_TOPICS, TEMPLATE, type FetchProblem } from "./github.ts";
import { journalAliases } from "./journals.ts";
import { KINDS, stripComments } from "./note.ts";
import { readCache, writeCache } from "./note-cache.ts";
import type { Outcome } from "./outcome.ts";
import { locateJournal, type Context } from "./save.ts";
import { CAPS, clean, forAgent } from "./text.ts";

export type Sort = "stars" | "forks" | "updated" | "best";
export const SORTS: readonly Sort[] = ["stars", "forks", "updated", "best"];

export interface DiscoverInput {
  text?: string;
  domain?: string;
  kind?: string;
  topics?: string[];
  language?: string;
  minStars?: number; // default 10
  updatedWithin?: number; // months; default 24; 0 means any time
  includeArchived?: boolean;
  sort?: Sort; // default stars
  limit?: number; // default 20, at most 50
  page?: number; // default 1
}

export interface DiscoverResult {
  name: string; // owner/repo
  url: string; // always https://github.com/owner/repo
  description: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  pushed_at: string | null;
  updated: string | null; // pushed_at as an age: "3 months ago"
  license: string; // an SPDX id; "none" when GitHub found no licence; "unknown" for one it couldn't name
  archived: boolean;
  language: string | null;
  topics: string[];
  estimated_kind: string | null; // decision 0030's rules on topics and the name; null when only files could say
  suggested_domains: Domain[];
  // what_it_does: the note's "What it does", read only when it has no Verdict; null otherwise
  in_journal: { journal: "personal" | "project"; id: string; verdict: string | null; what_it_does: string | null }[];
  truncated?: string[];
}

export interface DiscoverJson {
  query: {
    text: string; domain: string | null; kind: string | null; topics: string[]; language: string | null;
    min_stars: number; updated_within: number; include_archived: boolean; sort: Sort; limit: number; page: number;
  };
  searches: string[]; // the queries GitHub answered, one per request
  approximate: string | null; // why the kind filter is approximate, when it is
  total: number; // GitHub's count of matches; for several queries, their sum, which may count a repository twice
  next_page: number | null;
  incomplete: boolean; // GitHub stopped a query early (its timeout)
  cached: boolean;
  results: DiscoverResult[];
  warnings: string[];
  problem: FetchProblem | null;
  error?: string;
}

export interface DiscoverOptions {
  now?: () => number; // milliseconds, for the cache's age and a rate limit's reset; default Date.now
  timeoutMs?: number; // each request's; default github.ts's 10 seconds
  wait?: (ms: number) => Promise<void>; // for waiting out a short rate limit; default a timer
  onWait?: (seconds: number, problem: FetchProblem) => void; // told before that wait, so the CLI can say so
}

const DEFAULTS = { minStars: 10, updatedWithin: 24, sort: "stars" as Sort, limit: 20, page: 1 };
export const DISCOVER_LIMIT = 50;
const GITHUB_RESULTS = 1000; // GitHub's search returns at most 1,000 results a query
const TEXT_LIMIT = 256; // GitHub refuses longer query text ("Limitations on query length")
const TOPIC = /^[a-z0-9][a-z0-9-]{0,49}$/; // GitHub's topic rule: lowercase letters, digits and hyphens, at most 50
const LANGUAGE = /^[A-Za-z0-9+#. -]{1,40}$/;

// A domain's GitHub topics: the 3 most common of those DOMAIN_MAP maps to it on their own (not the
// generic "ai", nor "playwright", which needs no automation topic beside it), by the number of
// repositories with 10 stars or more on GitHub, counted on 2026-10-26 (decision 0045). GitHub's
// search can't OR topics, so each is its own request; without a token, only the first 2.
export const DOMAIN_TOPICS: Readonly<Record<Domain, readonly string[]>> = {
  architecture: ["microservices", "clean-architecture", "architecture"],
  security: ["security", "cybersecurity", "cryptography"],
  performance: ["performance", "optimization", "benchmark"],
  styling: ["css", "tailwindcss", "design"],
  database: ["database", "mysql", "postgresql"],
  testing: ["testing", "jest", "test"],
  auth: ["authentication", "jwt", "oauth2"],
  api: ["api", "graphql", "rest-api"],
  devops: ["kubernetes", "devops", "github-actions"],
  observability: ["monitoring", "logging", "metrics"],
  ai: ["machine-learning", "deep-learning", "llm"],
  tooling: ["cli", "developer-tools", "vscode"],
};

// The kinds GitHub topics name (decision 0030's topic rules): searched by those topics. The others
// (library, cli, plugin, app, other) are chosen from the results by their estimated kind.
const KIND_TOPICS: Readonly<Record<string, readonly string[]>> = {
  "skill-pack": SKILL_TOPICS,
  "awesome-list": ["awesome-list"],
  template: TEMPLATE,
  platform: ["platform", "low-code", "paas"].filter((t) => PLATFORM.includes(t)),
  framework: ["framework"],
};
export const APPROXIMATE_KINDS = KINDS.filter((kind) => !KIND_TOPICS[kind]);

// Requests a search may send: 3 with a token (30 searches a minute), 2 without (10 a minute), so a
// domain search without one leaves room for a few more in the minute.
export const MAX_REQUESTS = 3;
export const MAX_REQUESTS_WITHOUT_TOKEN = 2;

// A rate limit over within this many milliseconds is waited out, and its request sent once more,
// once a search (decision 0045, rule 9). The wait is a second longer than GitHub's: its reset is in
// whole seconds.
export const RETRY_WITHIN = 60_000;

type Result<T> = { outcome: Outcome; document: T };

// The empty document for an input, with an error: the shape a failure keeps (spec §1).
export function emptyDiscover(input: DiscoverInput = {}, error?: string): DiscoverJson {
  return {
    query: normalise(input),
    searches: [],
    approximate: null,
    total: 0,
    next_page: null,
    incomplete: false,
    cached: false,
    results: [],
    warnings: [],
    problem: null,
    ...(error === undefined ? {} : { error }),
  };
}

function normalise(input: DiscoverInput): DiscoverJson["query"] {
  return {
    text: (input.text ?? "").trim().replace(/\s+/g, " "),
    domain: input.domain ?? null,
    kind: input.kind ?? null,
    topics: [...new Set((input.topics ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))],
    language: input.language?.trim() || null,
    min_stars: input.minStars ?? DEFAULTS.minStars,
    updated_within: input.updatedWithin ?? DEFAULTS.updatedWithin,
    include_archived: input.includeArchived === true,
    sort: input.sort ?? DEFAULTS.sort,
    limit: input.limit ?? DEFAULTS.limit,
    page: input.page ?? DEFAULTS.page,
  };
}

// Why the input can't be searched, or null (the CLI's exit 2, the API's 400).
export function discoverProblem(input: DiscoverInput): string | null {
  const q = normalise(input);
  if (!q.text && !q.domain && !q.kind && !q.topics.length && !q.language) return "Give words or a filter (--domain, --kind, --topic or --language).";
  if (q.text.length > TEXT_LIMIT) return `The words are over ${TEXT_LIMIT} characters, GitHub's limit for a search.`;
  if (/[\u0000-\u001f\u007f]/.test(q.text)) return "The words can't hold control characters.";
  if (q.domain !== null && !isDomain(q.domain)) return `domain takes one of: ${DOMAIN_IDS.join(", ")}.`;
  if (q.kind !== null && !KINDS.includes(q.kind)) return `kind takes one of: ${KINDS.join(", ")}.`;
  const topic = q.topics.find((t) => !TOPIC.test(t));
  if (topic !== undefined) return `Not a GitHub topic: ${JSON.stringify(clean(topic).slice(0, 64))}. A topic is lowercase letters, digits and hyphens, at most 50.`;
  if (q.topics.length > 10) return "Give at most 10 topics.";
  if (q.language !== null && !LANGUAGE.test(q.language)) return "language takes a language's name, such as TypeScript or \"Jupyter Notebook\".";
  if (!Number.isInteger(q.min_stars) || q.min_stars < 0) return "min_stars takes a whole number of 0 or more.";
  if (!Number.isInteger(q.updated_within) || q.updated_within < 0) return "updated_within takes a whole number of months, 0 for any time.";
  if (!SORTS.includes(q.sort)) return `sort takes one of: ${SORTS.join(", ")}.`;
  if (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > DISCOVER_LIMIT) return `limit takes a whole number from 1 to ${DISCOVER_LIMIT}.`;
  if (!Number.isInteger(q.page) || q.page < 1) return "page takes a whole number of 1 or more.";
  if (q.page * q.limit > GITHUB_RESULTS) return `GitHub's search shows only the first ${GITHUB_RESULTS} results; with limit ${q.limit}, the last page is ${Math.floor(GITHUB_RESULTS / q.limit)}.`;
  return null;
}

// The queries for GitHub, one per request (decision 0045). Each holds the words, where to look for
// them, the filters, and at most one topic of the domain's and the kind's; GitHub's search ANDs
// qualifiers and can't OR them, so a domain's topics are sent one per request and merged. At most
// `maxRequests` of them; `leftOut` names the topics that didn't fit.
export function buildQueries(input: DiscoverInput, today: string, maxRequests = MAX_REQUESTS): { queries: string[]; postKind: string | null; leftOut: string[] } {
  const q = normalise(input);
  const domainTopics = q.domain ? [...DOMAIN_TOPICS[q.domain as Domain]] : [];
  const kindTopics = q.kind ? [...(KIND_TOPICS[q.kind] ?? [])] : [];
  // A kind with several topics beside a domain's: 3 × 3 requests is too many, so the kind is chosen
  // from the results, as for the kinds topics can't name.
  const postKind = q.kind && (!kindTopics.length || (domainTopics.length && kindTopics.length > 1)) ? q.kind : null;
  const extra = postKind ? [] : kindTopics;
  const split = domainTopics.length ? domainTopics : extra;
  const leftOut = split.slice(maxRequests);
  const variants = domainTopics.length
    ? domainTopics.slice(0, maxRequests).map((topic) => [topic, ...(extra.length === 1 ? extra : [])])
    : extra.length
      ? extra.slice(0, maxRequests).map((topic) => [topic])
      : [[]];

  const base: string[] = [];
  if (q.text) base.push(q.text, "in:name,description,topics");
  if (!q.include_archived) base.push("archived:false");
  base.push("fork:false", `stars:>=${q.min_stars}`);
  if (q.updated_within > 0) base.push(`pushed:>=${monthsBefore(today, q.updated_within)}`);
  if (q.language) base.push(`language:${/\s/.test(q.language) ? `"${q.language}"` : q.language}`);
  const queries = variants.map((topics) => [...base, ...[...new Set([...q.topics, ...topics])].map((t) => `topic:${t}`)].join(" "));
  return { queries: [...new Set(queries)], postKind, leftOut };
}

// The date `months` before today, YYYY-MM-DD; the day is kept, or the month's last when it has fewer.
function monthsBefore(today: string, months: number): string {
  const [year, month, day] = today.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

function searchPath(query: string, sort: Sort, limit: number, page: number): string {
  const order = sort === "best" ? "" : `&sort=${sort}&order=desc`;
  return `/search/repositories?q=${encodeURIComponent(query)}${order}&per_page=${limit}&page=${page}`;
}

// What a search keeps of each result: GitHub's text cleaned (decision 0032, rule 8), the rest checked.
type Found = Omit<DiscoverResult, "updated" | "estimated_kind" | "suggested_domains" | "in_journal" | "truncated"> & { template: boolean; updated_at: string; score: number };
const FULL_NAME = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

function found(item: Record<string, unknown>): Found | null {
  const text = (value: unknown) => (typeof value === "string" ? clean(value).trim() : "");
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
  const date = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T[\d:]+Z$/.test(value) ? value : null);
  const name = typeof item.full_name === "string" ? item.full_name : "";
  if (!FULL_NAME.test(name)) return null; // never shown, so never added
  const license = item.license as { spdx_id?: unknown } | null | undefined;
  const spdx = text(license?.spdx_id);
  return {
    name,
    url: `https://github.com/${name}`,
    description: text(item.description) || null,
    stars: count(item.stargazers_count),
    forks: count(item.forks_count),
    open_issues: count(item.open_issues_count),
    pushed_at: date(item.pushed_at),
    license: !license ? "none" : spdx && spdx !== "NOASSERTION" ? spdx : "unknown",
    archived: item.archived === true,
    language: text(item.language) || null,
    topics: (Array.isArray(item.topics) ? item.topics : []).map(text).filter(Boolean),
    template: item.is_template === true,
    updated_at: date(item.updated_at) ?? date(item.pushed_at) ?? "",
    score: typeof item.score === "number" ? item.score : 0,
  };
}

interface Searched { items: Found[]; total: number; nextPage: number | null; incomplete: boolean }

// The cache holds earlier successful answers only: never a problem, a limit or a time to wait. What
// is read from it can only answer a search, never fail one or keep it from GitHub. A file of
// another version starts empty; an entry not of this exact shape is dropped, and goes at the next
// write.
const CACHE = "discover.json";
const CACHE_VERSION = 2; // 2: entries checked field by field; a file from the builds before starts empty
const CACHE_AGE = 10 * 60 * 1000;
const CACHE_ENTRIES = 50;
type CacheEntry = { key: string; at: number; data: Searched };

// The cache key: a hash of what GitHub is asked, never the token.
function cacheKey(queries: string[], sort: Sort, limit: number, page: number): string {
  return createHash("sha256").update(JSON.stringify({ queries, sort, limit, page })).digest("hex");
}

const exactly = (value: unknown, keys: string): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).sort().join(",") === keys;
const isCount = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isTextOrNull = (v: unknown) => v === null || typeof v === "string";
const FOUND_KEYS = "archived,description,forks,language,license,name,open_issues,pushed_at,score,stars,template,topics,updated_at,url";

function isFound(v: unknown): v is Found {
  return exactly(v, FOUND_KEYS) && typeof v.name === "string" && FULL_NAME.test(v.name) && v.url === `https://github.com/${v.name}` &&
    isTextOrNull(v.description) && isCount(v.stars) && isCount(v.forks) && isCount(v.open_issues) && isTextOrNull(v.pushed_at) &&
    typeof v.license === "string" && typeof v.archived === "boolean" && isTextOrNull(v.language) &&
    Array.isArray(v.topics) && v.topics.every((t) => typeof t === "string") && typeof v.template === "boolean" &&
    typeof v.updated_at === "string" && typeof v.score === "number" && Number.isFinite(v.score);
}

export function isCacheEntry(e: unknown): e is CacheEntry {
  if (!exactly(e, "at,data,key") || typeof e.key !== "string" || !/^[0-9a-f]{64}$/.test(e.key) || typeof e.at !== "number" || !Number.isFinite(e.at)) return false;
  const data = e.data;
  return exactly(data, "incomplete,items,nextPage,total") && Array.isArray(data.items) && data.items.length <= DISCOVER_LIMIT && data.items.every(isFound) &&
    isCount(data.total) && (data.nextPage === null || (isCount(data.nextPage) && (data.nextPage as number) >= 2)) && typeof data.incomplete === "boolean";
}

function cachedEntries(journal: string): CacheEntry[] {
  try {
    const data = readCache(journal, CACHE, CACHE_VERSION, {}) as { entries?: unknown } | undefined;
    return (Array.isArray(data?.entries) ? data.entries : []).filter(isCacheEntry);
  } catch {
    return []; // a cache that can't be read is no cache
  }
}

export async function runDiscover(input: DiscoverInput, context: Context, options: DiscoverOptions = {}): Promise<Result<DiscoverJson>> {
  const usage = discoverProblem(input);
  if (usage) return { outcome: "usage", document: emptyDiscover(input, usage) };
  const query = normalise(input);
  const token = Boolean(context.env.GITHUB_TOKEN);
  const { queries, postKind, leftOut } = buildQueries(input, context.today(), token ? MAX_REQUESTS : MAX_REQUESTS_WITHOUT_TOKEN);
  const now = (options.now ?? Date.now)();
  const personal = locateJournal("personal", context);
  const key = cacheKey(queries, query.sort, query.limit, query.page);
  const entries = cachedEntries(personal.path).filter((e) => now - e.at >= 0 && now - e.at < CACHE_AGE);
  const hit = entries.find((e) => e.key === key);
  const document = emptyDiscover(input);
  document.searches = queries;
  document.warnings.push(...personal.warnings);
  document.approximate = postKind
    ? `GitHub can't search by the kind ${postKind}, so the results are filtered by their estimated kind, from topics and the name: some ${postKind}s are left out, and a page can hold fewer results.`
    : null;
  if (leftOut.length) {
    const what = query.domain ? `the domain ${query.domain}` : `the kind ${query.kind}`;
    const all = query.domain ? DOMAIN_TOPICS[query.domain as Domain] : (KIND_TOPICS[query.kind as string] ?? []);
    const done = all.filter((t) => !leftOut.includes(t));
    document.warnings.push(`Without GITHUB_TOKEN, only ${done.length} of ${what}'s ${all.length} topics were searched (${done.join(", ")}; not ${leftOut.join(", ")}), to stay within GitHub's 10 searches a minute. Set GITHUB_TOKEN to search them all.`);
  }

  let searched: Searched;
  if (hit) {
    searched = hit.data;
    document.cached = true;
  } else {
    const got = await search(queries, query, context, options);
    if (!got.ok) {
      document.problem = got.problem;
      document.error = got.problem.message;
      return { outcome: "failed", document };
    }
    searched = got.searched;
    if (got.stopped) {
      // A rate limit after some answers: those are shown, with a warning, and never cached, so the
      // same search later asks GitHub again for all of it.
      document.searches = queries.slice(0, got.answered);
      document.warnings.push(`Only ${got.answered} of ${queries.length} searches ran: ${got.stopped.message} The results are from ${got.answered === 1 ? "the first" : `the first ${got.answered}`}; search again later for the rest.`);
    } else if (existsSync(personal.path)) {
      // Kept whole and renamed into place; the oldest entries go first. A search never creates the
      // journal: without one there is no cache.
      writeCache(personal.path, CACHE, CACHE_VERSION, {}, { entries: [...entries.filter((e) => e.key !== key), { key, at: now, data: searched }].slice(-CACHE_ENTRIES) });
    }
  }

  const journals = journalNotes(context);
  const aliases = journalAliases(personal.path);
  const results = searched.items
    .map((item): DiscoverResult => {
      const { template, updated_at: _updated, score: _score, ...shown } = item;
      const key = `pkg:github/${item.name.toLowerCase()}`;
      return {
        ...shown,
        updated: item.pushed_at ? ageText(item.pushed_at, context.today()) : null,
        estimated_kind: kindFromTopics({ name: item.name, topics: item.topics, template }),
        suggested_domains: suggestDomains({ topics: item.topics }, aliases),
        in_journal: journals.flatMap(({ journal, notes }) => {
          const note = notes.get(key);
          return note ? [{ journal, id: note.id, verdict: note.verdict, what_it_does: note.verdict ? null : whatItDoes(journal, note.id, context) }] : [];
        }),
      };
    })
    .filter((r) => !postKind || kindMatches(postKind, r.estimated_kind));
  document.results = results.map(resultForAgent);
  document.total = searched.total;
  document.next_page = searched.nextPage;
  document.incomplete = searched.incomplete;
  return { outcome: "ok", document };
}

// A kind chosen from the results: a kind topics name must be the estimated one; app likewise (its
// rule reads topics); library, cli, plugin and other are decided by files, so a result whose topics
// say nothing (estimated null) may be one. A few topics name a library too (decision 0047): a
// library's estimate is `library` or nothing.
function kindMatches(kind: string, estimated: string | null): boolean {
  if (kind === "library") return estimated === null || estimated === "library";
  return KIND_TOPICS[kind] || kind === "app" ? estimated === kind : estimated === null;
}

type Searching = { ok: true; searched: Searched; answered: number; stopped: FetchProblem | null } | { ok: false; problem: FetchProblem };

// The requests one after another, never at once (GitHub's best practices: concurrent requests meet
// its secondary limit). The first rate limit over within RETRY_WITHIN is waited out and its request
// sent again; a rate limit after that, with some answers, stops there and keeps them (`stopped`);
// any other failure, or a rate limit with no answers, fails the search.
async function search(queries: string[], q: DiscoverJson["query"], context: Context, options: DiscoverOptions): Promise<Searching> {
  const token = context.env.GITHUB_TOKEN || undefined;
  const now = options.now ?? Date.now;
  const request = (query: string) => get(searchPath(query, q.sort, q.limit, q.page), "search", { fetch: context.fetch, token, timeoutMs: options.timeoutMs, now });
  const answers: { total: number; incomplete: boolean; items: Found[] }[] = [];
  let stopped: FetchProblem | null = null;
  let retried = false;
  for (const query of queries) {
    let got = await request(query);
    const ms = !got.ok && !retried ? shortWait(got.problem, now()) : null;
    if (!got.ok && ms !== null) {
      retried = true;
      options.onWait?.(Math.ceil(ms / 1000), got.problem);
      await (options.wait ?? ((wait) => new Promise<void>((resolve) => setTimeout(resolve, wait))))(ms);
      got = await request(query);
    }
    if (!got.ok && answers.length && RATE_LIMITS.includes(got.problem.kind)) {
      stopped = got.problem;
      break;
    }
    if (!got.ok) return got;
    let body: { total_count?: unknown; incomplete_results?: unknown; items?: unknown };
    try {
      body = JSON.parse(got.text) as typeof body;
    } catch {
      return { ok: false, problem: { kind: "http", message: "GitHub's answer wasn't JSON." } };
    }
    const items = (Array.isArray(body.items) ? body.items : []).filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null).map(found).filter((i): i is Found => i !== null);
    answers.push({ total: typeof body.total_count === "number" ? body.total_count : items.length, incomplete: body.incomplete_results === true, items });
  }
  // Merged: each repository once (by its name, ignoring case), in the sort's order, cut to the limit.
  const seen = new Set<string>();
  const merged = answers.flatMap((a) => a.items).filter((item) => !seen.has(item.name.toLowerCase()) && Boolean(seen.add(item.name.toLowerCase())));
  if (answers.length > 1) merged.sort(compareBy(q.sort));
  const more = answers.some((a) => a.total > q.page * q.limit) && (q.page + 1) * q.limit <= GITHUB_RESULTS;
  return {
    ok: true,
    searched: {
      items: merged.slice(0, q.limit),
      total: answers.reduce((sum, a) => sum + a.total, 0),
      nextPage: more ? q.page + 1 : null,
      incomplete: answers.some((a) => a.incomplete),
    },
    answered: answers.length,
    stopped,
  };
}

// How long to wait out a rate limit whose end is at most RETRY_WITHIN away, a second added; null for
// any other problem, or a limit with no known end ("try again in a minute").
function shortWait(problem: FetchProblem, now: number): number | null {
  const left = problem.reset && RATE_LIMITS.includes(problem.kind) ? Date.parse(problem.reset) - now : NaN;
  return left >= 0 && left <= RETRY_WITHIN ? left + 1000 : null;
}

function compareBy(sort: Sort): (a: Found, b: Found) => number {
  const value = (f: Found) => (sort === "stars" ? f.stars : sort === "forks" ? f.forks : sort === "best" ? f.score : Date.parse(f.updated_at) || 0);
  return (a, b) => value(b) - value(a) || a.name.localeCompare(b.name);
}

// Each journal's notes by id, with their Verdicts: a GitHub note's id is its lowercased PURL
// (spec §4). A journal that can't be used has none.
function journalNotes(context: Context): { journal: "personal" | "project"; notes: Map<string, { id: string; verdict: string | null }> }[] {
  return (["personal", "project"] as const).map((journal) => {
    const list = noteListDocument(journal, {}, context).document;
    return { journal, notes: new Map(list.notes.flatMap((n) => (n.id === null ? [] : [[n.id.toLowerCase(), { id: n.id, verdict: n.verdict || null }] as const]))) };
  });
}

// A note's "What it does", without its comments; null when it has none. Read only for a found note
// with no Verdict, so a search reads a few notes at most.
function whatItDoes(journal: "personal" | "project", id: string, context: Context): string | null {
  const note = noteDocument(journal, { id }, context).document;
  return stripComments(note.sections.find((s) => s.name === "What it does")?.body ?? "").trim() || null;
}

// A result for agent-facing output (decision 0032): GitHub's text and the note's Verdict cleaned
// and capped, with `truncated` when something was cut.
function resultForAgent(r: DiscoverResult): DiscoverResult {
  const capped = forAgent(r, { name: CAPS.name, url: CAPS.url, description: CAPS.other, topics: { each: CAPS.tag, count: CAPS.tags } });
  capped.in_journal = r.in_journal.map((entry) => {
    const { truncated, ...rest } = forAgent(entry, { id: CAPS.id, verdict: CAPS.verdict, what_it_does: CAPS.other });
    if (truncated) (capped.truncated ??= []).push(...truncated.map((field) => `in_journal.${field}`));
    return rest;
  });
  return capped;
}
