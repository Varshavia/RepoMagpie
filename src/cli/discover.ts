// repomagpie discover ["words"] (spec §2, decision 0045): the human output of core's runDiscover.
import { compactCount, journalSummary, licenceText } from "../core/discover-format.ts";
import { runDiscover, type DiscoverResult, type Sort } from "../core/discover.ts";
import type { FetchProblem } from "../core/github.ts";
import { exitCode } from "../core/outcome.ts";
import { clean } from "../core/text.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface DiscoverOptions extends GlobalOptions {
  domain?: string;
  kind?: string;
  topic?: string[];
  language?: string;
  minStars: number;
  updatedWithin: number;
  includeArchived?: boolean;
  sort: Sort;
  limit: number;
  page: number;
}

const WAITING: Partial<Record<FetchProblem["kind"], string>> = {
  "search-rate-limit": "GitHub's search limit is used up",
  "secondary-rate-limit": "GitHub's secondary rate limit stopped the request",
};

export async function discoverCommand(text: string | undefined, options: DiscoverOptions, io: Io): Promise<number> {
  const input = {
    text,
    domain: options.domain,
    kind: options.kind,
    topics: options.topic,
    language: options.language,
    minStars: options.minStars,
    updatedWithin: options.updatedWithin,
    includeArchived: options.includeArchived,
    sort: options.sort,
    limit: options.limit,
    page: options.page,
  };
  // A short rate limit is waited out once (decision 0045, rule 9); the human output says so first.
  // --json stays one document on stdout.
  const onWait = (seconds: number, problem: FetchProblem) =>
    io.err(`${WAITING[problem.kind] ?? "GitHub's rate limit is used up"}; waiting ${seconds} second${seconds === 1 ? "" : "s"}, then trying once more.\n`);
  const run = await runDiscover(input, contextOf(io, options), options.json ? {} : { onWait });
  if (options.json) {
    io.out(`${JSON.stringify(run.document)}\n`);
    return exitCode(run.outcome);
  }
  const { document } = run;
  for (const warning of document.warnings) io.err(`warning: ${clean(warning)}\n`);
  if (document.error) {
    io.err(`repomagpie discover: ${clean(document.error)}\n`);
    return exitCode(run.outcome);
  }
  if (document.approximate) io.err(`${document.approximate}\n`);
  if (document.cached) io.err("From the cache: GitHub answered this search in the last 10 minutes.\n");
  if (!document.results.length) {
    io.err("GitHub found no repositories for this search. Loosen it: fewer words, a lower --min-stars, --updated-within 0, or no --kind.\n");
    return 0;
  }
  for (const r of document.results) io.out(block(r, io.columns));
  const more = document.next_page ? ` More: the same command with --page ${document.next_page}.` : "";
  io.err(`${document.results.length} of ${compactCount(document.total)} on GitHub.${more}\n`);
  io.err(`Add one to your inbox: repomagpie note ${document.results[0].url}\n`);
  return 0;
}

// One result: the name and its numbers, then the description on one line, then what a journal has,
// one line each (journalSummary). GitHub's text is already cleaned by core; the description is cut
// to the terminal's width.
function block(r: DiscoverResult, columns: number | undefined): string {
  const kind = r.estimated_kind ? `${r.estimated_kind} (estimated)` : null;
  const head = [
    r.name,
    `⭐ ${compactCount(r.stars)}`,
    `${compactCount(r.forks)} forks`,
    r.updated ? `updated ${r.updated}` : null,
    licenceText(r.license),
    r.archived ? "archived" : null,
    kind,
    r.suggested_domains.length ? r.suggested_domains.join(", ") : null,
  ].filter(Boolean).join(" · ");
  const width = columns === undefined ? Infinity : Math.max(columns - 2, 20);
  const description = r.description ? `  ${r.description.length > width ? `${r.description.slice(0, width - 1)}…` : r.description}\n` : "";
  const journal = r.in_journal
    .map((j) => `  in ${j.journal === "personal" ? "your personal" : "the project"} journal, ${journalSummary(j)}\n`)
    .join("");
  return `${head}\n${description}${journal}`;
}
