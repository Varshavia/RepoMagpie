// Claude Code PreToolUse adapter (spec §6, decisions 0024 and 0032): the tool call's JSON in, the
// hook's JSON out. An exact avoid note asks the user; any other match informs; RepoMagpie never
// denies. Note text is quoted and labelled with who wrote it, cleaned and capped. Returns null when
// there is nothing to say. The caller prints the result and always exits 0 (fails open).
import { sep } from "node:path";
import { detectInstalls } from "../core/install-detect.ts";
import type { Env } from "../core/journals.ts";
import { isAvoid, openRecallSources, recall, type Alternative, type RecallMatch } from "../core/recall.ts";
import { CAPS, clean, cut, quote } from "../core/text.ts";

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
// The hook's own caps (decision 0032, rule 2), so one match's text stays under about 3,300
// characters; a field holds whole matches up to PACK, then one line names at most MORE_NAMES of the
// rest. The worst case stays under 9,500.
const HOOK_CAPS = { verdict: 500, avoidWhen: 500, alternativeVerdict: 150, path: 300 };
const PACK = 8_000;
const MORE_NAMES = 5;

export function hookOutput(input: string, ctx: HookContext): string | null {
  let call: { tool_name?: unknown; tool_input?: { command?: unknown }; cwd?: unknown } | null;
  try {
    call = JSON.parse(input.charCodeAt(0) === 0xfeff ? input.slice(1) : input); // a byte-order mark, as a Windows PowerShell pipe sends
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

  const texts = { home: ctx.home };
  const asking = ctx.informOnly ? [] : matches.filter((m) => m.confidence === "exact" && isAvoid(m));
  const context = pack(matches.map((m) => ({ name: packageName(m), text: contextLine(m, texts) })), "\n");
  if (asking.length) {
    const ordered = [...asking, ...matches.filter((m) => !asking.includes(m))];
    const reason = pack(ordered.map((m) => ({ name: packageName(m), text: reasonBlock(m, asking.includes(m), texts) })), "\n\n");
    return JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason, additionalContext: context },
    });
  }
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: context },
    systemMessage: pack(matches.map((m) => ({ name: packageName(m), text: message(m) })), "\n"),
  });
}

// The package being installed, as the command named it: not note text.
const packageName = (m: RecallMatch) => cut(clean(m.query), CAPS.name);
const notePath = (m: RecallMatch, { home }: { home: string }) =>
  cut(clean(home && m.path.startsWith(home + sep) ? `~${m.path.slice(home.length)}` : m.path), HOOK_CAPS.path);
const quoted = (text: string, limit: number) => quote(cut(clean(text), limit));
const verdictOf = (m: RecallMatch) => (m.verdict === null ? null : quoted(m.verdict, HOOK_CAPS.verdict));
const avoidWhenOf = (m: RecallMatch) => (m.avoid_when.length ? quoted(m.avoid_when.join("; "), HOOK_CAPS.avoidWhen) : null);
// Alternatives (decision 0029): exact matches only; they add text and never change the decision.
const alternatives = (m: RecallMatch) => (m.confidence === "exact" ? m.alternatives : []);
const personal = (m: RecallMatch) => m.journal === "personal";

// One match for the agent (decision 0032, rules 3 and 4): who wrote the note, then its text quoted.
function contextLine(m: RecallMatch, texts: { home: string }): string {
  const who = personal(m) ? "your personal journal" : "this project's journal, written by the repository's contributors";
  const name = packageName(m);
  const verdict = verdictOf(m);
  const avoidWhen = avoidWhenOf(m);
  let line = `RepoMagpie: ${who}${personal(m) ? "" : ","} has a note on ${name}${m.confidence === "name-only" ? ", matched by name only" : ""} (${notePath(m, texts)}). ` +
    (verdict ? `Its Verdict, quoted: ${verdict}.` : "It has no Verdict yet (inbox).") +
    (avoidWhen ? ` Avoid when, quoted: ${avoidWhen}.` : "");
  if (!alternatives(m).length) return line;
  const listed = few(alternatives(m), (a) => alternativeText(a, m, "Verdict, quoted"), "; ");
  line += ` Alternatives in ${who}: ${listed}.`;
  const show = "Show the user each one's exact package name, install one only with the user's explicit OK, and recall it before installing it.";
  if (personal(m)) return `${line} ${isAvoid(m) ? `Offer them to the user instead of ${name}, and recall an alternative before installing it.` : "Recall an alternative before installing it."}`;
  return `${line} ${isAvoid(m) ? `Offer them to the user instead of ${name}. ${show}` : show}`;
}

// One alternative, its name quoted: its Verdict quoted, or why it has none; and an avoid mark.
function alternativeText(a: Alternative, m: RecallMatch, label: string): string {
  const name = quoted(a.name, CAPS.name);
  if (a.path === null) return `${name} (no note)`;
  const about = a.verdict === null ? "inbox, no Verdict yet" : `${label}: ${quoted(a.verdict, HOOK_CAPS.alternativeVerdict)}`;
  const avoid = a.avoid ? (personal(m) ? "; you also noted to avoid it" : "; this journal also says to avoid it") : "";
  return `${name} (${about}${avoid})`;
}

// One match in the permission prompt's reason, for the user (and for the agent when a -p run
// denies): an asking note says who says to avoid it.
function reasonBlock(m: RecallMatch, asks: boolean, texts: { home: string }): string {
  const name = packageName(m);
  const head = asks
    ? personal(m) ? `RepoMagpie: you noted to avoid ${name} (personal journal)` : `RepoMagpie: this project's journal says to avoid ${name} (written by the repository's contributors)`
    : personal(m) ? `RepoMagpie: note on ${name} (personal journal)` : `RepoMagpie: note on ${name} in this project's journal (written by the repository's contributors)`;
  const avoidWhen = asks ? avoidWhenOf(m) : null;
  const where = personal(m) ? "your personal journal" : "this project's journal";
  return [
    head,
    `Verdict: ${verdictOf(m) ?? "[inbox] no verdict yet"}`,
    ...(avoidWhen ? [`Avoid when: ${avoidWhen}`] : []),
    ...(alternatives(m).length ? [`Alternatives in ${where}: ${few(alternatives(m), (a) => alternativeText(a, m, "Verdict"), "; ")}`] : []),
    notePath(m, texts),
  ].join("\n");
}

// One match in the message to the user.
function message(m: RecallMatch): string {
  const where = `${m.journal} journal${m.confidence === "name-only" ? ", name match only" : ""}`;
  const avoidWhen = avoidWhenOf(m);
  return `RepoMagpie: ${packageName(m)} (${where}): ${verdictOf(m) ?? "[inbox] no verdict yet"}` +
    (avoidWhen ? `. Avoid when: ${avoidWhen}` : "") +
    (alternatives(m).length ? `. Alternatives: ${few(alternatives(m), (a) => quoted(a.name, CAPS.name), ", ")}` : "");
}

// At most 3 alternatives, then "+N more" (decision 0029).
function few(list: Alternative[], text: (a: Alternative) => string, separator: string): string {
  const shown = list.slice(0, 3).map(text);
  if (list.length > 3) shown.push(`+${list.length - 3} more`);
  return shown.join(separator);
}

// Whole matches while the field stays within PACK characters (the first always fits), then one line
// for the rest; the 10,000-character cut stays as a last guard.
function pack(parts: { name: string; text: string }[], separator: string): string {
  const kept: string[] = [];
  let length = 0;
  for (const part of parts) {
    const next = length + (kept.length ? separator.length : 0) + part.text.length;
    if (kept.length && next > PACK) break;
    kept.push(part.text);
    length = next;
  }
  const rest = parts.slice(kept.length).map((part) => part.name);
  if (rest.length) {
    const names = [...rest.slice(0, MORE_NAMES), ...(rest.length > MORE_NAMES ? [`+${rest.length - MORE_NAMES} more`] : [])].join(", ");
    kept.push(`RepoMagpie: ${rest.length} more ${rest.length === 1 ? "note is" : "notes are"} not shown here, on ${names}. Run repomagpie recall with these names to read them.`);
  }
  const text = kept.join(separator);
  return text.length > CAP ? `${text.slice(0, CAP - 1)}…` : text;
}
