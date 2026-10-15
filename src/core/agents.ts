// The coding agents that repomagpie setup and doctor know (decision 0035; facts, sources and dates
// in docs/agents.md): where each keeps its MCP entry, and reading those files without changing them.
// Never prints, never writes.
import { closeSync, existsSync, openSync, readFileSync, readSync, realpathSync, statSync } from "node:fs";
import { dirname, join, posix, resolve, win32 } from "node:path";
import type { Env } from "./journals.ts";

export type Platform = "win32" | "darwin" | "linux";

export interface Where {
  home: string;
  env: Env;
  platform: Platform;
}

// How an agent's file holds MCP servers: JSON under `mcpServers` (Claude Code's ~/.claude.json,
// Cursor, Gemini CLI), JSON under `servers` (VS Code), or Codex's TOML tables.
export type McpFormat = "mcpServers" | "servers" | "codex-toml";

export interface Agent {
  id: "claude-code" | "codex" | "cursor" | "gemini" | "vscode";
  name: string;
  cli: string; // the command on PATH
  marker: (w: Where) => string; // a folder or file of its own: it counts as installed when this exists (or cli is on PATH)
  mcpFile: (w: Where) => string;
  format: McpFormat;
}

const vscodeUser = (w: Where) =>
  w.platform === "win32" ? join(w.env.APPDATA ?? join(w.home, "AppData", "Roaming"), "Code", "User")
    : w.platform === "darwin" ? join(w.home, "Library", "Application Support", "Code", "User")
      : join(w.env.XDG_CONFIG_HOME ?? join(w.home, ".config"), "Code", "User");
const codexHome = (w: Where) => w.env.CODEX_HOME ?? join(w.home, ".codex");

const geminiSettings = (w: Where) => join(w.home, ".gemini", "settings.json");

// The first set (decision 0035), in the order setup and doctor show them. Gemini CLI's marker is its
// settings.json, not ~/.gemini: Antigravity CLI makes that folder too (docs/agents.md).
export const AGENTS: Agent[] = [
  { id: "claude-code", name: "Claude Code", cli: "claude", marker: (w) => join(w.home, ".claude"), mcpFile: (w) => join(w.home, ".claude.json"), format: "mcpServers" },
  { id: "codex", name: "Codex CLI", cli: "codex", marker: codexHome, mcpFile: (w) => join(codexHome(w), "config.toml"), format: "codex-toml" },
  { id: "cursor", name: "Cursor", cli: "cursor", marker: (w) => join(w.home, ".cursor"), mcpFile: (w) => join(w.home, ".cursor", "mcp.json"), format: "mcpServers" },
  { id: "gemini", name: "Gemini CLI", cli: "gemini", marker: geminiSettings, mcpFile: geminiSettings, format: "mcpServers" },
  { id: "vscode", name: "VS Code (GitHub Copilot)", cli: "code", marker: vscodeUser, mcpFile: (w) => join(vscodeUser(w), "mcp.json"), format: "servers" },
];

// Its marker exists, or its command is in an absolute PATH folder.
export const isInstalled = (agent: Agent, w: Where): boolean => existsSync(agent.marker(w)) || onPath(agent.cli, w).length > 0;

// Claude Code's user settings, which hold the hook (spec §6).
export const claudeSettings = (w: Where) => join(w.home, ".claude", "settings.json");

// The skills folders RepoMagpie's skill can be in (decision 0035, "The skill"): the shared folder
// and Claude Code's, then the agent folders npx skills or a person may have used.
export const skillFolders = (w: Where) => [
  join(w.home, ".agents", "skills", "repomagpie"),
  join(w.home, ".claude", "skills", "repomagpie"),
  join(w.home, ".cursor", "skills", "repomagpie"),
  join(w.home, ".copilot", "skills", "repomagpie"),
  join(w.home, ".gemini", "skills", "repomagpie"),
  join(codexHome(w), "skills", "repomagpie"),
];

// Every file on PATH that `name` may run, in the order the shell looks: the first one runs. On
// Windows, each PATHEXT extension in each folder (npm installs name.cmd and name.ps1 there).
export function onPath(name: string, w: Where): string[] {
  const path = w.env.PATH ?? w.env.Path ?? "";
  const separator = w.platform === "win32" ? ";" : ":";
  const extensions = w.platform === "win32" ? (w.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean).map((e) => e.toLowerCase()) : [""];
  const found: string[] = [];
  // Only absolute folders: a relative entry (".", "bin") means the current folder, which may be a
  // repository someone else wrote, and setup would run its claude.cmd.
  const absolute = w.platform === "win32" ? win32.isAbsolute : posix.isAbsolute;
  for (const folder of path.split(separator).filter((entry) => entry && absolute(entry))) {
    for (const extension of extensions) {
      const file = join(folder, name + extension);
      try {
        const stat = statSync(file);
        if (stat.isFile() && (w.platform === "win32" || (stat.mode & 0o111) !== 0) && !found.includes(file)) found.push(file);
      } catch {
        // not there
      }
    }
  }
  return found;
}

// The package a command file runs: the folder above node_modules/<package>/ that npm's shims (a
// symlink, a .cmd or a .ps1 file) point to, read from the shim, and that package's name and
// version. null when the file names no package.
export function packageOf(file: string): { name: string; version: string; entry: string } | null {
  let target: string;
  try {
    target = realpathSync(file);
  } catch {
    return null;
  }
  const direct = packageAbove(target);
  if (direct) return { ...direct, entry: target };
  let text: string;
  try {
    text = readHead(file, 8192);
  } catch {
    return null;
  }
  const script = text.match(/(?:%~?dp0%?|\$basedir|\$\(dirname "\$0"\))[\\/]+((?:\.\.[\\/]+)*node_modules[\\/]+[^"'\s]+?\.[cm]?js)\b/i);
  if (!script) return null;
  const entry = resolve(dirname(file), script[1].replace(/\\/g, "/"));
  const found = packageAbove(entry);
  return found ? { ...found, entry } : null;
}

function packageAbove(file: string): { name: string; version: string } | null {
  // A package's bin file sits a few folders under its package.json (dist/cli/main.js).
  let folder = dirname(file);
  for (let i = 0; i < 4; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { name?: unknown; version?: unknown };
      if (typeof pkg.name === "string") return { name: pkg.name, version: typeof pkg.version === "string" ? pkg.version : "" };
    } catch {
      // keep looking
    }
    const parent = dirname(folder);
    if (parent === folder) break;
    folder = parent;
  }
  return null;
}

function readHead(file: string, bytes: number): string {
  const fd = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    return buffer.toString("utf8", 0, readSync(fd, buffer, 0, bytes, 0));
  } finally {
    closeSync(fd);
  }
}

// --- Reading config files without changing them ---

// JSON with comments and trailing commas, as VS Code, Cursor and Gemini CLI accept them: the value,
// and whether the text had either (setup edits only plain JSON). An error message when it can't be
// read. Strings are kept as written, so "//" inside a URL stays.
export function readJsonc(text: string): { value: unknown; plain: boolean } | { error: string } {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let out = "";
  let plain = true;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < source.length && source[j] !== '"') j += source[j] === "\\" ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j;
    } else if (ch === "/" && source[i + 1] === "/") {
      plain = false;
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && source[i + 1] === "*") {
      plain = false;
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 1;
      out += " ";
    } else if (ch === "," && /^\s*[}\]]/.test(source.slice(i + 1, i + 200))) {
      plain = false;
    } else out += ch;
  }
  try {
    return { value: JSON.parse(out), plain };
  } catch (error) {
    // Node's message can quote the text around the mistake, and a config file can hold secrets, so
    // only the position is kept (the position in the text without comments).
    const at = (error as Error).message.match(/position (\d+)/)?.[1];
    return { error: `not valid JSON${at ? ` (at character ${at})` : ""}` };
  }
}

export interface McpEntry {
  command: string | null;
  args: string[];
  env_keys: string[]; // the names of its environment variables, never their values
}

// The entry named `name` in an MCP config file's text, null when it has none, or an error when the
// file can't be read. Codex's TOML is read only as far as the entry's own table, its `command` and
// `args` on one line each, which is how `codex mcp add` writes them.
export function mcpEntry(text: string, format: McpFormat, name: string): { entry: McpEntry | null } | { error: string } {
  if (format === "codex-toml") return codexEntry(text, name);
  const read = readJsonc(text);
  if ("error" in read) return read;
  const root = read.value;
  const servers = isObject(root) ? root[format] : undefined;
  if (servers === undefined) return { entry: null };
  if (!isObject(servers)) return { error: `"${format}" is not an object` };
  const entry = servers[name];
  if (entry === undefined) return { entry: null };
  if (!isObject(entry)) return { error: `"${format}.${name}" is not an object` };
  return {
    entry: {
      command: typeof entry.command === "string" ? entry.command : null,
      args: Array.isArray(entry.args) ? entry.args.filter((a): a is string => typeof a === "string") : [],
      env_keys: isObject(entry.env) ? Object.keys(entry.env) : [],
    },
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function codexEntry(text: string, name: string): { entry: McpEntry | null } | { error: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const header = (line: string) => line.match(/^\s*\[\s*([^\]]+?)\s*\]\s*(#.*)?$/)?.[1];
  const tableName = (raw: string) => raw.split(".").map((part) => part.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1")).join(".");
  const start = lines.findIndex((line) => { const h = header(line); return h !== undefined && tableName(h) === `mcp_servers.${name}`; });
  if (start < 0) return { entry: null };
  const entry: McpEntry = { command: null, args: [], env_keys: [] };
  for (const line of lines.slice(start + 1)) {
    const h = header(line);
    if (h !== undefined) {
      if (tableName(h) === `mcp_servers.${name}.env`) continue;
      break;
    }
    const pair = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*$/);
    if (!pair) continue;
    const [, key, value] = pair;
    if (key === "command") entry.command = tomlString(value);
    else if (key === "args") {
      const items = value.match(/^\[(.*)\]$/)?.[1];
      if (items === undefined) return { error: "args isn't a one-line list" };
      entry.args = [...items.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map((m) => (m[1] !== undefined ? tomlString(`"${m[1]}"`) ?? "" : m[2]));
    } else if (key === "env") entry.env_keys = [...value.matchAll(/([A-Za-z0-9_]+)\s*=/g)].map((m) => m[1]);
  }
  return { entry };
}

// A TOML basic string ("…", JSON-like escapes) or literal string ('…'); null for anything else.
function tomlString(value: string): string | null {
  const trimmed = value.replace(/\s+#.*$/, "");
  if (/^'[^']*'$/.test(trimmed)) return trimmed.slice(1, -1);
  if (/^"(?:[^"\\]|\\.)*"$/.test(trimmed)) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return null;
    }
  }
  return null;
}
