// Claude Code PreToolUse adapter (spec §6, decision 0024): the tool call's JSON in, the hook's JSON
// out. An exact avoid note asks the user; any other match informs; magpie never denies. Returns
// null when there is nothing to say. The caller prints the result and always exits 0 (fails open).
import { sep } from "node:path";
import { detectInstalls } from "../core/install-detect.ts";
import type { Env } from "../core/journals.ts";
import { isAvoid, openRecallSources, recall, type RecallMatch } from "../core/recall.ts";

export interface HookContext {
  env: Env;
  home: string;
  cwd: string; // used when the input has no cwd
  informOnly: boolean; // --inform-only: never ask (unattended -p runs)
  homeFlag?: string;
  projectFlag?: string;
}

const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);
const CAP = 10_000; // Claude Code's limit for additionalContext and systemMessage

export function hookOutput(input: string, ctx: HookContext): string | null {
  let call: { tool_name?: unknown; tool_input?: { command?: unknown }; cwd?: unknown } | null;
  try {
    call = JSON.parse(input);
  } catch {
    return null;
  }
  const command = call?.tool_input?.command;
  if (typeof command !== "string" || (typeof call?.tool_name === "string" && !SHELL_TOOLS.has(call.tool_name))) return null;
  const installs = detectInstalls(command);
  if (!installs.length) return null; // the common case: no journal is opened

  const cwd = typeof call?.cwd === "string" ? call.cwd : ctx.cwd;
  const { sources } = openRecallSources({ home: ctx.home, env: ctx.env, cwd, homeFlag: ctx.homeFlag, projectFlag: ctx.projectFlag });
  const seen = new Set<string>();
  const matches = installs.flatMap((install) => recall(sources, install.name, [install.type])).filter((m) => !seen.has(m.path) && seen.add(m.path));
  if (!matches.length) return null;

  const path = (m: RecallMatch) => (ctx.home && m.path.startsWith(ctx.home + sep) ? `~${m.path.slice(ctx.home.length)}` : m.path);
  const verdict = (m: RecallMatch) => m.verdict ?? "[inbox] no verdict yet";
  const line = (m: RecallMatch) =>
    `${m.name} — ${verdict(m)}${m.avoid_when.length ? `. Avoid when: ${m.avoid_when.join("; ")}` : ""}${m.confidence === "name-only" ? " (name match only)" : ""}`;
  const context = cap(matches.map((m) => `Note from your journal: ${line(m)} (${m.journal} journal, ${path(m)})`).join("\n"));

  const asking = ctx.informOnly ? [] : matches.filter((m) => m.confidence === "exact" && isAvoid(m));
  if (asking.length) {
    const others = matches.filter((m) => !asking.includes(m));
    const reason = [
      ...asking.map((m) => [`magpie: you noted to avoid ${m.name} (${m.journal} journal)`, `Verdict: ${verdict(m)}`,
        ...(m.avoid_when.length ? [`Avoid when: ${m.avoid_when.join("; ")}`] : []), path(m)].join("\n")),
      ...others.map((m) => [`magpie: note on ${m.name} (${m.journal} journal)`, `Verdict: ${verdict(m)}`, path(m)].join("\n")),
    ].join("\n\n");
    return JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: cap(reason), additionalContext: context },
    });
  }
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: context },
    systemMessage: cap(matches.map((m) => `magpie: ${line(m)}`).join("\n")),
  });
}

function cap(text: string): string {
  return text.length > CAP ? `${text.slice(0, CAP - 1)}…` : text;
}
