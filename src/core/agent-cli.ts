// Runs an agent's own CLI (claude, codex, gemini, code) for repomagpie setup (decision 0035), with
// each argument arriving exactly as given. On Windows npm installs these as .cmd shims, which only
// cmd.exe runs: the command line is then built with cmd.exe's escaping (as the cross-spawn package
// does, MIT), never from a string a shell would read on its own. Never prints.
import { spawnSync } from "node:child_process";
import type { Platform } from "./agents.ts";
import type { Env } from "./journals.ts";

export interface CliResult {
  status: number; // the exit code; -1 when it couldn't start or was stopped
  stdout: string;
  stderr: string;
}

const TIMEOUT = 60_000;

export function runCli(file: string, args: string[], options: { env: Env; platform: Platform; cwd?: string }): CliResult {
  const shim = options.platform === "win32" && /\.(cmd|bat)$/i.test(file);
  const run = shim
    ? spawnSync(options.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${[escapeCommand(file), ...args.map(escapeArgument)].join(" ")}"`],
      { env: options.env, cwd: options.cwd, encoding: "utf8", timeout: TIMEOUT, windowsVerbatimArguments: true, windowsHide: true })
    : spawnSync(file, args, { env: options.env, cwd: options.cwd, encoding: "utf8", timeout: TIMEOUT, windowsHide: true });
  if (run.error) return { status: -1, stdout: run.stdout ?? "", stderr: run.error.message };
  const missing = shim && run.status !== 0 && /is not recognized|cannot find/i.test(run.stderr ?? "");
  return { status: run.status ?? -1, stdout: run.stdout ?? "", stderr: missing ? `${file} can't be run: ${run.stderr.trim()}` : run.stderr ?? "" };
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
