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

// The drafted kind (spec §2): the first that matches.
export function draftKind(metadata: Pick<RepoMetadata, "plugin" | "skills" | "bin" | "topics">): string {
  if (metadata.plugin) return "plugin";
  if (metadata.skills?.length) return "skill-pack";
  if (metadata.bin) return "cli";
  if (metadata.topics.includes("awesome-list")) return "awesome-list";
  return "other";
}

// The drafted tags: topics that are already in the journal's tag list (schema rule 5).
export function draftTags(topics: string[], tagList: string[]): string[] {
  return [...new Set(topics.filter((topic) => tagList.includes(topic)))].sort();
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
  try {
    const response = await fetch(API + path, { method: "GET", headers, signal: AbortSignal.timeout(timeoutMs) });
    if (response.ok) return { ok: true, text: await response.text() };
    return { ok: false, problem: statusProblem(response, slug, Boolean(token)) };
  } catch (error) {
    const { name, cause } = error as Error & { cause?: { code?: string } };
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, problem: { kind: "timeout", message: `GitHub didn't answer within ${timeoutMs / 1000} seconds.` } };
    }
    const code = cause?.code ? ` (${cause.code})` : "";
    return { ok: false, problem: { kind: "offline", message: `Can't reach GitHub${code}. Check your connection.` } };
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
  if (status === 401) return { kind: "auth", message: "GitHub rejected GITHUB_TOKEN (401). Check it, or unset it to use GitHub without a token." };
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
