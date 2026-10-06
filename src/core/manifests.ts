// What a project says about itself, for suggest (spec §2, §5): the dependencies, keywords and
// descriptions in its manifests (package.json, pyproject.toml, Cargo.toml), and the README's first
// heading and paragraph. Manifests are found as note finds them (journals.ts findManifestFolder).
// TOML is read line by line, enough for these keys; no TOML library. Reads files; never prints.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizePackage, type Manifest, type PackageType } from "./identity.ts";
import { findManifestFolder, findProjectRoot } from "./journals.ts";

export interface Dependency {
  type: PackageType;
  name: string; // as the registry knows it, without a version: "@playwright/cli", "requests"
}

export interface ManifestText {
  dependencies: string[];
  keywords: string[];
  description: string;
}

export interface ProjectText {
  folder: string; // the folder with the manifests; without any, the project root
  manifests: Manifest[];
  dependencies: Dependency[]; // each once
  keywords: string[]; // the manifests' keywords lists
  texts: string[]; // the manifests' descriptions, then the README's first heading and paragraph
}

const PARSERS: Record<Manifest, { type: PackageType; parse: (text: string) => ManifestText }> = {
  "package.json": { type: "npm", parse: parsePackageJson },
  "pyproject.toml": { type: "pypi", parse: parsePyproject },
  "Cargo.toml": { type: "cargo", parse: parseCargoToml },
};

export function readProject(cwd: string, home: string): ProjectText {
  const found = findManifestFolder(cwd);
  const folder = found?.folder ?? findProjectRoot(cwd, home);
  const manifests = found?.manifests ?? [];
  const dependencies: Dependency[] = [];
  const keywords: string[] = [];
  const texts: string[] = [];
  for (const manifest of manifests) {
    const { type, parse } = PARSERS[manifest];
    let text: string;
    try {
      text = readFileSync(join(folder, manifest), "utf8");
    } catch {
      continue;
    }
    const read = parse(text);
    for (const name of read.dependencies) {
      if (!dependencies.some((d) => d.type === type && d.name === name)) dependencies.push({ type, name });
    }
    keywords.push(...read.keywords);
    if (read.description) texts.push(read.description);
  }
  const readme = readmeFile(folder);
  if (readme) {
    const intro = readmeIntro(readFileSync(join(folder, readme), "utf8"));
    if (intro) texts.push(intro);
  }
  return { folder, manifests, dependencies, keywords, texts };
}

export function parsePackageJson(text: string): ManifestText {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { dependencies: [], keywords: [], description: "" };
  }
  const object = (value: unknown) => (typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : []);
  return {
    dependencies: ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((field) => object(json?.[field])),
    keywords: Array.isArray(json?.keywords) ? json.keywords.filter((k): k is string => typeof k === "string") : [],
    description: typeof json?.description === "string" ? json.description : "",
  };
}

// [project] dependencies and optional-dependencies (PEP 621), [dependency-groups] (PEP 735), and
// Poetry's dependency tables (their keys; python is not a package).
export function parsePyproject(text: string): ManifestText {
  const tables = tomlTables(text);
  const project = tables.get("project") ?? [];
  const requirements = (value: string) => strings(value.replace(/\{[^}]*\}/g, "")).map((spec) => normalizePackage(spec, "pypi")).filter(Boolean);
  const dependencies: string[] = [];
  for (const [table, entries] of tables) {
    if (table === "project") dependencies.push(...entries.filter(([key]) => key === "dependencies").flatMap(([, value]) => requirements(value)));
    else if (table === "project.optional-dependencies" || table === "dependency-groups") dependencies.push(...entries.flatMap(([, value]) => requirements(value)));
    else if (/^tool\.poetry\.(?:(?:dev-)?dependencies|group\.[^.]+\.dependencies)$/.test(table)) {
      dependencies.push(...entries.map(([key]) => key).filter((key) => key !== "python"));
    }
  }
  return { dependencies, keywords: listOf(project, "keywords"), description: stringOf(project, "description") };
}

// [dependencies], [dev-dependencies], [build-dependencies], their target-specific forms and
// [workspace.dependencies]; a dependency may also be a table of its own ([dependencies.serde]).
export function parseCargoToml(text: string): ManifestText {
  const tables = tomlTables(text);
  const dependencies: string[] = [];
  for (const [table, entries] of tables) {
    const match = table.match(/^(?:target\..+\.|workspace\.)?(?:dev-|build-)?dependencies(?:\.([^.]+))?$/);
    if (!match) continue;
    if (match[1]) dependencies.push(match[1]);
    else dependencies.push(...entries.map(([key]) => key.split(".")[0]));
  }
  const pkg = tables.get("package") ?? [];
  return { dependencies, keywords: listOf(pkg, "keywords"), description: stringOf(pkg, "description") };
}

// The first heading and the first paragraph after it (or the first paragraph, without a heading),
// as plain text: badges, images, HTML lines and code blocks are skipped; links keep their text.
export function readmeIntro(text: string): string {
  let heading = "";
  const paragraph: string[] = [];
  let fenced = false;
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      if (paragraph.length) break;
      continue;
    }
    if (fenced) continue;
    const title = raw.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (title) {
      if (paragraph.length) break;
      if (!heading) heading = plain(title[1]);
      continue;
    }
    const line = raw.trim().startsWith("<") ? "" : plain(raw);
    if (line) paragraph.push(line);
    else if (paragraph.length) break;
  }
  return [heading, paragraph.join(" ")].filter(Boolean).join("\n");
}

// Markdown inline formatting to plain text.
function plain(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]+/g, "")
    .trim();
}

function readmeFile(folder: string): string | undefined {
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch {
    return undefined;
  }
  const readmes = names.filter((name) => /^readme(\.(md|markdown|txt|rst))?$/i.test(name));
  return readmes.find((name) => /\.(md|markdown)$/i.test(name)) ?? readmes[0];
}

// A TOML file's tables as [key, raw value] pairs, by table name ("" before the first header; quotes
// removed from names). A value that spans lines (an array) is joined into one. Not a TOML parser:
// enough for dependency lists, keywords and descriptions.
function tomlTables(text: string): Map<string, [string, string][]> {
  const tables = new Map<string, [string, string][]>([["", []]]);
  let current = tables.get("") as [string, string][];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = withoutComment(lines[i]).trim();
    const header = line.match(/^\[\[?([^\]]+)\]\]?$/);
    if (header) {
      const name = header[1].replace(/["']/g, "").split(".").map((part) => part.trim()).join(".");
      current = tables.get(name) ?? [];
      tables.set(name, current);
      continue;
    }
    const pair = line.match(/^("[^"]*"|'[^']*'|[A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (!pair) continue;
    let value = pair[2];
    while (depth(value) > 0 && i + 1 < lines.length) value += ` ${withoutComment(lines[++i]).trim()}`;
    current.push([pair[1].replace(/^["']|["']$/g, ""), value]);
  }
  return tables;
}

// A line without its comment: the first # outside a string.
function withoutComment(line: string): string {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#") return line.slice(0, i);
  }
  return line;
}

// How many brackets and braces are still open, outside strings.
function depth(value: string): number {
  return [...value.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, "")].reduce((open, c) => open + ("[{".includes(c) ? 1 : "]}".includes(c) ? -1 : 0), 0);
}

// The strings in a raw TOML value, in order.
function strings(value: string): string[] {
  return [...value.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
}

function listOf(entries: [string, string][], key: string): string[] {
  return entries.filter(([k]) => k === key).flatMap(([, value]) => strings(value));
}

function stringOf(entries: [string, string][], key: string): string {
  return strings(entries.find(([k]) => k === key)?.[1] ?? "")[0] ?? "";
}
