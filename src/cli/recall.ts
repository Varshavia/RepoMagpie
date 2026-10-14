// magpie recall <package...> (spec §2, §5, §8): the notes for packages before an install.
import { readFileSync } from "node:fs";
import { sep } from "node:path";
import type { PackageType } from "../core/identity.ts";
import { DRAFT_MARKER, readNote } from "../core/note.ts";
import { runRecall, type Alternative, type RecallMatch } from "../core/recall.ts";
import { clean, cleanAll, nameConcern } from "../core/text.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface RecallOptions extends GlobalOptions {
  type?: PackageType;
  full?: boolean;
}

export async function recallCommand(queries: string[], options: RecallOptions, io: Io): Promise<number> {
  const { document, results, warnings } = runRecall(queries, options.type, contextOf(io, options));
  if (options.json) {
    io.out(`${JSON.stringify(document)}\n`);
    return 0;
  }
  for (const warning of warnings) io.err(`warning: ${clean(warning)}\n`);
  const color = io.columns !== undefined && !io.env.NO_COLOR;
  // Note text reaches the terminal cleaned, never cut: the Verdict is never cut (decision 0032).
  const cards = results.flatMap((r) => r.matches).map((m) => card(cleanAll(m), { home: io.home, color, full: Boolean(options.full), piped: io.columns === undefined }));
  if (cards.length) io.out(`${cards.join("\n\n")}\n`);
  for (const r of results) if (!r.matches.length) io.err(`No note for ${clean(r.query)}.\n`);
  return 0;
}

const paint = (on: boolean, code: number, text: string) => (on ? `\u001b[${code}m${text}\u001b[39m` : text);

interface CardOptions {
  home: string;
  color: boolean;
  full: boolean;
  piped: boolean;
}

// The recall card (spec §8): name · type · journal, Verdict, Avoid when, Alternatives, Use when, path.
// By default one item per list with a count of the rest, and at most 3 alternatives; --full shows
// every section that has text and every alternative.
function card(m: RecallMatch, options: CardOptions): string {
  const { home, color, full } = options;
  const type = m.id.match(/^pkg:([^/]+)\//)?.[1] ?? "-";
  const title = `${m.name} · ${type} · ${m.journal} journal${m.confidence === "name-only" ? " (name match only)" : ""}`;
  const verdict = m.verdict ?? `${paint(color, 33, "[inbox]")} no verdict yet`;
  const path = home && m.path.startsWith(home + sep) ? `~${m.path.slice(home.length)}` : m.path;
  if (full) return [title, ...fullSections(m, options), `  ${path}`].join("\n");

  const width = 14;
  const label = (name: string) => paint(color && name === "Avoid when", 31, name) + " ".repeat(width - name.length);
  const list = (name: string, items: string[], draft: boolean) =>
    items.length ? [`  ${label(name)}${draft ? "(draft) " : ""}${items[0]}${items.length > 1 ? ` (+${items.length - 1} more)` : ""}`] : [];
  return [
    title,
    `  ${label("Verdict")}${verdict}`,
    ...list("Avoid when", m.avoid_when, m.drafts.includes("avoid_when")),
    ...alternativeLines(m, options, label("Alternatives"), width),
    ...list("Use when", m.use_when, m.drafts.includes("use_when")),
    `  ${path}`,
  ].join("\n");
}

// The Alternatives row (decision 0029): in a terminal one alternative per line, under the first;
// piped, one line with them separated by "; " (spec §8). Without --full, 3 and a count of the rest.
function alternativeLines(m: RecallMatch, options: CardOptions, head: string, width: number): string[] {
  if (!m.alternatives.length) return [];
  const shown = options.full ? m.alternatives : m.alternatives.slice(0, 3);
  const items = shown.map((a) => alternativeText(a, options.color));
  if (shown.length < m.alternatives.length) items.push(`+${m.alternatives.length - shown.length} more (repomagpie recall ${m.query} --full)`);
  if (options.piped) return [`  ${head}${items.join("; ")}`];
  return [`  ${head}${items[0]}`, ...items.slice(1).map((item) => `  ${" ".repeat(width)}${item}`)];
}

// One alternative: its name and Verdict (or [inbox]), and whether it is noted to avoid too. One
// without a note in the journal is its name alone.
function alternativeText(a: Alternative, color: boolean): string {
  const concern = nameConcern(a.name, a.path === null);
  const name = `${a.name}${concern === "non-ascii" ? " (non-ASCII letters)" : concern === "invalid" ? " (not a valid package name)" : ""}`;
  if (a.path === null) return name;
  return `${name}: ${a.verdict ?? `${paint(color, 33, "[inbox]")} no verdict yet`}${a.avoid ? " (you also noted to avoid it)" : ""}`;
}

// Every section of the note with text, in the file's order: the label, then its lines. The
// alternatives follow Avoid when, or the Verdict when Avoid when is empty.
function fullSections(m: RecallMatch, options: CardOptions): string[] {
  let text: string;
  try {
    text = readFileSync(m.path, "utf8");
  } catch {
    return [];
  }
  const { color } = options;
  const width = 16;
  const blocks = readNote(text).sections.map((section) => {
    const body = section.body.replace(/<!--[\s\S]*?-->/g, "").replace(DRAFT_MARKER, "").split(/\r?\n/).map((line) => clean(line).trim()).filter(Boolean)
      .map((line) => line.replace(/^[-*+]\s+/, ""));
    if (section.name === "Verdict" && !body.length) body.push(`${paint(color, 33, "[inbox]")} no verdict yet`);
    if (!body.length) return { name: section.name, lines: [] };
    const name = clean(section.heading);
    const head = `  ${paint(color && name === "Avoid when", 31, name)}${" ".repeat(Math.max(width - name.length, 1))}${section.draft ? "(draft) " : ""}`;
    return { name: section.name, lines: [head + body[0], ...body.slice(1).map((line) => `  ${" ".repeat(Math.max(width, name.length + 1))}${line}`)] };
  });
  const after = blocks.findIndex((b) => b.name === "Avoid when" && b.lines.length);
  const at = (after === -1 ? blocks.findIndex((b) => b.name === "Verdict") : after) + 1;
  blocks.splice(at, 0, { name: null, lines: alternativeLines(m, options, "Alternatives" + " ".repeat(width - "Alternatives".length), width) });
  return blocks.flatMap((b) => b.lines);
}
