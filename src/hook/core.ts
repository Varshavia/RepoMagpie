// The agent-neutral core of every hook adapter (spec §6, decisions 0024, 0032 and 0036): a shell
// command and its folder → package installs → notes → the texts. Each adapter reads its agent's
// input, calls recallFor, and writes its agent's output from the texts below. Note text is quoted
// and labelled with who wrote it, cleaned and capped.
import { sep } from "node:path";
import { detectInstalls, type Install } from "../core/install-detect.ts";
import { resolvePersonalJournal, type Env } from "../core/journals.ts";
import { isAvoid, openRecallSources, recall, type Alternative, type RecallMatch } from "../core/recall.ts";
import { CAPS, clean, cut, nameConcern, quote } from "../core/text.ts";
import { retryDecision, retryKey } from "./retry.ts";

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
  const installs = detectInstalls(command);
  if (!installs.length) return null; // the common case: no journal is opened

  const cwd = folder ?? ctx.cwd;
  const { sources } = openRecallSources({ home: ctx.home, env: ctx.env, cwd, homeFlag: ctx.homeFlag, projectFlag: ctx.projectFlag });
  const seen = new Set<string>();
  const stopped: Install[] = [];
  const matches = installs.slice(0, LOOKUPS).flatMap((install) => {
    const found = recall(sources, install.name, [install.type]);
    if (!ctx.informOnly && found.some((m) => m.confidence === "exact" && isAvoid(m))) stopped.push(install);
    return found;
  }).filter((m) => !seen.has(m.path) && seen.add(m.path));
  const unchecked = installs.length > LOOKUPS
    ? `RepoMagpie: this command installs ${installs.length.toLocaleString("en-US")} packages; only the first ${LOOKUPS} were looked up in your journals.`
    : null;
  if (!matches.length && !unchecked) return null;
  const avoid = ctx.informOnly ? [] : matches.filter((m) => m.confidence === "exact" && isAvoid(m));
  return { cwd, matches, avoid, stopped, unchecked, home: ctx.home };
}

const withUnchecked = (r: Recalled, text: string, separator: string) => [text, r.unchecked].filter(Boolean).join(separator);

// For the agent: one line per match.
export const agentContext = (r: Recalled, limits = CLAUDE_CODE): string =>
  withUnchecked(r, pack(r.matches.map((m) => ({ name: packageName(m), text: contextLine(m, r) })), "\n", limits), "\n");

// For the user: one short line per match.
export const userMessage = (r: Recalled, limits = CLAUDE_CODE): string =>
  withUnchecked(r, pack(r.matches.map((m) => ({ name: packageName(m), text: message(m) })), "\n", limits), "\n");

// For a permission prompt: the avoid notes first, each saying who says to avoid it, then the rest.
export const askReason = (r: Recalled, limits = CLAUDE_CODE): string => withUnchecked(r, reasonBlocks(r, limits), "\n\n");

const reasonBlocks = (r: Recalled, limits: Limits) =>
  pack([...r.avoid, ...r.matches.filter((m) => !r.avoid.includes(m))].map((m) => ({ name: packageName(m), text: reasonBlock(m, r.avoid.includes(m), r) })), "\n\n", limits);

// For the agent, when a hook that can't ask denies the first try (decision 0036): the notes as in a
// prompt, then the hook's own advice, which always fits.
export function denyReason(r: Recalled, limits: Limits): string {
  const several = r.stopped.length > 1;
  const advice = `RepoMagpie: this install was stopped once. Show the user ${r.avoid.length > 1 ? "these notes" : "this note"} and ask whether to install anyway or use an alternative; ` +
    `don't install ${several ? "them" : "it"} again without the user's OK. If the user says to go ahead, install the same ${several ? "packages" : "package"} again within 10 minutes: ` +
    `RepoMagpie lets ${several ? "them" : "it"} through until then.`;
  const tail = [r.unchecked, advice].filter(Boolean).join("\n\n");
  return `${reasonBlocks(r, { pack: limits.pack, cap: limits.cap - tail.length - 2 })}\n\n${tail}`;
}

// For the user, when the first try is denied: what was stopped and who says to avoid it.
export function stoppedLine(r: Recalled): string {
  const names = shortList(r.stopped.map((install) => cut(clean(install.name), CAPS.name)));
  const why = shortList(r.avoid.map((m) => (personal(m) ? `you noted to avoid ${packageName(m)}` : `this project's journal says to avoid ${packageName(m)}`)), "; ");
  return `RepoMagpie: stopped installing ${names}: ${why}. Your agent should ask you; the same install goes through for the next 10 minutes.`;
}

const shortList = (items: string[], separator = ", ") =>
  [...items.slice(0, MORE_NAMES), ...(items.length > MORE_NAMES ? [`+${items.length - MORE_NAMES} more`] : [])].join(separator);

// Where the agent can't ask (decision 0036): "deny" the first try of an install an avoid note is
// on, and record it; "inform" for the same install until 10 minutes after that deny, and when the
// retry record can't be read or written (a deny without a record would stop the retry too).
export function retryAnswer(r: Recalled, agent: string, ctx: HookContext, now = Date.now()): "deny" | "inform" {
  if (!r.avoid.length) return "inform";
  const journal = resolvePersonalJournal({ home: ctx.home, env: ctx.env, cwd: ctx.cwd, flag: ctx.homeFlag }).path;
  return retryDecision(journal, retryKey(agent, r.cwd, r.stopped), now) === "deny" ? "deny" : "inform";
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
