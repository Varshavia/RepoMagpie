// repomagpie catalog (spec §2, §8): the human output of core's runCatalog.
import { catalogForAgent, runCatalog, type CatalogRow } from "../core/catalog.ts";
import { exitCode } from "../core/outcome.ts";
import type { JournalSource } from "../core/search.ts";
import { clean } from "../core/text.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";
import { INBOX, renderRows } from "./results.ts";

export interface CatalogOptions extends GlobalOptions {
  tag?: string[];
  kind?: string;
  journal?: JournalSource["scope"];
  limit: number;
  cursor?: string;
}

export async function catalogCommand(options: CatalogOptions, io: Io): Promise<number> {
  const run = runCatalog({ limit: options.limit, cursor: options.cursor, tags: options.tag, kind: options.kind, journal: options.journal }, contextOf(io, options));
  if (options.json) {
    io.out(`${JSON.stringify(catalogForAgent(run.document))}\n`);
    return exitCode(run.outcome);
  }
  if (run.document.error) {
    io.err(`repomagpie catalog: ${run.document.error}\n`);
    return exitCode(run.outcome);
  }
  for (const warning of run.warnings) io.err(`warning: ${clean(warning)}\n`);
  const { notes, total, next_cursor } = run.document;
  if (!total) {
    io.err(options.tag?.length || options.kind || options.journal ? "No notes match these filters.\n" : "No notes.\n");
    return 0;
  }
  for (const line of renderRows(notes.map(row), io)) io.out(`${line}\n`);
  if (next_cursor) io.err(`${notes.length} of ${total} notes. Next page: repomagpie catalog${repeated(options)} --cursor ${next_cursor}\n`);
  return 0;
}

// Name, kind, journal, then the Verdict (spec §8).
function row(r: CatalogRow): string[] {
  return [r.name, r.kind ?? "-", r.journal, r.verdict === null ? `${INBOX} no verdict yet` : `Verdict: ${r.verdict}`];
}

// The flags the next page needs again: the filters and the limit.
function repeated(options: CatalogOptions): string {
  const flags = [
    ...(options.tag ?? []).flatMap((tag) => ["--tag", tag]),
    ...(options.kind ? ["--kind", options.kind] : []),
    ...(options.journal ? ["--journal", options.journal] : []),
    "--limit", String(options.limit),
  ];
  return flags.map((flag) => ` ${clean(flag)}`).join("");
}
