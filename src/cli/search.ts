// magpie search <query> (spec §2, §5, §8): the human output of core's runSearch.
import { exitCode } from "../core/outcome.ts";
import { runSearch, searchForAgent, type JournalSource, type Match, type SearchResult } from "../core/search.ts";
import { clean } from "../core/text.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";
import { INBOX, purlType, renderRows } from "./results.ts";

export interface SearchOptions extends GlobalOptions {
  tag?: string[];
  domain?: string[];
  match?: Match;
  kind?: string;
  journal?: JournalSource["scope"];
  limit: number;
}

export async function searchCommand(query: string, options: SearchOptions, io: Io): Promise<number> {
  const run = runSearch({ query, tags: options.tag, domains: options.domain, match: options.match, kind: options.kind, journal: options.journal, limit: options.limit }, contextOf(io, options));
  if (options.json) {
    io.out(`${JSON.stringify(searchForAgent(run.document))}\n`);
    return exitCode(run.outcome);
  }
  if (run.document.error) {
    io.err(`repomagpie search: ${run.document.error}\n`);
    return exitCode(run.outcome);
  }
  const { results } = run.document;
  for (const warning of run.warnings) io.err(`warning: ${clean(warning)}\n`);
  if (!results.length) {
    io.err(`No matches for "${query}".\n`);
    return 0;
  }
  for (const line of renderRows(results.map(row), io)) io.out(`${line}\n`);
  if (run.total > results.length) io.err(`${results.length} of ${run.total} results. Use --limit to see more.\n`);
  return 0;
}

// Rank, name, PURL type, journal, then the Verdict (spec §8).
function row(r: SearchResult, i: number): string[] {
  const lead = r.verdict === null ? `${INBOX} no verdict yet` : `${r.type === "skill" ? "Skill" : "Verdict"}: ${r.verdict}`;
  return [String(i + 1), r.skill ? `${r.name} › ${r.skill}` : r.name, purlType(r.id), r.journal, lead];
}
