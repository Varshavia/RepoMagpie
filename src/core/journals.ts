// Where the journals are and what they hold: spec section 3, decision 0016.
// Uses the file system; never prints. Home, environment and working directory are passed in.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Manifest } from "./identity.ts";
import { readNote } from "./note.ts";

export type Env = Record<string, string | undefined>;

export interface PersonalJournal {
  path: string;
  source: "flag" | "env" | "config" | "default";
  warnings: string[];
}

// The config file never moves, even when MAGPIE_HOME points elsewhere.
export function configPath(home: string): string {
  return join(home, ".magpie", "config.yaml");
}

// --home > MAGPIE_HOME > personal_journal in the config file > <home>/.magpie
export function resolvePersonalJournal(options: { home: string; env: Env; cwd: string; flag?: string }): PersonalJournal {
  const { home, env, cwd, flag } = options;
  if (flag) return { path: resolve(cwd, flag), source: "flag", warnings: [] };
  if (env.MAGPIE_HOME) return { path: resolve(cwd, env.MAGPIE_HOME), source: "env", warnings: [] };

  const fallback = { path: join(home, ".magpie"), source: "default" as const };
  const file = configPath(home);
  if (!existsSync(file)) return { ...fallback, warnings: [] };

  let config: unknown;
  try {
    config = parseYaml(readFileSync(file, "utf8"));
  } catch (error) {
    return { ...fallback, warnings: [`Ignoring ${file}: ${(error as Error).message.split("\n")[0]}`] };
  }
  const value = (config as { personal_journal?: unknown } | null)?.personal_journal;
  if (value === undefined || value === null || value === "") return { ...fallback, warnings: [] };
  if (typeof value !== "string") return { ...fallback, warnings: [`Ignoring personal_journal in ${file}: it must be a path`] };

  // "~" means the home directory; any other relative path is relative to the config file's folder.
  const expanded = value === "~" || /^~[\\/]/.test(value) ? join(home, value.slice(1)) : value;
  return { path: resolve(dirname(file), expanded), source: "config", warnings: [] };
}

// --project, or the first .magpie/ folder walking up from the working directory.
// --project names the project root, like git -C; a path to the .magpie folder itself also works.
// The walk stops at the git root (a folder containing .git) or the filesystem root,
// and never takes the personal journal's folder.
export function findProjectJournal(options: { cwd: string; personalJournal: string; flag?: string }): string | null {
  const { cwd, personalJournal, flag } = options;
  if (flag) {
    const path = resolve(cwd, flag);
    return basename(path) === ".magpie" ? path : join(path, ".magpie");
  }
  const personal = comparable(personalJournal);
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const candidate = join(dir, ".magpie");
    if (isDirectory(candidate) && comparable(candidate) !== personal) return candidate;
    if (existsSync(join(dir, ".git")) || dirname(dir) === dir) return null;
  }
}

// The nearest folder with .git, walking up; outside git, the working directory itself.
export function findProjectRoot(cwd: string): string {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return resolve(cwd);
  }
}

const MANIFESTS: readonly Manifest[] = ["package.json", "pyproject.toml", "Cargo.toml"];

// The manifests in the closest folder that has any, walking up to the git root (spec §4).
export function findManifests(cwd: string): Manifest[] {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const found = MANIFESTS.filter((manifest) => existsSync(join(dir, manifest)));
    if (found.length) return found;
    if (existsSync(join(dir, ".git")) || dirname(dir) === dir) return [];
  }
}

// Creates a project journal folder with a .gitignore for .cache/ (spec §3). Returns false
// when the folder already existed; an existing .gitignore is kept.
export function createProjectJournal(path: string): boolean {
  const created = !existsSync(path);
  mkdirSync(path, { recursive: true });
  const ignore = join(path, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, ".cache/\n");
  return created;
}

export interface NoteEntry {
  path: string;
  id: string | undefined; // undefined when the frontmatter has no readable id
  packages: string[];
}

// Every note in <journal>/notes/ with its id and packages.
export function listNotes(journal: string): NoteEntry[] {
  const folder = join(journal, "notes");
  if (!isDirectory(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const path = join(folder, name);
      const { frontmatter } = readNote(readFileSync(path, "utf8"));
      const packages = Array.isArray(frontmatter.packages) ? frontmatter.packages.filter((p): p is string => typeof p === "string") : [];
      return { path, id: typeof frontmatter.id === "string" ? frontmatter.id : undefined, packages };
    });
}

// The note whose id or packages has this PURL (schema rule 6).
export function noteFor(notes: NoteEntry[], purl: string): NoteEntry | undefined {
  return notes.find((entry) => entry.id === purl) ?? notes.find((entry) => entry.packages.includes(purl));
}

// Tags from a tag list: one list line per tag, "- `tag`", optionally followed by " — meaning".
export function parseTagList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+`?([a-z0-9]+(?:-[a-z0-9]+)*)`?(?:\s|$)/)?.[1])
    .filter((tag): tag is string => tag !== undefined);
}

// The journal's tag list, <journal>/tags.md; empty when there is none.
export function readTagList(journal: string): string[] {
  const file = join(journal, "tags.md");
  return existsSync(file) ? parseTagList(readFileSync(file, "utf8")) : [];
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// Paths compare case-insensitively on Windows.
function comparable(path: string): string {
  const full = resolve(path);
  return process.platform === "win32" ? full.toLowerCase() : full;
}
