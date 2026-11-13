// RepoMagpie's Claude Code plugin (decision 0063), as setup and doctor see it: which settings files
// turn it on or off, which versions Claude Code has installed, and what an earlier setup wrote for
// Claude Code beside it. Read-only. From the documentation (code.claude.com/docs/en/plugins/loading
// and discover-plugins, read 2026-11-13): `enabledPlugins` maps "<plugin>@<marketplace>" to true or
// false in the user's ~/.claude/settings.json, a project's .claude/settings.json and its
// .claude/settings.local.json; for each id the most specific file that names it wins (local, then
// project, then user). An installed version is a folder ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/.
// Not read: managed settings, --settings, and CLAUDE_CONFIG_DIR or CLAUDE_CODE_PLUGIN_CACHE_DIR,
// which setup and doctor don't follow for Claude Code's other files either.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { claudeSettings, mcpEntry, readJsonc, type Where } from "./agents.ts";
import { readConfig } from "./config-write.ts";
import { samePath } from "./journals.ts";
import { findHooks, STOP } from "./setup-hook.ts";

export type PluginScope = "user" | "project" | "local";

export interface PluginSetting {
  file: string;
  scope: PluginScope;
  id: string; // repomagpie@<marketplace>
  enabled: boolean;
}

export interface PluginInstall {
  id: string;
  version: string;
  path: string;
}

export interface ClaudePlugin {
  settings: PluginSetting[]; // every repomagpie@… entry in the files read, the user's first
  enabled: PluginSetting | null; // the entry that turns it on, as Claude Code merges the files; null: off
  installed: PluginInstall[]; // the versions in Claude Code's plugin cache
  active: boolean; // on and installed: Claude Code runs it
}

const ID = /^repomagpie@[^@\s]+$/;
// Origins without a marketplace, so without a cache folder (the loading page): counted as installed.
const NO_CACHE = new Set(["inline", "skills-dir", "synced"]);

// The plugin as the user's settings decide it, and, given the working folder, as its project's
// settings decide it too.
export function claudePlugin(where: Where, cwd?: string): ClaudePlugin {
  const user = claudeSettings(where);
  const files: [PluginScope, string][] = [["user", user]];
  if (cwd !== undefined) {
    const project = join(cwd, ".claude", "settings.json");
    // Run in the home folder, the user's settings are the project's: read once.
    if (!samePath(project, user)) files.push(["project", project]);
    files.push(["local", join(cwd, ".claude", "settings.local.json")]);
  }
  const settings = files.flatMap(([scope, file]) => entriesIn(file, scope));
  const decided = new Map<string, PluginSetting>(); // later files are more specific
  for (const s of settings) decided.set(s.id, s);
  const enabled = [...decided.values()].find((s) => s.enabled) ?? null;
  const installed = installs(where);
  const active = enabled !== null && (NO_CACHE.has(marketplace(enabled.id)) || installed.some((i) => i.id === enabled.id));
  return { settings, enabled, installed, active };
}

const marketplace = (id: string) => id.slice(id.indexOf("@") + 1);

// A file's repomagpie@… entries. A file that is missing or can't be read has none: doctor reports an
// unreadable settings file under the hook already, and setup refuses to edit it.
function entriesIn(file: string, scope: PluginScope): PluginSetting[] {
  const read = readConfig(file);
  if ("error" in read || read.text === null) return [];
  const parsed = readJsonc(read.text);
  if ("error" in parsed) return [];
  const plugins = (parsed.value as { enabledPlugins?: unknown } | null)?.enabledPlugins;
  if (typeof plugins !== "object" || plugins === null || Array.isArray(plugins)) return [];
  return Object.entries(plugins).filter(([id, on]) => ID.test(id) && typeof on === "boolean").map(([id, on]) => ({ file, scope, id, enabled: on as boolean }));
}

function installs(where: Where): PluginInstall[] {
  const cache = join(where.home, ".claude", "plugins", "cache");
  const folders = (path: string) => {
    try {
      return readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    } catch {
      return [];
    }
  };
  return folders(cache).flatMap((market) => folders(join(cache, market, "repomagpie")).map((version) => ({ id: `repomagpie@${market}`, version, path: join(cache, market, "repomagpie", version) })));
}

// What an earlier `repomagpie setup` wrote for Claude Code in the user's settings, which the plugin
// brings too: its MCP entry, its hook and its skill link. The Stop reminder isn't in the plugin, so it
// is no double; `reminder` says whether it is there, since setup --remove takes it out too.
export interface SetupPiece {
  what: "the MCP server" | "the hook" | "the skill";
  path: string; // the file, or the skill's folder
}

export function setupPieces(where: Where): { pieces: SetupPiece[]; reminder: boolean } {
  const pieces: SetupPiece[] = [];
  const mcpFile = join(where.home, ".claude.json");
  const mcp = readConfig(mcpFile);
  if (!("error" in mcp) && mcp.text !== null) {
    const found = mcpEntry(mcp.text, "mcpServers", "repomagpie");
    if (!("error" in found) && found.entry) pieces.push({ what: "the MCP server", path: mcpFile });
  }
  let reminder = false;
  const settings = readConfig(claudeSettings(where));
  if (!("error" in settings) && settings.text !== null) {
    const parsed = readJsonc(settings.text);
    if (!("error" in parsed)) {
      const hooks = findHooks(parsed.value);
      if (typeof hooks !== "string" && hooks.length) pieces.push({ what: "the hook", path: claudeSettings(where) });
      const stop = findHooks(parsed.value, STOP);
      reminder = typeof stop !== "string" && stop.length > 0;
    }
  }
  const skill = join(where.home, ".claude", "skills", "repomagpie");
  if (existsSync(join(skill, "SKILL.md"))) pieces.push({ what: "the skill", path: skill });
  return { pieces, reminder };
}

// "the MCP server in ~/.claude.json, the hook in ~/.claude/settings.json and the skill in …".
export function piecesText(pieces: SetupPiece[], tilde: (path: string) => string): string {
  const parts = pieces.map((p) => `${p.what} in ${tilde(p.path)}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "";
}

// The command that turns the plugin off where it is on. Without --scope, Claude Code changes the most
// specific file that names it, which for a project's plugin is the committed file, the team's; --scope
// local turns it off for this user alone.
export const disableCommand = (setting: PluginSetting) => `claude plugin disable ${setting.id}${setting.scope === "user" ? "" : " --scope local"}`;
