// GitHub metadata for a repository note (spec §2): read-only GET requests through an injected
// fetch, so tests run on recorded responses. No printing. The token is sent only in the
// Authorization header and never appears in a message.
import { resolveTarget, type Manifest, type PackageType } from "./identity.ts";
import { clean } from "./text.ts";
import { packageVersion } from "./version.ts";

export type Fetch = typeof globalThis.fetch;

export interface RepoMetadata {
  name: string; // owner/repo as GitHub writes it
  url: string;
  description: string | null;
  language: string | null;
  license: string; // SPDX id, or "unknown" (decision 0020)
  topics: string[];
  skills: string[] | null; // SKILL.md folder names; null when the file list couldn't be read
  skillFolders: number | null; // folders holding a SKILL.md, not inside a hidden folder (decision 0030); null likewise
  template: boolean; // GitHub's template flag
  packages: string[] | null; // PURLs from the root manifests; null when they couldn't be read
  plugin: boolean; // the root has .claude-plugin/plugin.json or marketplace.json
  bin: boolean; // the root package.json has "bin"
  // Decision 0046's signals, for the drafts only; none is written to a note.
  keywords?: string[]; // the root manifests' keywords (and Cargo's categories), as topics are spelled
  readme?: string | null; // the README's start, cleaned (readmeStart); null when there is none or it couldn't be read
  action?: boolean; // the root has action.yml or action.yaml: a GitHub Action
  rootFolders?: string[] | null; // the top-level folders, not hidden ones, for the kind's rule 10 (decision 0047); null likewise
}

export interface FetchProblem {
  kind: "offline" | "timeout" | "rate-limit" | "search-rate-limit" | "secondary-rate-limit" | "not-found" | "auth" | "invalid-query" | "http";
  message: string;
  reset?: string; // when a rate limit lets requests through again, ISO 8601 in UTC; only a time still ahead
}

// The rate limits' kinds: a search that has some answers keeps them when a later request meets one.
export const RATE_LIMITS: readonly FetchProblem["kind"][] = ["rate-limit", "search-rate-limit", "secondary-rate-limit"];

export type RepoResult = { ok: true; metadata: RepoMetadata; warnings: string[] } | { ok: false; problem: FetchProblem };

interface Options {
  fetch: Fetch;
  token?: string;
  timeoutMs?: number;
  now?: () => number; // milliseconds, for a rate limit's reset; default Date.now
}

const API = "https://api.github.com";
const MANIFESTS: readonly Manifest[] = ["package.json", "pyproject.toml", "Cargo.toml"];
const MANIFEST_TYPES: Record<Manifest, PackageType> = { "package.json": "npm", "pyproject.toml": "pypi", "Cargo.toml": "cargo" };

// Metadata for pkg:github/<owner>/<repo>. Fails only when the repository itself can't be read;
// a file list or manifest that can't be read leaves skills or packages null, a README that can't be
// read leaves readme null, each with a warning.
export async function fetchRepository(purl: string, options: Options): Promise<RepoResult> {
  const slug = purl.slice("pkg:github/".length);
  const repo = await get(`/repos/${slug}`, slug, options);
  if (!repo.ok) return repo;

  const info = JSON.parse(repo.text) as {
    full_name: string;
    html_url: string;
    description: string | null;
    language: string | null;
    license: { spdx_id?: string | null } | null;
    topics?: string[];
    default_branch: string;
    is_template?: boolean;
  };
  // The owner wrote these (decision 0032, rule 8): cleaned of control characters before any reaches a
  // note, and a URL that isn't https is replaced by the repository's own.
  const text = (value: unknown) => (typeof value === "string" ? clean(value).trim() : "");
  const spdx = text(info.license?.spdx_id);
  const htmlUrl = text(info.html_url);
  const metadata: RepoMetadata = {
    name: text(info.full_name) || slug,
    url: /^https:\/\//.test(htmlUrl) ? htmlUrl : `https://github.com/${slug}`,
    description: text(info.description) || null,
    language: text(info.language) || null,
    license: spdx && spdx !== "NOASSERTION" ? spdx : "unknown",
    topics: (info.topics ?? []).map(text).filter(Boolean),
    skills: null,
    skillFolders: null,
    template: info.is_template === true,
    packages: null,
    plugin: false,
    bin: false,
    keywords: [],
    readme: null,
    action: false,
    rootFolders: null,
  };
  const warnings: string[] = [];
  const ref = encodeURIComponent(info.default_branch);

  const readFiles = async () => {
    const tree = await get(`/repos/${slug}/git/trees/${ref}?recursive=1`, slug, options);
    if (!tree.ok) {
      warnings.push(`Couldn't read the file list: ${tree.problem.message} Skills and packages were not detected.`);
      return;
    }
    const listing = JSON.parse(tree.text) as { truncated?: boolean; tree?: { path: string; type: string }[] };
    const files = (listing.tree ?? []).filter((entry) => entry.type === "blob").map((entry) => entry.path);
    if (listing.truncated) warnings.push(`GitHub's file list for ${info.full_name} was cut short; some skills may be missing.`);
    metadata.skills = skillNames(files, info.full_name).map(text).filter(Boolean);
    metadata.skillFolders = countSkillFolders(files);
    metadata.plugin = files.includes(".claude-plugin/plugin.json") || files.includes(".claude-plugin/marketplace.json");
    metadata.action = files.includes("action.yml") || files.includes("action.yaml");
    metadata.rootFolders = rootFolders(files);

    const packages: string[] = [];
    const keywords: string[] = [];
    for (const file of MANIFESTS) {
      if (!files.includes(file)) continue;
      const manifest = await get(`/repos/${slug}/contents/${file}?ref=${ref}`, slug, options, true);
      if (!manifest.ok) {
        warnings.push(`Couldn't read ${file}: ${manifest.problem.message} Packages were not detected.`);
        return;
      }
      if (file === "package.json") metadata.bin = hasBin(manifest.text);
      const found = packageFromManifest(file, manifest.text);
      if (found) packages.push(found);
      keywords.push(...manifestKeywords(file, manifest.text));
    }
    metadata.packages = packages;
    metadata.keywords = [...new Set(keywords)].slice(0, KEYWORD_LIMIT);
  };
  await readFiles();

  // The README's start, for the drafts only (decision 0046). A repository without one answers 404.
  const readme = await get(`/repos/${slug}/readme`, slug, options, true);
  if (readme.ok) metadata.readme = readmeStart(readme.text) || null;
  else if (readme.problem.kind !== "not-found") warnings.push(`Couldn't read the README: ${readme.problem.message} The kind and domains come from the topics and files only.`);
  return { ok: true, metadata, warnings };
}

const KEYWORD_LIMIT = 20;
export const README_LIMIT = 3000;

// A manifest's keywords, spelled as GitHub topics are (lowercase, words joined by hyphens), cleaned:
// package.json "keywords", pyproject.toml [project] keywords, Cargo.toml [package] keywords and
// categories (a category's parts, "development-tools::testing", are each one). Words over 50
// characters are left out.
export function manifestKeywords(file: Manifest, text: string): string[] {
  let raw: unknown[] = [];
  if (file === "package.json") {
    try {
      const { keywords } = JSON.parse(text) as { keywords?: unknown };
      if (Array.isArray(keywords)) raw = keywords;
    } catch {
      return [];
    }
  } else if (file === "pyproject.toml") {
    raw = tomlList(text, "project", "keywords");
  } else {
    raw = [...tomlList(text, "package", "keywords"), ...tomlList(text, "package", "categories").flatMap((c) => c.split("::"))];
  }
  const words = raw
    .filter((k): k is string => typeof k === "string")
    .map((k) => clean(k).trim().toLowerCase().replace(/[\s_]+/g, "-"))
    .filter((k) => k !== "" && k.length <= 50);
  return [...new Set(words)];
}

// The HTML entities a README's text decodes, in one pass, so "&amp;lt;" stays "&lt;".
const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

// The start of a README as text: badges, images, HTML tags and comments, code blocks, link targets
// and reference definitions removed, links kept as their text; hidden characters become markers
// (decision 0032); the first README_LIMIT characters. Headings keep their #.
export function readmeStart(markdown: string): string {
  const text = markdown
    .slice(0, 200_000)
    .replace(/\r\n?/g, "\n")
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(^ {0,3}\1[^\n]*$|(?![\s\S]))/gm, "")
    .replace(/<!--[\s\S]*?(-->|$)/g, "")
    .replace(/!\[[^\]]*\](\([^)]*\)|\[[^\]]*\])/g, "")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/^ {0,3}\[[^\]]+\]:\s*\S+.*$/gm, "")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, "$2")
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_, entity: string) => ENTITIES[entity])
    .split("\n")
    .map((line) => clean(line).replace(/[ \t]+/g, " ").trim())
    .filter((line) => !/^[\s|:*_=-]*$/.test(line) || line === "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, README_LIMIT);
}

// The README's first heading's text and its first sentence, for the kind's last rule and a draft
// "What it does": the first line that isn't a heading, a row of links ("Docs | Discord"), a note
// ("[!IMPORTANT]") or shorter than 4 words, cut at the end of its sentence.
export function readmeOpening(readme: string): { heading: string | null; sentence: string | null } {
  const lines = readme.split("\n").filter((line) => line !== "");
  const heading = lines.find((line) => /^#{1,6}\s/.test(line))?.replace(/^#+\s*/, "").replace(/\s*#+$/, "") ?? null;
  const prose = (line: string) => !/^#{1,6}\s/.test(line) && !/\s[|·•]\s|^\[!/.test(line) && (line.match(/\p{L}+/gu) ?? []).length >= 4;
  const first = lines.find(prose) ?? null;
  const sentence = first?.replace(/^([-*+>]|\d+\.)\s+/, "").match(/^.*?[.!?](?=\s|$)|^.*$/)?.[0].trim().slice(0, 300) ?? null;
  return { heading: heading || null, sentence: sentence || null };
}

// The package a root manifest publishes, as a PURL, or null. Reads only the name: package.json
// "name" (not when "private"), pyproject.toml [project] name, Cargo.toml [package] name.
export function packageFromManifest(file: Manifest, text: string): string | null {
  let name: string | null = null;
  if (file === "package.json") {
    try {
      const json = JSON.parse(text) as { name?: unknown; private?: unknown };
      if (typeof json.name === "string" && json.private !== true) name = json.name;
    } catch {
      return null;
    }
  } else {
    name = tomlName(text, file === "pyproject.toml" ? "project" : "package");
  }
  if (!name) return null;
  const resolved = resolveTarget(name, { type: MANIFEST_TYPES[file] });
  return resolved.kind === "ok" ? resolved.purl : null;
}

export const TEMPLATE = ["template", "starter", "boilerplate"];
export const PLATFORM = ["paas", "baas", "backend-as-a-service", "low-code", "lowcode", "no-code", "nocode", "platform", "llmops"];
const APP = ["self-hosted", "webapp", "web-app", "desktop-app", "docker", "nextjs-app"];
export const SKILL_TOPICS = ["agent-skills", "claude-skills", "skills"];

// Rule 7a (decision 0047): topics that name a kind, each kept only when it fixed a kind on the eval.
const TOPIC_KINDS: [string, string][] =[["testing-framework", "framework"], ["ui-library", "library"], ["orm", "library"]];

// Rules 1 to 7a, which read only the topics (and the manifests' keywords, decision 0046), the name and
// the template flag, plus a GitHub Action's file when it is known (rule 3a, decision 0047): the first
// that matches, or null when only the rules on files could decide. Discover's estimated kind is this,
// with no Action file (decision 0045).
export function kindFromTopics(metadata: Pick<RepoMetadata, "name" | "topics" | "template" | "keywords" | "action">): string | null {
  const words = [...metadata.topics, ...(metadata.keywords ?? [])];
  const has = (topics: string[]) => words.some((topic) => topics.includes(topic));
  if (has(["awesome-list"])) return "awesome-list";
  if (metadata.template || has(TEMPLATE)) return "template";
  if (metadata.name.split("/").at(-1)?.toLowerCase().includes("skill")) return "skill-pack";
  if (metadata.action) return "other";
  if (has(PLATFORM)) return "platform";
  if (has(APP)) return "app";
  if (has(SKILL_TOPICS)) return "skill-pack";
  if (has(["framework"])) return "framework";
  return TOPIC_KINDS.find(([topic]) => has([topic]))?.[1] ?? null;
}

// The drafted kind (spec §2, decisions 0030 and 0047): the first rule that matches. The order and the
// reason for each place are in the decisions. The README's phrases (rule 8a) come before a package;
// its weakest rule (12) decides only what would be `other` (decision 0046).
export function draftKind(metadata: Pick<RepoMetadata, "name" | "topics" | "template" | "skillFolders" | "packages" | "plugin" | "bin" | "keywords" | "readme" | "action" | "rootFolders">): string {
  const fromTopics = kindFromTopics(metadata);
  if (fromTopics) return fromTopics;
  if (metadata.bin) return "cli";
  const phrase = metadata.readme ? readmePhraseKind(metadata.readme) : null;
  if (phrase) return phrase;
  if (metadata.packages?.length) return "library";
  if ((metadata.skillFolders ?? 0) >= 3 && skillsLayout(metadata.rootFolders)) return "skill-pack";
  if (metadata.plugin) return "plugin";
  return (metadata.readme && readmeKind(metadata.readme)) || "other";
}

// Rule 10's layout (decision 0047): the skills sit in a root skills/ folder, and no root folder holds
// code (src, packages, lib, apps). A library or framework that ships skills for its users has both.
const CODE_FOLDERS = ["src", "packages", "lib", "apps"];
function skillsLayout(rootFolders: string[] | null | undefined): boolean {
  return Boolean(rootFolders?.includes("skills") && !rootFolders.some((folder) => CODE_FOLDERS.includes(folder)));
}

// The top-level folders a file list shows, not hidden ones.
export function rootFolders(files: string[]): string[] {
  return [...new Set(files.filter((path) => path.includes("/")).map((path) => path.split("/")[0]))].filter((folder) => !folder.startsWith(".")).sort();
}

// Rule 8a (decision 0047): what the README's first heading or first sentence calls the repository,
// before a package decides. Each phrase was kept only when it fixed a kind on the eval and added no
// wrong one.
const README_PHRASES: [RegExp, string][] = [
  [/\bplatform for building\b/i, "platform"],
  [/\bdevelopment platform\b/i, "platform"],
  [/\ba framework for\b/i, "framework"],
  [/\btesting framework\b/i, "framework"],
  [/\bCSS framework\b/i, "framework"],
  [/\bJavaScript library\b/i, "library"],
  [/\bcomponent library\b/i, "library"],
];

export function readmePhraseKind(readme: string): string | null {
  const { heading, sentence } = readmeOpening(readme);
  const opening = `${heading ?? ""}\n${sentence ?? ""}`;
  return README_PHRASES.find(([pattern]) => pattern.test(opening))?.[1] ?? null;
}

// The weakest rule: what a README's first heading or first sentence calls the repository. An awesome
// list's title starts with "Awesome" (the awesome manifesto's rule), so that heading counts too.
const README_KINDS: [RegExp, string][] = [
  [/\bawesome[\s-]list\b/i, "awesome-list"],
  [/\bstarter[\s-]template\b/i, "template"],
  [/\bCLI\b|\bcommand[\s-]line tool\b/i, "cli"],
];

export function readmeKind(readme: string): string | null {
  const { heading, sentence } = readmeOpening(readme);
  if (heading && /^awesome\s/i.test(heading)) return "awesome-list";
  const opening = `${heading ?? ""}\n${sentence ?? ""}`;
  return README_KINDS.find(([pattern]) => pattern.test(opening))?.[1] ?? null;
}

// The folders that hold a SKILL.md (the root counts as one), not inside a hidden folder: skills in
// .agents/, .claude/ or .cursor/ help develop the repository; they aren't what it offers.
export function countSkillFolders(files: string[]): number {
  const folders = files
    .filter((path) => path === "SKILL.md" || path.endsWith("/SKILL.md"))
    .map((path) => path.split("/").slice(0, -1))
    .filter((parts) => !parts.some((part) => part.startsWith(".")))
    .map((parts) => parts.join("/"));
  return new Set(folders).size;
}

export type Got = { ok: true; text: string } | { ok: false; problem: FetchProblem };

// One read-only GET to GitHub's API, with the timeout, the User-Agent and the token. `slug` names the
// repository in a 404's message. Also Discover's search request (decision 0045).
export async function get(path: string, slug: string, options: Options, raw = false): Promise<Got> {
  const { fetch, token, timeoutMs = 10_000, now = Date.now } = options;
  const headers: Record<string, string> = {
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `repomagpie/${packageVersion()}`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  // A ref'd timer, cleared in finally: it keeps the process alive while a request hangs
  // (AbortSignal.timeout's timer is unref'd, so the event loop could empty first).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("GitHub didn't answer in time.", "TimeoutError")), timeoutMs);
  try {
    const response = await fetch(API + path, { method: "GET", headers, signal: controller.signal });
    if (response.ok) return { ok: true, text: await response.text() };
    const body = [403, 422, 429].includes(response.status) ? await response.text().catch(() => "") : "";
    return { ok: false, problem: statusProblem(response, slug, Boolean(token), body, now()) };
  } catch (error) {
    const { name, cause } = error as Error & { cause?: { code?: string } };
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, problem: { kind: "timeout", message: `GitHub didn't answer within ${timeoutMs / 1000} seconds.` } };
    }
    const code = cause?.code ? ` (${cause.code})` : "";
    return { ok: false, problem: { kind: "offline", message: `Can't reach GitHub${code}. Check your connection.` } };
  } finally {
    clearTimeout(timer);
  }
}

function statusProblem(response: Response, slug: string, hasToken: boolean, body: string, now: number): FetchProblem {
  const { status, headers } = response;
  // GitHub's rules ("Rate limits for the REST API", checked 2026-10-27): a primary limit is a 403 or
  // 429 with x-ratelimit-remaining 0, over until x-ratelimit-reset; a secondary one is a 403 or 429
  // whose message says so. Either way retry-after, when present, says how many seconds to wait, and
  // comes first; with neither, wait at least a minute. x-ratelimit-reset is read only when the
  // remaining count is 0: on a secondary limit it is the primary window's, and can be past.
  const primary = (status === 403 || status === 429) && headers.get("x-ratelimit-remaining") === "0";
  const secondary = !primary && (status === 429 || (status === 403 && (headers.has("retry-after") || /secondary rate limit/i.test(body))));
  if (primary || secondary) {
    const retry = Number(headers.get("retry-after"));
    const resetAt = primary ? Number(headers.get("x-ratelimit-reset")) * 1000 : NaN;
    const at = retry > 0 ? now + retry * 1000 : resetAt > now ? resetAt : null;
    // Never a time already past: "in a minute" then, as GitHub's docs say to wait. A wait of up to 2
    // minutes is said in seconds: the search limit's reset is usually under a minute away, and a
    // clock time cut to the minute (15:34 for 15:34:08) reads as past within the minute.
    const seconds = at === null ? null : Math.max(1, Math.ceil((at - now) / 1000));
    const when = seconds !== null && seconds <= 120 ? `try again in ${seconds} second${seconds === 1 ? "" : "s"}` : at ? `until ${new Date(at).toISOString().slice(11, 16)} UTC` : "try again in a minute";
    const reset = at ? { reset: new Date(at).toISOString() } : {};
    const used = (what: string) => (when.startsWith("until") ? `${what} is used up ${when}.` : `${what} is used up; ${when}.`);
    if (secondary) {
      return { kind: "secondary-rate-limit", message: `GitHub's secondary rate limit stopped the request (too many requests too fast); ${when.startsWith("until") ? `wait ${when}` : when}.`, ...reset };
    }
    // GitHub counts searches apart from its other requests: 10 a minute without a token, 30 with one
    // (docs.github.com, "Search", Rate limit; checked 2026-10-27). Without a token the 10 are counted
    // by the public IP address ("API rate limit exceeded for <address>"), so everything else behind
    // the same address spends them too: on 2026-10-27 the first search of a minute met the limit
    // (x-ratelimit-used 10) while /rate_limit showed none used (decision 0045). The message can't say
    // the user used them up.
    if (headers.get("x-ratelimit-resource") === "search") {
      const raise = hasToken ? "" : " Without a token, GitHub counts 10 searches a minute for your public IP address, shared with every other program and device that uses it, so other searches can use them up. Set GITHUB_TOKEN for 30 a minute of your own.";
      return { kind: "search-rate-limit", message: `${used("GitHub's search limit")}${raise}`, ...reset };
    }
    return { kind: "rate-limit", message: `${used("GitHub's rate limit")}${hasToken ? "" : " Set GITHUB_TOKEN to raise the limit."}`, ...reset };
  }
  if (status === 401) return { kind: "auth", message: "GitHub rejected the request (401): GITHUB_TOKEN may be invalid or expired. Check it, or unset it to use GitHub without a token." };
  if (status === 404) {
    return { kind: "not-found", message: `GitHub has no repository ${slug}, or it is private${hasToken ? " and GITHUB_TOKEN can't see it" : ""}.` };
  }
  if (status === 422) return { kind: "invalid-query", message: `GitHub refused the query (422)${validationDetail(body)}.` };
  return { kind: "http", message: `GitHub answered ${status}.` };
}

// GitHub's own reason for a 422, from its answer ("errors": [{"message": …}]), cleaned and cut: the
// text comes from GitHub, not from us.
function validationDetail(body: string): string {
  try {
    const { errors, message } = JSON.parse(body) as { errors?: { message?: unknown }[]; message?: unknown };
    const detail = [errors?.[0]?.message, message].find((m): m is string => typeof m === "string" && m.trim() !== "");
    return detail ? `: ${clean(detail).trim().slice(0, 300).replace(/\.$/, "")}` : "";
  } catch {
    return "";
  }
}

// One name per SKILL.md: the folder that holds it; a root SKILL.md takes the repository's name.
function skillNames(files: string[], fullName: string): string[] {
  const names = files
    .filter((path) => path === "SKILL.md" || path.endsWith("/SKILL.md"))
    .map((path) => path.split("/").at(-2) ?? fullName.split("/")[1]);
  return [...new Set(names)].sort();
}

function hasBin(text: string): boolean {
  try {
    const { bin } = JSON.parse(text) as { bin?: unknown };
    return typeof bin === "string" ? bin !== "" : typeof bin === "object" && bin !== null && Object.keys(bin).length > 0;
  } catch {
    return false;
  }
}

// The strings of a `key = [...]` array in a TOML table, which may span lines (no TOML library).
function tomlList(text: string, table: string, key: string): string[] {
  let inTable = false;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].match(/^\s*\[(\[)?\s*([^\]]*?)\s*\]/);
    if (header) {
      inTable = !header[1] && header[2] === table;
      continue;
    }
    if (!inTable || !new RegExp(`^\\s*${key}\\s*=\\s*\\[`).test(lines[i])) continue;
    let array = lines[i].slice(lines[i].indexOf("[") + 1);
    while (!/\]/.test(array.replace(/(["'])(?:(?!\1).)*\1/g, "")) && i + 1 < lines.length) array += `\n${lines[++i]}`;
    return [...array.matchAll(/(["'])((?:(?!\1)[^\n])*)\1/g)].map((m) => m[2]);
  }
  return [];
}

// The name = "..." line of a TOML table, read line by line (no TOML library).
function tomlName(text: string, table: string): string | null {
  let inTable = false;
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\s*\[(\[)?\s*([^\]]*?)\s*\]/);
    if (header) {
      inTable = !header[1] && header[2] === table;
      continue;
    }
    const name = inTable ? line.match(/^\s*name\s*=\s*(["'])([^"']*)\1\s*(#.*)?$/) : null;
    if (name) return name[2];
  }
  return null;
}
