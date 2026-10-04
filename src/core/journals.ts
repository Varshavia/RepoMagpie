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
// The walk stops at the git root (a folder containing .git), the home directory or the filesystem
// root. It never takes the personal journal's folder, nor the home directory's own .magpie.
export function findProjectJournal(options: { cwd: string; home: string; personalJournal: string; flag?: string }): string | null {
  const { cwd, home, personalJournal, flag } = options;
  if (flag) {
    const path = resolve(cwd, flag);
    return basename(path) === ".magpie" ? path : join(path, ".magpie");
  }
  const personal = comparable(personalJournal);
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (samePath(dir, home)) return null;
    const candidate = join(dir, ".magpie");
    if (isDirectory(candidate) && comparable(candidate) !== personal) return candidate;
    if (existsSync(join(dir, ".git")) || dirname(dir) === dir) return null;
  }
}

// The nearest folder with .git, walking up; outside git, the working directory itself.
// The walk stops at the home directory: a git repository at home (dotfiles) is not a project.
export function findProjectRoot(cwd: string, home: string): string {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (samePath(dir, home)) return resolve(cwd);
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return resolve(cwd);
  }
}

// The home directory's own .magpie, which is reserved for the default personal journal.
export function homeJournal(home: string): string {
  return join(home, ".magpie");
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

// The tag list a new journal starts with: the example vault's ten tags (examples/vault/tags.md;
// a test keeps the two in step).
export const STARTER_TAGS = `# Tags

The tag list for this journal. Use only these tags in notes; add a line here before using a new one. Tags are lowercase kebab-case.

- \`agent-skills\` — repositories whose main content is agent skills
- \`browser-automation\` — driving a browser from code or an agent
- \`code-understanding\` — making sense of an unfamiliar codebase
- \`coding-guidelines\` — rules that shape how an agent writes code
- \`data-engineering\` — data pipelines, lakehouses, streaming
- \`design\` — visual design and design systems
- \`frontend\` — building web user interfaces
- \`react\` — React and Next.js
- \`testing\` — tests and end-to-end checks
- \`workflow\` — engineering workflow: specs, TDD, code review
`;

// Prepares a journal for a note (spec §3): notes/, and for a project journal a .gitignore for
// .cache/. A journal created now (no notes/ yet) also gets the starter tag list, unless it has a
// tags.md. Existing files are never overwritten. Returns true when the journal folder was created.
export function createJournal(path: string, scope: "personal" | "project"): boolean {
  const created = !existsSync(path);
  const notes = join(path, "notes");
  const isNew = !existsSync(notes);
  mkdirSync(notes, { recursive: true });
  const tags = join(path, "tags.md");
  if (isNew && !existsSync(tags)) writeFileSync(tags, STARTER_TAGS);
  const ignore = join(path, ".gitignore");
  if (scope === "project" && !existsSync(ignore)) writeFileSync(ignore, ".cache/\n");
  return created;
}

// The tag list to draft tags from: tags.md; for a journal not created yet, the starter list it
// will get; otherwise none.
export function journalTagList(path: string): string[] {
  if (existsSync(join(path, "tags.md"))) return readTagList(path);
  return existsSync(join(path, "notes")) ? [] : parseTagList(STARTER_TAGS);
}

export interface NoteEntry {
  path: string;
  id: string | undefined; // undefined when the frontmatter has no readable id
  packages: string[];
  text?: string; // set by a dry run: the text that would have been written
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

// Whether two paths name the same folder; case-insensitive on Windows.
export function samePath(a: string, b: string): boolean {
  return comparable(a) === comparable(b);
}

// Paths compare case-insensitively on Windows.
function comparable(path: string): string {
  const full = resolve(path);
  return process.platform === "win32" ? full.toLowerCase() : full;
}
