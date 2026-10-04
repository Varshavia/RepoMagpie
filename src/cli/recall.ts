// magpie recall <package...> (spec §2, §5, §8): the notes for packages before an install.
import { readFileSync } from "node:fs";
import { sep } from "node:path";
import { findManifests } from "../core/journals.ts";
import { manifestTypes, type PackageType } from "../core/identity.ts";
import { DRAFT_MARKER, readNote } from "../core/note.ts";
import { openRecallSources, recall, type RecallMatch } from "../core/recall.ts";
import type { GlobalOptions } from "./note.ts";
import type { Io } from "./program.ts";

export interface RecallOptions extends GlobalOptions {
  type?: PackageType;
  full?: boolean;
}

const ALL_TYPES: PackageType[] = ["npm", "pypi", "cargo"];

export async function recallCommand(queries: string[], options: RecallOptions, io: Io): Promise<number> {
  // A bare name's type: --type, else the nearest manifest; unsettled means every type (spec §2).
  const fromManifests = manifestTypes(findManifests(io.cwd));
  const types = options.type ? [options.type] : fromManifests.length ? fromManifests : ALL_TYPES;
  const { sources, warnings } = openRecallSources({ home: io.home, env: io.env, cwd: io.cwd, homeFlag: options.home, projectFlag: options.project });
  const results = queries.map((query) => ({ query, matches: recall(sources, query, types) }));

  if (options.json) {
    const matches = results.flatMap((r) => r.matches).map(({ name: _name, ...match }) => match);
    io.out(`${JSON.stringify({ matches })}\n`);
    return 0;
  }
  for (const warning of warnings) io.err(`warning: ${warning}\n`);
  const color = io.columns !== undefined && !io.env.NO_COLOR;
  const cards = results.flatMap((r) => r.matches).map((m) => card(m, io.home, color, Boolean(options.full)));
  if (cards.length) io.out(`${cards.join("\n\n")}\n`);
  for (const r of results) if (!r.matches.length) io.err(`No note for ${r.query}.\n`);
  return 0;
}

const paint = (on: boolean, code: number, text: string) => (on ? `\u001b[${code}m${text}\u001b[39m` : text);

// The recall card (spec §8): name · type · journal, Verdict, Avoid when, Use when, path. By default
// one item per list with a count of the rest; --full shows every section that has text.
function card(m: RecallMatch, home: string, color: boolean, full: boolean): string {
  const type = m.id.match(/^pkg:([^/]+)\//)?.[1] ?? "-";
  const title = `${m.name} · ${type} · ${m.journal} journal${m.confidence === "name-only" ? " (name match only)" : ""}`;
  const verdict = m.verdict ?? `${paint(color, 33, "[inbox]")} no verdict yet`;
  const path = home && m.path.startsWith(home + sep) ? `~${m.path.slice(home.length)}` : m.path;
  if (full) return [title, ...fullSections(m, color), `  ${path}`].join("\n");

  const label = (name: string) => paint(color && name === "Avoid when", 31, name) + " ".repeat(13 - name.length);
  const list = (name: string, items: string[], draft: boolean) =>
    items.length ? [`  ${label(name)}${draft ? "(draft) " : ""}${items[0]}${items.length > 1 ? ` (+${items.length - 1} more)` : ""}`] : [];
  return [
    title,
    `  ${label("Verdict")}${verdict}`,
    ...list("Avoid when", m.avoid_when, m.drafts.includes("avoid_when")),
    ...list("Use when", m.use_when, m.drafts.includes("use_when")),
    `  ${path}`,
  ].join("\n");
}

// Every section of the note with text, in the file's order: the label, then its lines.
function fullSections(m: RecallMatch, color: boolean): string[] {
  let text: string;
  try {
    text = readFileSync(m.path, "utf8");
  } catch {
    return [];
  }
  const width = 16;
  return readNote(text).sections.flatMap((section) => {
    const body = section.body.replace(/<!--[\s\S]*?-->/g, "").replace(DRAFT_MARKER, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      .map((line) => line.replace(/^[-*+]\s+/, ""));
    if (section.name === "Verdict" && !body.length) body.push(`${paint(color, 33, "[inbox]")} no verdict yet`);
    if (!body.length) return [];
    const name = section.heading;
    const head = `  ${paint(color && name === "Avoid when", 31, name)}${" ".repeat(Math.max(width - name.length, 1))}${section.draft ? "(draft) " : ""}`;
    return [head + body[0], ...body.slice(1).map((line) => `  ${" ".repeat(Math.max(width, name.length + 1))}${line}`)];
  });
}
