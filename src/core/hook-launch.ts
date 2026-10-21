// The command a hook entry runs in the agents other than Claude Code (decision 0036, "How each
// agent starts the hook command"): node by absolute path with code generation off, the installed
// CLI's entry file, then `hook <agent>`, and only when both files exist. So a moved node or a
// reinstall elsewhere makes the entry exit 0 and print nothing: a failed hook denies every call in
// Copilot CLI, and blocks on most exit codes in Gemini CLI. Each agent runs the string through a
// shell (docs/agents.md): on Windows, Windows PowerShell for Codex CLI, Copilot CLI, Gemini CLI and
// Cursor (inside Cursor's own `$input | …`), `cmd /c` for Antigravity CLI; elsewhere sh or bash, or
// the user's own shell for Codex CLI, so that form parses in fish too. Antigravity CLI's entry on
// Windows names a launcher file instead, which holds the cmd command (below). Never prints.
import { readFileSync } from "node:fs";
import { win32 } from "node:path";
import type { Platform } from "./agents.ts";
import { NO_CODEGEN } from "./launch.ts";

// The `repomagpie hook` subcommand of each agent setup writes a hook for.
export type HookSub = "codex" | "cursor" | "gemini-cli" | "antigravity" | "copilot";

export type HookShell = "powershell" | "powershell-pipeline" | "cmd" | "posix";

export function hookShell(sub: HookSub, platform: Platform): HookShell {
  if (platform !== "win32") return "posix";
  return sub === "antigravity" ? "cmd" : sub === "cursor" ? "powershell-pipeline" : "powershell";
}

const ps = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

// The entry's command, or why it can't be written: cmd reads % as the start of a variable, and a
// path never holds a double quote on Windows.
export function hookLaunch(shell: HookShell, node: string, entry: string, sub: HookSub, flags: string[]): string | { error: string } {
  const tail = ` hook ${sub}${flags.map((flag) => ` ${flag}`).join("")}`;
  const exists = `[IO.File]::Exists(${ps(node)}) -and [IO.File]::Exists(${ps(entry)})`;
  const run = `& ${ps(node)} ${NO_CODEGEN} ${ps(entry)}${tail}`;
  switch (shell) {
    case "powershell":
      return `if (${exists}) { ${run} }`;
    case "powershell-pipeline":
      // Cursor pipes the input in (`$input | <command>`), where an `if` can't stand: a script block can.
      return `& { if (${exists}) { $input | ${run} } }`;
    case "cmd":
      if (/[%"]/.test(node + entry)) return { error: `cmd would read a % or " in ${/[%"]/.test(node) ? node : entry}` };
      return `if exist "${node}" if exist "${entry}" "${node}" ${NO_CODEGEN} "${entry}"${tail}`;
    case "posix":
      return `test -x ${sh(node)} && test -f ${sh(entry)} && ${sh(node)} ${NO_CODEGEN} ${sh(entry)}${tail} || true`;
  }
}

// Antigravity CLI (agy, a Go program) runs `cmd /c <command>` through Go's EscapeArg, which writes
// each " in the command as \", which cmd doesn't read: `if exist "<node>"` then finds no file, and
// the hook does nothing. So its entry is the absolute path of this file, beside hooks.json, with no
// quotes: Go quotes the path whole when it has a space, and cmd keeps the quotes around one file
// name. The file holds the cmd command. cmd reads a .cmd file in the console's code page, so its
// paths below the home folder are written from %~dp0 (the file's folder, ~\.gemini\config\), and
// any other path must be ASCII.
export const LAUNCHER = "repomagpie-hook.cmd";
const HEAD = "@echo off\r\nrem RepoMagpie's hook for Antigravity CLI, written by repomagpie setup.\r\n";
const FROM_HOME = "%~dp0..\\..\\";
const homeOf = (launcher: string) => `${win32.join(win32.dirname(launcher), "..", "..")}\\`;

// The launcher's text for a cmd command (hookLaunch) that starts node and entry, or why it can't be
// written: cmd splits an unquoted path at these characters, or reads them.
export function launcherText(launcher: string, node: string, entry: string, command: string): string | { error: string } {
  if (/[&<>()@^|%,;="]/.test(launcher)) return { error: `cmd can't start ${launcher}: its path has one of & < > ( ) @ ^ | % , ; = "` };
  const home = homeOf(launcher);
  let line = command;
  for (const path of [node, entry]) {
    const written = path.slice(0, home.length).toLowerCase() === home.toLowerCase() ? FROM_HOME + path.slice(home.length) : path;
    if (/[^\x20-\x7e]/.test(written)) return { error: `cmd reads ${LAUNCHER} in the console's code page, so it can't hold ${path}` };
    line = line.replaceAll(`"${path}"`, `"${written}"`);
  }
  return `${HEAD}${line}\r\n`;
}

// The cmd command in a launcher setup wrote, with its real paths; null when it is missing or not ours.
export function readLauncher(launcher: string): string | null {
  let text: string;
  try {
    text = readFileSync(launcher, "utf8");
  } catch {
    return null;
  }
  const line = text.startsWith(HEAD) && text.endsWith("\r\n") ? text.slice(HEAD.length, -2) : null;
  return line === null || /[\r\n]/.test(line) ? null : line.replaceAll(FROM_HOME, homeOf(launcher));
}

const isLauncher = (command: string) => win32.isAbsolute(command) && win32.basename(command).toLowerCase() === LAUNCHER;

export interface ParsedHook {
  // setup: exactly what setup writes, for some node and entry file; name: `repomagpie hook <agent>`
  // (or magpie, .cmd, .ps1), which needs PATH; other: anything else that runs `hook <agent>`.
  form: "setup" | "name" | "other";
  node: string | null; // null for setup's form when its launcher is missing or not ours
  entry: string | null;
  flags: string[]; // after `hook <agent>`, such as --inform-only
  launcher?: string; // Antigravity CLI's launcher file on Windows, which the entry names
}

// A hook command that runs `hook <sub>`, read back; null when it doesn't run it.
export function parseHookCommand(command: string, sub: HookSub, shell: HookShell): ParsedHook | null {
  if (shell === "cmd" && isLauncher(command)) {
    const line = readLauncher(command);
    const inner = line === null ? null : parseHookCommand(line, sub, "cmd");
    return inner?.form === "setup" ? { ...inner, launcher: command } : { form: "setup", node: null, entry: null, flags: [], launcher: command };
  }
  const at = command.match(new RegExp(`\\bhook\\s+${sub}((?:\\s+--[a-z][a-z-]*)*)(?=[\\s;}|]|$)`));
  if (!at) return null;
  const flags = at[1].trim().split(/\s+/).filter(Boolean);
  if (new RegExp(`^\\s*(?:&\\s*)?['"]?(?:[^'"\\s]*[\\\\/])?(?:repo)?magpie(?:\\.cmd|\\.ps1)?['"]?\\s+hook\\s+${sub}(?:\\s+--[a-z][a-z-]*)*\\s*$`).test(command)) {
    return { form: "name", node: null, entry: null, flags };
  }
  // The first two quoted strings are node and the entry file in every form setup writes.
  const quoted = shell === "cmd"
    ? [...command.matchAll(/"([^"]*)"/g)].map((m) => m[1])
    : shell === "posix" ? [...command.matchAll(/'((?:[^']|'\\'')*)'/g)].map((m) => m[1].replace(/'\\''/g, "'"))
      : [...command.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
  const [node, entry] = quoted;
  if (node !== undefined && entry !== undefined && hookLaunch(shell, node, entry, sub, flags) === command) return { form: "setup", node, entry, flags };
  return { form: "other", node: null, entry: null, flags };
}
