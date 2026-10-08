// magpie suggest ["description"] (spec §2, §5, §8): the human output of core's runSuggest.
import { exitCode } from "../core/outcome.ts";
import type { JournalSource } from "../core/search.ts";
import { runSuggest, type Candidate, type SuggestJson } from "../core/suggest.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";
import { INBOX, purlType, renderRows } from "./results.ts";

export interface SuggestOptions extends GlobalOptions {
  journal?: JournalSource["scope"];
  limit: number;
}

const verdictLine = (verdict: string | null) => (verdict === null ? `${INBOX} no verdict yet` : `Verdict: ${verdict}`);

// Why a note is a candidate: the dependencies it matched, then the other keywords it matched.
export function whyLine(why: Candidate["why"]): string {
  const covered = new Set(why.dependencies.flatMap((name) => name.toLowerCase().split(/[^a-z0-9]+/)));
  const words = why.keywords.filter((k) => !covered.has(k));
  const parts = [];
  if (why.dependencies.length) parts.push(`${why.dependencies.length === 1 ? "dependency" : "dependencies"} ${why.dependencies.join(", ")}`);
  if (words.length) parts.push(`matched ${words.join(", ")}`);
  return `Why: ${parts.join("; ")}`;
}

// An in-use avoid note's alternatives, by name: at most 3, then +N more (decision 0029). A name-only
// match names none: its note is on another package.
function insteadLine(m: SuggestJson["in_use_avoid"][number]): string[] {
  if (m.confidence !== "exact" || !m.alternatives.length) return [];
  const names = m.alternatives.slice(0, 3).map((a) => a.name);
  if (m.alternatives.length > 3) names.push(`+${m.alternatives.length - 3} more`);
  return [`Instead: ${names.join(", ")}`];
}

export async function suggestCommand(description: string | undefined, options: SuggestOptions, io: Io): Promise<number> {
  const run = runSuggest({ description, limit: options.limit, journal: options.journal }, contextOf(io, options));
  if (options.json) {
    io.out(`${JSON.stringify(run.document)}\n`);
    return exitCode(run.outcome);
  }
  for (const warning of run.warnings) io.err(`warning: ${warning}\n`);
  if (run.document.error) {
    io.err(`magpie suggest: ${run.document.error}\n`);
    return exitCode(run.outcome);
  }

  const { candidates, in_use_avoid: avoid, keywords } = run.document;
  const lines = renderRows(candidates.map((c, i) => [String(i + 1), c.name, purlType(c.id), c.journal, verdictLine(c.verdict)]), io, candidates.map((c) => [whyLine(c.why)]));
  if (avoid.length) {
    if (lines.length) lines.push("");
    lines.push("Already in use, you noted to avoid:");
    lines.push(...renderRows(avoid.map((m, i) => {
      const name = `${run.in_use_names[i]}${m.confidence === "name-only" ? " (name match only)" : ""}`;
      return ["", name, purlType(m.id), m.journal, verdictLine(m.verdict)];
    }), io, avoid.map(insteadLine)));
  }
  if (lines.length) io.out(`${lines.join("\n")}\n`);

  if (!candidates.length) io.err(`No notes match: ${keywords.join(", ")}.\n`);
  else if (run.total > candidates.length) io.err(`${candidates.length} of ${run.total} candidates. Your coding agent picks the fit; use --limit to see more.\n`);
  else io.err(`${candidates.length} candidate${candidates.length === 1 ? "" : "s"}. Your coding agent picks the fit.\n`);
  return 0;
}
