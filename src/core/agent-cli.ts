// Runs an agent's own CLI (claude, codex, gemini, code) for repomagpie setup (decision 0035), and
// gh for the GitHub token (decision 0053), with
// each argument arriving exactly as given. On Windows npm installs these as .cmd shims, which only
// cmd.exe runs: the command line is then built with cmd.exe's escaping (as the cross-spawn package
// does, MIT), never from a string a shell would read on its own. Never prints.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { join, posix, win32 } from "node:path";
import type { Platform, Where } from "./agents.ts";
import type { Env } from "./journals.ts";

export interface CliResult {
  status: number; // the exit code; -1 when it couldn't start or was stopped
  stdout: string;
  stderr: string;
}

const TIMEOUT = 60_000; // the default; a caller may ask for less

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

// Only by absolute path: Windows looks a bare name up in the current folder before PATH, and that
// folder can be a repository someone else wrote. setup passes the path it resolved on PATH, and the
// home folder as the working folder.
export function runCli(file: string, args: string[], options: { env: Env; platform: Platform; cwd?: string; timeoutMs?: number }): CliResult {
  const timeout = options.timeoutMs ?? TIMEOUT;
  const absolute = options.platform === "win32" ? win32.isAbsolute : posix.isAbsolute;
  if (!absolute(file)) return { status: -1, stdout: "", stderr: `${file} isn't an absolute path; setup runs a program only by the path it found on PATH.` };
  const shim = options.platform === "win32" && /\.(cmd|bat)$/i.test(file);
  const run = shim
    ? spawnSync(commandShell(options.env), ["/d", "/s", "/c", `"${[escapeCommand(file), ...args.map(escapeArgument)].join(" ")}"`],
      { env: options.env, cwd: options.cwd, encoding: "utf8", timeout, windowsVerbatimArguments: true, windowsHide: true })
    : spawnSync(file, args, { env: options.env, cwd: options.cwd, encoding: "utf8", timeout, windowsHide: true });
  if (run.error) return { status: -1, stdout: run.stdout ?? "", stderr: run.error.message };
  const missing = shim && run.status !== 0 && /is not recognized|cannot find/i.test(run.stderr ?? "");
  return { status: run.status ?? -1, stdout: run.stdout ?? "", stderr: missing ? `${file} can't be run: ${run.stderr.trim()}` : run.stderr ?? "" };
}

// cmd.exe by absolute path: ComSpec when it is one, else the system's own. Also how repomagpie ui
// starts it (server/open.ts).
export function commandShell(env: Env): string {
  const comspec = env.ComSpec ?? env.COMSPEC;
  if (comspec && win32.isAbsolute(comspec)) return comspec;
  return win32.join(env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows", "System32", "cmd.exe");
}

// cmd.exe's special characters, escaped with ^. A shim passes its arguments on with %*, which
// cmd.exe reads a second time, so arguments are escaped twice.
const META = /([()\][%!^"`<>&|;, *?])/g;

function escapeCommand(file: string): string {
  return file.replace(META, "^$1");
}

// An argument as the C runtime reads it (quotes, and backslashes before a quote or at the end,
// doubled), quoted, then cmd.exe's characters escaped twice.
function escapeArgument(arg: string): string {
  const quoted = `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1")}"`;
  return quoted.replace(META, "^$1").replace(META, "^$1");
}
