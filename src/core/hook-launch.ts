// The command a hook entry runs in the agents other than Claude Code (decision 0036, "How each
// agent starts the hook command"): node by absolute path with code generation off, the installed
// CLI's entry file, then `hook <agent>`, and only when both files exist. So a moved node or a
// reinstall elsewhere makes the entry exit 0 and print nothing: a failed hook denies every call in
// Copilot CLI, and blocks on most exit codes in Gemini CLI. Each agent runs the string through a
// shell (docs/agents.md): on Windows, Windows PowerShell for Codex CLI, Copilot CLI, Gemini CLI and
// Cursor (inside Cursor's own `$input | …`), `cmd /c` for Antigravity CLI; elsewhere sh or bash, or
// the user's own shell for Codex CLI, so that form parses in fish too. Never prints.
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

export interface ParsedHook {
  // setup: exactly what setup writes, for some node and entry file; name: `repomagpie hook <agent>`
  // (or magpie, .cmd, .ps1), which needs PATH; other: anything else that runs `hook <agent>`.
  form: "setup" | "name" | "other";
  node: string | null;
  entry: string | null;
  flags: string[]; // after `hook <agent>`, such as --inform-only
}

// A hook command that runs `hook <sub>`, read back; null when it doesn't run it.
export function parseHookCommand(command: string, sub: HookSub, shell: HookShell): ParsedHook | null {
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
