// setup's backups (decision 0035, "Backups"; decision 0038): where doctor finds them, and deleting
// them when the user asks (repomagpie setup --delete-backups). Never prints, never prompts.
import { join } from "node:path";
import { AGENTS, claudeSettings, type Where } from "./agents.ts";
import { backedUp, backupsOf } from "./config-write.ts";
import { removeFolder } from "./copy-folder.ts";
import { HOOK_SPECS } from "./setup-agent-hooks.ts";

export interface Backup {
  path: string;
  date: string; // UTC, from its name
}

// Beside each file setup edits in the home folder (each agent's MCP file, Claude Code's settings,
// the other agents' hook files), and beside the skills folders (setup-skill.ts). Oldest first for
// each file.
export function setupBackups(where: Where): Backup[] {
  const files = [...AGENTS.map((agent) => agent.mcpFile(where)), claudeSettings(where), ...HOOK_SPECS.map((spec) => spec.file(where)),
    ...[".agents", ".claude", ".gemini"].map((folder) => join(where.home, folder, "repomagpie-skill"))];
  return [...new Set(files)].flatMap((file) => backupsOf(file, where.home));
}

// The backups to delete, and with keepLatest the newest of each file, which stays.
export function planBackups(backups: Backup[], keepLatest: boolean): { delete: Backup[]; keep: Backup[] } {
  // backupsOf sorts each file's backups oldest first, so the last one of a file is its newest.
  const newest = new Set(keepLatest ? [...new Map(backups.map((b) => [backedUp(b.path), b.path])).values()] : []);
  return { delete: backups.filter((b) => !newest.has(b.path)), keep: backups.filter((b) => newest.has(b.path)) };
}

export type Deleted = Backup & { result: "deleted" | "failed"; error?: string };

// Deletes each backup that is still one of setup's backups: found again just before, from its
// folder's listing (the backup's name, not a link, its folder not reached through a link), then
// removed with removeFolder, which never follows a link (a skill folder's backup is a folder).
export function deleteBackups(backups: Backup[], where: Where): Deleted[] {
  const now = new Set(setupBackups(where).map((b) => b.path));
  return backups.map((b): Deleted => {
    if (!now.has(b.path)) return { ...b, result: "failed", error: `${b.path} is no longer one of setup's backups, so it was left.` };
    try {
      removeFolder(b.path);
      return { ...b, result: "deleted" };
    } catch (error) {
      return { ...b, result: "failed", error: (error as Error).message };
    }
  });
}
