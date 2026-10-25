// Where the journals are and what they hold: spec section 3, decision 0016.
// Uses the file system; never prints. Home, environment and working directory are passed in.
import { existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Manifest } from "./identity.ts";
import { readNote, YAML_LIMITS } from "./note.ts";
import { assertWritable, linkProblem, noteSignature, readableJournalFile, skip } from "./note-cache.ts";
import { aliasMap, parseAliasLines } from "./tag-aliases.ts";

export type Env = Record<string, string | undefined>;

// What finding the journals needs: the home directory, the environment, the working directory, and
// the --home and --project flags.
export interface Place {
  home: string;
  env: Env;
  cwd: string;
  homeFlag?: string;
  projectFlag?: string;
}

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
    config = parseYaml(readFileSync(file, "utf8"), YAML_LIMITS);
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
// root. It never takes the personal journal's folder, nor the home directory's own .magpie. A .magpie
// that is a link is never a project journal (decision 0032, rule 5): the repository chose where it
// points. It is skipped for the report.
export function findProjectJournal(options: { cwd: string; home: string; personalJournal: string; flag?: string }): string | null {
  const { cwd, home, personalJournal, flag } = options;
  if (flag) {
    const path = flagJournal(cwd, flag);
    return isLink(path) ? (skip(linkProblem(path)), null) : path;
  }
  const personal = comparable(personalJournal);
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (samePath(dir, home)) return null;
    const candidate = join(dir, ".magpie");
    if (comparable(candidate) === personal) {
      // The personal journal's folder, which may be a link the user made: never the project journal.
    } else if (isLink(candidate)) skip(linkProblem(candidate));
    else if (isDirectory(candidate)) return candidate;
    if (existsSync(join(dir, ".git")) || dirname(dir) === dir) return null;
  }
}

// The project journal --project names: the project root's .magpie, or the .magpie folder itself.
export function flagJournal(cwd: string, flag: string): string {
  const path = resolve(cwd, flag);
  return basename(path) === ".magpie" ? path : join(path, ".magpie");
}

export function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
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
  return findManifestFolder(cwd)?.manifests ?? [];
}

// The closest folder that has any manifest, walking up to the git root, and its manifests.
export function findManifestFolder(cwd: string): { folder: string; manifests: Manifest[] } | null {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const found = MANIFESTS.filter((manifest) => existsSync(join(dir, manifest)));
    if (found.length) return { folder: dir, manifests: found };
    if (existsSync(join(dir, ".git")) || dirname(dir) === dir) return null;
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
// .cache/ and .trash/ (decision 0037). A journal created now (no notes/ yet) also gets the starter tag list, unless it has a
// tags.md. Existing files are never overwritten. Returns true when the journal folder was created.
// Never writes through a link (decision 0032, rule 5): a project journal that is a link, or a link
// at notes/, tags.md or .gitignore, throws.
export function createJournal(path: string, scope: "personal" | "project"): boolean {
  if (scope === "project" && isLink(path)) throw new Error(`Won't write to ${path}: ${linkProblem(path).message}.`);
  const created = !existsSync(path);
  const notes = join(path, "notes");
  const tags = join(path, "tags.md");
  const ignore = join(path, ".gitignore");
  for (const file of [notes, tags, ignore]) assertWritable(path, file, false);
  const isNew = !existsSync(notes);
  mkdirSync(notes, { recursive: true });
  if (isNew && !existsSync(tags)) writeFileSync(tags, STARTER_TAGS);
  if (scope === "project" && !existsSync(ignore)) writeFileSync(ignore, ".cache/\n.trash/\n");
  return created;
}

// The tag list to draft tags from: tags.md; for a journal not created yet, the starter list it
// will get; otherwise none.
export function journalTagList(path: string): string[] {
  if (lstatExists(join(path, "tags.md"))) return readTagList(path);
  return existsSync(join(path, "notes")) ? [] : parseTagList(STARTER_TAGS);
}

// Whether something is at the path, without following a link.
function lstatExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export interface NoteEntry {
  path: string;
  id: string | undefined; // undefined when the frontmatter has no readable id
  packages: string[];
  carries: string[]; // its topics and tags, for ranking another note's topics (decision 0030)
  text?: string; // set by a dry run: the text that would have been written
}

// Every note in <journal>/notes/ with its id, packages, topics and tags; links and files over the
// size limit are left out (noteSignature).
export function listNotes(journal: string): NoteEntry[] {
  const folder = join(journal, "notes");
  if (!isDirectory(folder)) return [];
  return noteSignature(journal).files
    .map((name) => {
      const path = join(folder, name);
      const { frontmatter } = readNote(readFileSync(path, "utf8"));
      return { path, id: typeof frontmatter.id === "string" ? frontmatter.id : undefined, packages: texts(frontmatter.packages), carries: carried(frontmatter) };
    });
}

// A note's topics and tags.
export function carried(frontmatter: Record<string, unknown>): string[] {
  return [...new Set([...texts(frontmatter.topics), ...texts(frontmatter.tags)])];
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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

// Appends the tags that tags.md doesn't list yet, in order, as "- `tag`", with the file's own line
// endings; the rest of the file stays byte for byte. Without tags.md, writes one with a "# Tags"
// heading and just these tags (decision 0030). Returns the tags appended; throws if it can't write.
export function appendTags(journal: string, tags: readonly string[]): string[] {
  const file = join(journal, "tags.md");
  if (!tags.length) return [];
  assertWritable(journal, file); // never through a link, nor to a file over the size limit
  const text = existsSync(file) ? readFileSync(file, "utf8") : null;
  const listed = text === null ? [] : parseTagList(text);
  const added = [...new Set(tags)].filter((tag) => !listed.includes(tag));
  if (!added.length) return [];
  const eol = text?.includes("\r\n") ? "\r\n" : "\n";
  const start = text === null ? `# Tags${eol}${eol}` : text === "" || text.endsWith("\n") ? text : text + eol;
  writeFileSync(file, start + added.map((tag) => `- \`${tag}\`${eol}`).join(""));
  return added;
}

// The journal's tag list, <journal>/tags.md; empty when there is none, or when it is a link or over
// the size limit (skipped for the report).
export function readTagList(journal: string): string[] {
  const file = readableJournalFile(journal, join(journal, "tags.md"));
  return file ? parseTagList(readFileSync(file, "utf8")) : [];
}

// The journal's tag aliases (alias → canonical tag): the starter list, with tags.md's own lines
// winning over it (tag-aliases.ts). A journal without a readable tags.md gets the starter list.
export function journalAliases(journal: string): Map<string, string> {
  const file = lstatExists(join(journal, "tags.md")) ? readableJournalFile(journal, join(journal, "tags.md")) : null;
  const text = file ? readFileSync(file, "utf8") : "";
  return aliasMap(parseTagList(text), parseAliasLines(text));
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
