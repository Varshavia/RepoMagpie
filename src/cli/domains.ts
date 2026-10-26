// repomagpie domains --suggest (decision 0040): the human output of core's suggestJournalDomains.
// In a terminal it shows the plan and asks first; with --json, --dry-run or no terminal it doesn't ask.
import { readablePurl } from "../core/identity.ts";
import { exitCode } from "../core/outcome.ts";
import { suggestJournalDomains, type DomainsSuggestJson } from "../core/domains-suggest.ts";
import type { Journal } from "../core/save.ts";
import { clean } from "../core/text.ts";
import { contextOf, plainIo, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface DomainsOptions extends GlobalOptions {
  suggest?: boolean;
  journal: Journal["scope"];
  dryRun?: boolean;
}

export async function domainsCommand(options: DomainsOptions, terminal: Io): Promise<number> {
  const io = plainIo(terminal);
  if (!options.suggest) {
    io.err("repomagpie domains: say what to do. For now there is one action: repomagpie domains --suggest [--dry-run]\n");
    return 2;
  }
  const place = contextOf(io, options);
  const suggest = (dryRun: boolean) => suggestJournalDomains({ journal: options.journal, dryRun }, place);
  if (options.json) {
    const run = suggest(Boolean(options.dryRun));
    io.out(`${JSON.stringify(run.document)}\n`);
    return exitCode(run.outcome);
  }
  const plan = suggest(true);
  list(plan.document, io);
  if (plan.document.error || !plan.document.notes.length) return exitCode(plan.outcome);
  if (options.dryRun) {
    io.err(`Would suggest domains for ${plural(plan.document.notes.length, "note")}. Dry run: nothing was written.\n`);
    return 0;
  }
  if (io.interactive) {
    const answer = (await io.ask(`Write these suggestions to ${plural(plan.document.notes.length, "note")}? (y/N) `)).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      io.err("Nothing was written.\n");
      return 0;
    }
  }
  const run = suggest(false);
  for (const skipped of run.document.skipped) if (!plan.document.skipped.some((s) => s.path === skipped.path)) io.err(`skipped ${clean(skipped.path)}: ${clean(skipped.reason)}\n`);
  if (run.document.error) io.err(`repomagpie domains: ${clean(run.document.error)}\n`);
  else io.err(`Suggested domains for ${plural(run.document.notes.length, "note")}. They stay marked as suggested until you confirm them.\n`);
  return exitCode(run.outcome);
}

// The plan: one line per note on stdout, skipped notes on stderr.
function list(document: DomainsSuggestJson, io: Io): void {
  for (const note of document.notes) io.out(`${clean(readablePurl(note.id))}: ${note.suggested.join(", ")}\n`);
  for (const skipped of document.skipped) io.err(`skipped ${clean(skipped.path)}: ${clean(skipped.reason)}\n`);
  if (document.error) io.err(`repomagpie domains: ${clean(document.error)}\n`);
  else if (!document.notes.length) io.err("No domains to suggest: every note has domains already, or tags and topics that name none.\n");
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;
