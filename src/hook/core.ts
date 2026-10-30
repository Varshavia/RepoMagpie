// The agent-neutral core of every hook adapter (spec §6, decisions 0024, 0032 and 0036): a shell
// command and its folder → package installs → notes → the texts. Each adapter reads its agent's
// input, calls recallFor, and writes its agent's output from the texts below. Note text is quoted
// and labelled with who wrote it, cleaned and capped.
import { sep } from "node:path";
import { detectCommand, type Install } from "../core/install-detect.ts";
import { usable, type Env } from "../core/journals.ts";
import { isAvoid, openRecallSources, recall, type Alternative, type RecallMatch } from "../core/recall.ts";
import { CAPS, clean, cut, nameConcern, quote } from "../core/text.ts";

export interface HookContext {
  env: Env;
  home: string;
  cwd: string; // used when the input has no folder
  informOnly: boolean; // --inform-only: never ask or deny (unattended runs)
  homeFlag?: string;
  projectFlag?: string;
}

// What one shell command recalled.
export interface Recalled {
  cwd: string; // the folder the command runs in
  matches: RecallMatch[];
  avoid: RecallMatch[]; // exact matches of avoid notes: these ask, or deny once; none with --inform-only
  stopped: Install[]; // the installs those notes are on (the retry record's key)
  unchecked: string | null; // a line naming the packages that weren't looked up
  home: string;
}

// A field's size: whole matches while it stays within `pack` characters, then one line names at
// most MORE_NAMES of the rest; `cap` is the last guard. Claude Code's limit for additionalContext
// and systemMessage is 10,000, so its worst case stays under 9,500. An agent with a lower limit
// passes its own.
export interface Limits {
  pack: number;
  cap: number;
}
const CLAUDE_CODE: Limits = { pack: 8_000, cap: 10_000 };
// The hook's own caps (decision 0032, rule 2), so one match's text stays under about 3,300
// characters.
const HOOK_CAPS = { verdict: 500, avoidWhen: 500, alternativeVerdict: 150, path: 300 };
const MORE_NAMES = 5;
// The packages one command may have looked up. Real installs name a few; a command of 100,000 names
// (1.8 MB) took 17 s on a 2,000-note journal, while the agent waits. The rest are named as unchecked.
const LOOKUPS = 100;

// The input as JSON, or undefined. A leading byte-order mark is dropped, as a Windows PowerShell
// pipe (and Cursor) sends one.
export function parseInput(input: string): unknown {
  try {
    return JSON.parse(input.charCodeAt(0) === 0xfeff ? input.slice(1) : input);
  } catch {
    return undefined;
  }
}

// The notes on the packages a command installs; null when there is nothing to say.
export function recallFor(command: string, folder: string | null, ctx: HookContext): Recalled | null {
  const { installs, unreadable } = detectCommand(command);
  // An encoded PowerShell command that can't be decoded may install anything: say so.
  const hidden = unreadable ? "RepoMagpie: this command runs an encoded PowerShell command that couldn't be read, so its installs weren't checked." : null;
  if (!installs.length) return hidden ? { cwd: ctx.cwd, matches: [], avoid: [], stopped: [], unchecked: hidden, home: ctx.home } : null; // the common case: no journal is opened

  const cwd = folder && usable(folder, ctx.cwd) ? folder : ctx.cwd;
  const { sources } = openRecallSources({ home: ctx.home, env: ctx.env, cwd, homeFlag: ctx.homeFlag, projectFlag: ctx.projectFlag });
  const seen = new Set<string>();
  const stopped: Install[] = [];
  const matches = installs.slice(0, LOOKUPS).flatMap((install) => {
    const found = recall(sources, install.name, [install.type]);
    if (!ctx.informOnly && found.some((m) => m.confidence === "exact" && isAvoid(m))) stopped.push(install);
    return found;
  }).filter((m) => !seen.has(m.path) && seen.add(m.path));
  const many = installs.length > LOOKUPS
    ? `RepoMagpie: this command installs ${installs.length.toLocaleString("en-US")} packages; only the first ${LOOKUPS} were looked up in your journals.`
    : null;
  // A note over 256 KB isn't read (decision 0032 rule 6), so its Verdict is unknown: say so
  // rather than nothing. The paths are note files, so quoted text, never the hook's own words.
  const tooBig = sources.flatMap((s) => s.tooBig ?? []);
  const unread = tooBig.length
    ? `RepoMagpie: ${tooBig.length === 1 ? "a note file in your journals is" : `${tooBig.length} note files in your journals are`} over 256 KB, so ${tooBig.length === 1 ? "it wasn't" : "they weren't"} read; ${tooBig.length === 1 ? "it" : "one"} may be a note on this package: ${shortList(tooBig.map((path) => quote(cut(tilde(path, ctx.home), HOOK_CAPS.path))))}.`
    : null;
  const unchecked = [many, hidden, unread].filter(Boolean).join("\n") || null;
  if (!matches.length && !unchecked) return null;
  const avoid = ctx.informOnly ? [] : matches.filter((m) => m.confidence === "exact" && isAvoid(m));
  return { cwd, matches, avoid, stopped, unchecked, home: ctx.home };
}

// The check for a folder from the agent's input, shared with doctor and the MCP server.
export { usable };

const withUnchecked = (r: Recalled, text: string, separator: string) => [text, r.unchecked].filter(Boolean).join(separator);

// For the agent: one line per match.
export const agentContext = (r: Recalled, limits = CLAUDE_CODE): string =>
  withUnchecked(r, pack(r.matches.map((m) => ({ name: packageName(m), text: contextLine(m, r) })), "\n", limits), "\n");

// For the user: one short line per match.
export const userMessage = (r: Recalled, limits = CLAUDE_CODE): string =>
  withUnchecked(r, pack(r.matches.map((m) => ({ name: packageName(m), text: message(m) })), "\n", limits), "\n");

// For a permission prompt: the avoid notes first, each saying who says to avoid it, then the rest.
export const askReason = (r: Recalled, limits = CLAUDE_CODE): string => withUnchecked(r, reasonBlocks(r, limits), "\n\n");

// The prompt's blocks, for the deny reason too (deny.ts).
export const reasonBlocks = (r: Recalled, limits: Limits) =>
  pack([...r.avoid, ...r.matches.filter((m) => !r.avoid.includes(m))].map((m) => ({ name: packageName(m), text: reasonBlock(m, r.avoid.includes(m), r) })), "\n\n", limits);

// At most MORE_NAMES items, then "+N more".
export const shortList = (items: string[], separator = ", ") =>
  [...items.slice(0, MORE_NAMES), ...(items.length > MORE_NAMES ? [`+${items.length - MORE_NAMES} more`] : [])].join(separator);

// The package being installed, as the command named it: not note text.
export const packageName = (m: RecallMatch) => cut(clean(m.query), CAPS.name);
const tilde = (path: string, home: string) => (home && path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path);
// A project note's path is quoted: its file name is the repository's text (decision 0032 rule 3).
const notePath = (m: RecallMatch, { home }: { home: string }) => {
  const path = cut(clean(tilde(m.path, home)), HOOK_CAPS.path);
  return personal(m) ? path : quote(path);
};
const quoted = (text: string, limit: number) => quote(cut(clean(text), limit));
const verdictOf = (m: RecallMatch) => (m.verdict === null ? null : quoted(m.verdict, HOOK_CAPS.verdict));
const avoidWhenOf = (m: RecallMatch) => (m.avoid_when.length ? quoted(m.avoid_when.join("; "), HOOK_CAPS.avoidWhen) : null);
// Alternatives (decision 0029): exact matches only; they add text and never change the decision.
const alternatives = (m: RecallMatch) => (m.confidence === "exact" ? m.alternatives : []);
export const personal = (m: RecallMatch) => m.journal === "personal";

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

// One alternative, its name quoted: its Verdict quoted, or why it has none; an avoid mark; and a
// name that can't be the package it seems (non-ASCII letters, or no valid package name).
function alternativeText(a: Alternative, m: RecallMatch, label: string): string {
  const name = quoted(a.name, CAPS.name);
  const concern = nameConcern(a.name, a.path === null);
  const flag = concern === "non-ascii" ? "; its name has non-ASCII letters, which can look like others" : concern === "invalid" ? "; its name isn't a valid package name" : "";
  if (a.path === null) return `${name} (no note${flag})`;
  const about = a.verdict === null ? "inbox, no Verdict yet" : `${label}: ${quoted(a.verdict, HOOK_CAPS.alternativeVerdict)}`;
  const avoid = a.avoid ? (personal(m) ? "; you also noted to avoid it" : "; this journal also says to avoid it") : "";
  return `${name} (${about}${avoid}${flag})`;
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

// Whole matches while the field stays within limits.pack characters (the first always fits), then
// one line for the rest; the cut at limits.cap stays as a last guard.
function pack(parts: { name: string; text: string }[], separator: string, limits: Limits): string {
  const kept: string[] = [];
  let length = 0;
  for (const part of parts) {
    const next = length + (kept.length ? separator.length : 0) + part.text.length;
    if (kept.length && next > limits.pack) break;
    kept.push(part.text);
    length = next;
  }
  const rest = parts.slice(kept.length).map((part) => part.name);
  if (rest.length) {
    kept.push(`RepoMagpie: ${rest.length} more ${rest.length === 1 ? "note is" : "notes are"} not shown here, on ${shortList(rest)}. Run repomagpie recall with these names to read them.`);
  }
  const text = kept.join(separator);
  return text.length > limits.cap ? `${text.slice(0, limits.cap - 1)}…` : text;
}
