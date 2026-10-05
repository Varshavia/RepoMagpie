// magpie search <query> (spec §2, §5, §8): the human output of core's runSearch.
import { exitCode } from "../core/outcome.ts";
import { runSearch, type JournalSource, type SearchResult } from "../core/search.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface SearchOptions extends GlobalOptions {
  tag?: string[];
  kind?: string;
  journal?: JournalSource["scope"];
  limit: number;
}

export async function searchCommand(query: string, options: SearchOptions, io: Io): Promise<number> {
  const run = runSearch({ query, tags: options.tag, kind: options.kind, journal: options.journal, limit: options.limit }, contextOf(io, options));
  if (options.json) {
    io.out(`${JSON.stringify(run.document)}\n`);
    return exitCode(run.outcome);
  }
  if (run.document.error) {
    io.err(`magpie search: ${run.document.error}\n`);
    return exitCode(run.outcome);
  }
  const { results } = run.document;
  for (const warning of run.warnings) io.err(`warning: ${warning}\n`);
  if (!results.length) {
    io.err(`No matches for "${query}".\n`);
    return 0;
  }
  for (const line of render(results, io)) io.out(`${line}\n`);
  if (run.total > results.length) io.err(`${results.length} of ${run.total} results. Use --limit to see more.\n`);
  return 0;
}

const INBOX = "[inbox]";

// Rank, name, PURL type, journal, then the Verdict (spec §8). Piped: one line per result, nothing
// cut. In a terminal: the metadata line is cut to its width, and the Verdict follows on its own
// lines, indented under the name and wrapped, never cut; [inbox] is coloured unless NO_COLOR is set.
function render(results: SearchResult[], io: Io): string[] {
  const rows = results.map((r, i) => {
    const lead = r.verdict === null ? `${INBOX} no verdict yet` : `${r.type === "skill" ? "Skill" : "Verdict"}: ${r.verdict}`;
    return [String(i + 1), r.skill ? `${r.name} › ${r.skill}` : r.name, r.id?.match(/^pkg:([^/]+)\//)?.[1] ?? "-", r.journal, lead];
  });
  const widths = [0, 1, 2, 3].map((column) => Math.max(...rows.map((row) => row[column].length)));
  const metadata = (row: string[]) => row.slice(0, 4).map((cell, column) => cell.padEnd(widths[column])).join("  ");
  if (io.columns === undefined) return rows.map((row) => `${metadata(row)}  ${row[4]}`);

  const columns = io.columns;
  const color = !io.env.NO_COLOR;
  const indent = " ".repeat(widths[0] + 2);
  return rows.flatMap((row) => {
    let line = metadata(row).trimEnd();
    if (line.length > columns) line = `${line.slice(0, Math.max(columns - 1, 0))}…`;
    const lead = wrap(row[4], Math.max(columns - indent.length, 1)).map((part) => indent + part);
    if (color && row[4].startsWith(INBOX)) lead[0] = lead[0].replace(INBOX, `\u001b[33m${INBOX}\u001b[39m`);
    return [line, ...lead];
  });
}

// Splits text into lines of at most `width` characters at spaces; a longer word is broken.
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length <= width) {
      line += ` ${word}`;
      continue;
    }
    if (line) lines.push(line);
    while (word.length > width) {
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    line = word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
