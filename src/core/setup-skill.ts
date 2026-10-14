// repomagpie setup's skill (decision 0035, "The skill"): the package's skills/repomagpie/ copied to
// the shared folder (.agents/skills/repomagpie, read by Codex, Cursor, Gemini CLI, VS Code, Copilot
// CLI and Zed), and a link to it from Claude Code's (.claude/skills/repomagpie): a junction on
// Windows, a relative symlink elsewhere, a copy when a link can't be made. That is how the `skills`
// CLI lays it out, so the two never fight. Never writes through a link, never follows one to
// delete. Never prints.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Platform } from "./agents.ts";
import { backupName, pathProblem } from "./config-write.ts";
import { readNote } from "./note.ts";

export interface SkillRequest {
  source: string; // the package's skills/repomagpie/
  shared: string; // .agents/skills/repomagpie
  claude: string | null; // .claude/skills/repomagpie, when Claude Code is set up
  root: string; // the folder setup may write in: the home folder, or the project
  remove: boolean;
  stamp: string;
  platform: Platform;
  project: boolean; // --project: the folders are committed, so no junction on Windows
}

export interface SkillItem {
  path: string;
  action: "add" | "update" | "keep" | "remove" | "leave" | "link" | "relink" | "copy";
  reason: string | null;
  backup: string | null;
  made?: "link" | "copy"; // after applying: what the Claude Code folder became
}

export interface SkillPlan {
  shared: SkillItem;
  claude: SkillItem | null;
  result?: "done" | "failed";
  error?: string;
}

// The package's skill: its files, relative to `source`.
function files(source: string): string[] {
  return readdirSync(source, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => relative(source, join(d.parentPath, d.name)));
}

const isLink = (path: string) => lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
const exists = (path: string) => lstatSync(path, { throwIfNoEntry: false }) !== undefined;

// A folder holding RepoMagpie's skill: its SKILL.md is named repomagpie.
function holdsOurs(folder: string): boolean {
  try {
    return readNote(readFileSync(join(folder, "SKILL.md"), "utf8")).frontmatter.name === "repomagpie";
  } catch {
    return false;
  }
}

function sameFiles(folder: string, source: string): boolean {
  return files(source).every((file) => {
    try {
      return readFileSync(join(folder, file)).equals(readFileSync(join(source, file)));
    } catch {
      return false;
    }
  });
}

// Backups go beside the skills folder, never in it: an agent would read a backup as a second skill.
const skillBackup = (path: string, stamp: string) => backupName(join(dirname(dirname(path)), "repomagpie-skill"), stamp);

export function planSkill(r: SkillRequest): SkillPlan {
  return { shared: planShared(r), claude: r.claude === null ? null : planClaude(r, r.claude) };
}

function planShared(r: SkillRequest): SkillItem {
  const item = (action: SkillItem["action"], reason: string | null = null, backup: string | null = null): SkillItem => ({ path: r.shared, action, reason, backup });
  const unsafe = pathProblem(r.shared, r.root, true);
  if (unsafe) return item("leave", unsafe);
  if (!exists(r.shared)) return item(r.remove ? "keep" : "add");
  if (isLink(r.shared)) return item("leave", `${r.shared} is a link (yours); setup leaves it.`);
  if (!holdsOurs(r.shared)) return item("leave", `${r.shared} holds another skill; setup leaves it.`);
  if (r.remove) return item("remove");
  if (sameFiles(r.shared, r.source)) return item("keep");
  const lock = join(dirname(dirname(r.shared)), ".skill-lock.json");
  const npx = existsSync(lock) && /"repomagpie"/.test(readFileSync(lock, "utf8"));
  return item("update", npx ? "an npx skills install: updated in place; npx skills update may later replace it with the version on GitHub" : null, skillBackup(r.shared, r.stamp));
}

function planClaude(r: SkillRequest, path: string): SkillItem {
  const item = (action: SkillItem["action"], reason: string | null = null, backup: string | null = null): SkillItem => ({ path, action, reason, backup });
  const copy = r.project && r.platform === "win32";
  const unsafe = pathProblem(path, r.root, true);
  if (unsafe) return item("leave", unsafe);
  if (!exists(path)) return item(r.remove ? "keep" : copy ? "copy" : "link");
  if (isLink(path)) {
    let target: string;
    try {
      target = realpathSync(path);
    } catch {
      return item("leave", `${path} is a broken link; setup leaves it.`);
    }
    const ourLink = exists(r.shared) && !isLink(r.shared) && target === realpathSync(r.shared);
    if (!ourLink) return item("leave", `${path} is a link to ${target}; setup leaves it.`);
    return item(r.remove ? "remove" : copy ? "relink" : "keep");
  }
  if (!holdsOurs(path)) return item("leave", `${path} holds another skill; setup leaves it.`);
  if (r.remove) return item("remove");
  if (copy && sameFiles(path, r.source)) return item("keep");
  return item(copy ? "copy" : "relink", null, skillBackup(path, r.stamp));
}

// `link` makes the link; tests pass one that fails, to see the copy it falls back to.
export function applySkill(plan: SkillPlan, r: SkillRequest, link = makeLink): SkillPlan {
  const fail = (error: string): SkillPlan => ({ ...plan, result: "failed", error });
  const acting = [plan.shared, plan.claude].some((item) => item && !["keep", "leave"].includes(item.action));
  if (!acting) return plan;
  let claude = plan.claude;
  try {
    if (r.remove) {
      if (claude?.action === "remove") removeOne(claude.path);
      if (plan.shared.action === "remove") rmSync(plan.shared.path, { recursive: true });
    } else {
      if (plan.shared.action === "add" || plan.shared.action === "update") {
        if (plan.shared.backup) cpSync(plan.shared.path, plan.shared.backup, { recursive: true, errorOnExist: true, force: false });
        cpSync(r.source, plan.shared.path, { recursive: true, force: true });
      }
      if (claude && ["link", "relink", "copy"].includes(claude.action)) {
        if (claude.backup) renameSync(claude.path, claude.backup);
        else if (exists(claude.path)) removeOne(claude.path);
        mkdirSync(dirname(claude.path), { recursive: true });
        let made: "link" | "copy" = "copy";
        if (claude.action !== "copy") {
          try {
            link(plan.shared.path, claude.path, r.platform);
            made = "link";
          } catch {
            // A file system or policy without links: a copy, which doctor checks against the other.
          }
        }
        if (made === "copy") cpSync(r.source, claude.path, { recursive: true, force: true });
        claude = { ...claude, made };
      }
    }
  } catch (error) {
    return fail((error as Error).message);
  }
  // Read it back.
  const ok = r.remove
    ? (plan.shared.action !== "remove" || !exists(plan.shared.path)) && (claude?.action !== "remove" || !exists(claude.path))
    : sameFiles(plan.shared.path, r.source) && (!claude || claude.action === "leave" || sameFiles(claude.path, r.source));
  return ok ? { ...plan, claude, result: "done" } : { ...plan, claude, result: "failed", error: "The skill's files aren't as expected after the change." };
}

// A junction on Windows (no admin rights or Developer Mode needed), a relative symlink elsewhere,
// as the skills CLI makes them.
function makeLink(target: string, path: string, platform: Platform): void {
  if (platform === "win32") symlinkSync(target, path, "junction");
  else symlinkSync(relative(dirname(path), target), path, "dir");
}

// Removes a link without following it, or our own real folder.
function removeOne(path: string): void {
  if (isLink(path)) {
    try {
      unlinkSync(path);
    } catch {
      rmdirSync(path); // a Windows junction
    }
  } else rmSync(path, { recursive: true });
}
