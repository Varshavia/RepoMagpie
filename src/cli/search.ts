// magpie search <query> (spec §2, §5, §8): keyword search across both journals.
import { findProjectJournal, resolvePersonalJournal, samePath } from "../core/journals.ts";
import { searchJournals, type JournalSource, type SearchResult } from "../core/search.ts";
import { loadIndex } from "../core/search-index.ts";
import type { GlobalOptions } from "./note.ts";
import type { Io } from "./program.ts";

export interface SearchOptions extends GlobalOptions {
  tag?: string[];
  kind?: string;
  journal?: JournalSource["scope"];
  limit: number;
}

export async function searchCommand(query: string, options: SearchOptions, io: Io): Promise<number> {
  const json = Boolean(options.json);
  if (!query.trim()) {
    const error = "Give a search query, for example: magpie search pdf";
    if (json) io.out(`${JSON.stringify({ query, results: [], error })}\n`);
    else io.err(`magpie search: ${error}\n`);
    return 2;
  }

  const personal = resolvePersonalJournal({ home: io.home, env: io.env, cwd: io.cwd, flag: options.home });
  const project = findProjectJournal({ cwd: io.cwd, personalJournal: personal.path, flag: options.project });
  const sources: JournalSource[] = [];
  if (options.journal !== "project") sources.push({ scope: "personal", path: personal.path, index: loadIndex(personal.path).index });
  if (options.journal !== "personal" && project && !samePath(project, personal.path)) {
    sources.push({ scope: "project", path: project, index: loadIndex(project).index });
  }
  const all = searchJournals(sources, query, { limit: Infinity, tags: options.tag, kind: options.kind });
  const results = all.slice(0, options.limit);

  if (json) {
    io.out(`${JSON.stringify({ query, results })}\n`);
    return 0;
  }
  for (const warning of personal.warnings) io.err(`warning: ${warning}\n`);
  if (!results.length) {
    io.err(`No matches for "${query}".\n`);
    return 0;
  }
  for (const line of render(results, io)) io.out(`${line}\n`);
  if (all.length > results.length) io.err(`${results.length} of ${all.length} results. Use --limit to see more.\n`);
  return 0;
}

const INBOX = "[inbox]";

// One line per result: rank, name, PURL type, journal, then the Verdict (spec §8). In a terminal,
// lines are cut to its width, and [inbox] is coloured unless NO_COLOR is set.
function render(results: SearchResult[], io: Io): string[] {
  const color = io.columns !== undefined && !io.env.NO_COLOR;
  const rows = results.map((r, i) => {
    const lead = r.verdict === null ? `${INBOX} no verdict yet` : `${r.type === "skill" ? "Skill" : "Verdict"}: ${r.verdict}`;
    return [String(i + 1), r.skill ? `${r.name} › ${r.skill}` : r.name, r.id?.match(/^pkg:([^/]+)\//)?.[1] ?? "-", r.journal, lead];
  });
  const widths = [0, 1, 2, 3].map((column) => Math.max(...rows.map((row) => row[column].length)));
  return rows.map((row) => {
    const prefix = row.slice(0, 4).map((cell, column) => cell.padEnd(widths[column])).join("  ");
    const start = prefix.length + 2; // where the Verdict column starts
    let line = `${prefix}  ${row[4]}`;
    if (io.columns !== undefined && line.length > io.columns) line = `${line.slice(0, Math.max(io.columns - 1, 0))}…`;
    if (color && row[4].startsWith(INBOX) && line.length >= start + INBOX.length) {
      line = `${line.slice(0, start)}\u001b[33m${INBOX}\u001b[39m${line.slice(start + INBOX.length)}`;
    }
    return line;
  });
}
