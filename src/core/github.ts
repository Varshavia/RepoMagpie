// GitHub metadata for a repository note (spec §2): read-only GET requests through an injected
// fetch, so tests run on recorded responses. No printing. The token is sent only in the
// Authorization header and never appears in a message.
import { resolveTarget, type Manifest, type PackageType } from "./identity.ts";
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
}

export interface FetchProblem {
  kind: "offline" | "timeout" | "rate-limit" | "not-found" | "auth" | "http";
  message: string;
}

export type RepoResult = { ok: true; metadata: RepoMetadata; warnings: string[] } | { ok: false; problem: FetchProblem };

interface Options {
  fetch: Fetch;
  token?: string;
  timeoutMs?: number;
}

const API = "https://api.github.com";
const MANIFESTS: readonly Manifest[] = ["package.json", "pyproject.toml", "Cargo.toml"];
const MANIFEST_TYPES: Record<Manifest, PackageType> = { "package.json": "npm", "pyproject.toml": "pypi", "Cargo.toml": "cargo" };

// Metadata for pkg:github/<owner>/<repo>. Fails only when the repository itself can't be read;
// a file list or manifest that can't be read leaves skills or packages null, with a warning.
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
  const spdx = info.license?.spdx_id;
  const metadata: RepoMetadata = {
    name: info.full_name,
    url: info.html_url,
    description: info.description || null,
    language: info.language ?? null,
    license: spdx && spdx !== "NOASSERTION" ? spdx : "unknown",
    topics: info.topics ?? [],
    skills: null,
    skillFolders: null,
    template: info.is_template === true,
    packages: null,
    plugin: false,
    bin: false,
  };
  const warnings: string[] = [];
  const ref = encodeURIComponent(info.default_branch);

  const tree = await get(`/repos/${slug}/git/trees/${ref}?recursive=1`, slug, options);
  if (!tree.ok) {
    warnings.push(`Couldn't read the file list: ${tree.problem.message} Skills and packages were not detected.`);
    return { ok: true, metadata, warnings };
  }
  const listing = JSON.parse(tree.text) as { truncated?: boolean; tree?: { path: string; type: string }[] };
  const files = (listing.tree ?? []).filter((entry) => entry.type === "blob").map((entry) => entry.path);
  if (listing.truncated) warnings.push(`GitHub's file list for ${info.full_name} was cut short; some skills may be missing.`);
  metadata.skills = skillNames(files, info.full_name);
  metadata.skillFolders = countSkillFolders(files);
  metadata.plugin = files.includes(".claude-plugin/plugin.json") || files.includes(".claude-plugin/marketplace.json");

  const packages: string[] = [];
  for (const file of MANIFESTS) {
    if (!files.includes(file)) continue;
    const manifest = await get(`/repos/${slug}/contents/${file}?ref=${ref}`, slug, options, true);
    if (!manifest.ok) {
      warnings.push(`Couldn't read ${file}: ${manifest.problem.message} Packages were not detected.`);
      return { ok: true, metadata, warnings };
    }
    if (file === "package.json") metadata.bin = hasBin(manifest.text);
    const found = packageFromManifest(file, manifest.text);
    if (found) packages.push(found);
  }
  metadata.packages = packages;
  return { ok: true, metadata, warnings };
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

const TEMPLATE = ["template", "starter", "boilerplate"];
const PLATFORM = ["paas", "baas", "backend-as-a-service", "low-code", "lowcode", "no-code", "nocode", "platform", "llmops"];
const APP = ["self-hosted", "webapp", "web-app", "desktop-app", "docker", "nextjs-app"];
const SKILL_TOPICS = ["agent-skills", "claude-skills", "skills"];

// The drafted kind (spec §2, decision 0030): the first rule that matches. The order and the reason
// for each place are in the decision.
export function draftKind(metadata: Pick<RepoMetadata, "name" | "topics" | "template" | "skillFolders" | "packages" | "plugin" | "bin">): string {
  const has = (topics: string[]) => metadata.topics.some((topic) => topics.includes(topic));
  if (has(["awesome-list"])) return "awesome-list";
  if (metadata.template || has(TEMPLATE)) return "template";
  if (metadata.name.split("/").at(-1)?.toLowerCase().includes("skill")) return "skill-pack";
  if (has(PLATFORM)) return "platform";
  if (has(APP)) return "app";
  if (has(SKILL_TOPICS)) return "skill-pack";
  if (has(["framework"])) return "framework";
  if (metadata.bin) return "cli";
  if (metadata.packages?.length) return "library";
  if ((metadata.skillFolders ?? 0) >= 3) return "skill-pack";
  if (metadata.plugin) return "plugin";
  return "other";
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

type Got = { ok: true; text: string } | { ok: false; problem: FetchProblem };

async function get(path: string, slug: string, options: Options, raw = false): Promise<Got> {
  const { fetch, token, timeoutMs = 10_000 } = options;
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
    return { ok: false, problem: statusProblem(response, slug, Boolean(token)) };
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

function statusProblem(response: Response, slug: string, hasToken: boolean): FetchProblem {
  const { status, headers } = response;
  if (status === 429 || (status === 403 && (headers.get("x-ratelimit-remaining") === "0" || headers.has("retry-after")))) {
    const reset = Number(headers.get("x-ratelimit-reset"));
    const retry = Number(headers.get("retry-after"));
    const until = reset ? `until ${new Date(reset * 1000).toISOString().slice(11, 16)} UTC` : retry ? `for ${retry} seconds` : "for now";
    return { kind: "rate-limit", message: `GitHub's rate limit is used up ${until}.${hasToken ? "" : " Set GITHUB_TOKEN to raise the limit."}` };
  }
  if (status === 401) return { kind: "auth", message: "GitHub rejected the request (401): GITHUB_TOKEN may be invalid or expired. Check it, or unset it to use GitHub without a token." };
  if (status === 404) {
    return { kind: "not-found", message: `GitHub has no repository ${slug}, or it is private${hasToken ? " and GITHUB_TOKEN can't see it" : ""}.` };
  }
  return { kind: "http", message: `GitHub answered ${status}.` };
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
