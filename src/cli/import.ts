// magpie import <file> (spec §2): reads the file, then prints core's runImport. One bad line never
// stops the rest.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readablePurl } from "../core/identity.ts";
import { noItemsHint } from "../core/import.ts";
import { exitCode } from "../core/outcome.ts";
import { importFailure, locateJournal, runImport, type Journal } from "../core/save.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface ImportOptions extends GlobalOptions {
  to: Journal["scope"];
  dryRun?: boolean;
}

export async function importCommand(file: string, options: ImportOptions, io: Io): Promise<number> {
  const json = Boolean(options.json);
  const print = (document: object) => io.out(`${JSON.stringify(document)}\n`);
  const stop = (error: string) => {
    if (json) print(importFailure(error));
    else io.err(`magpie import: ${error}\n`);
    return 1;
  };

  const context = contextOf(io, options);
  const journal = locateJournal(options.to, context); // a journal that can't be used fails before the file is read
  if (journal.error) return stop(journal.error);
  let text: string;
  try {
    text = readFileSync(resolve(io.cwd, file), "utf8");
  } catch (error) {
    return stop(`Can't read ${file}: ${(error as Error).message}`);
  }
  const run = await runImport({ text, to: options.to, dryRun: options.dryRun }, context);
  if (json) {
    print(run.document);
    return exitCode(run.outcome);
  }
  if (run.document.error) return stop(run.document.error);
  const { results } = run;
  if (!results.length) {
    io.err(`No items found in ${file}. ${noItemsHint(text)}\n`);
    return 0;
  }

  const count = (result: string) => results.filter((r) => r.result === result).length;
  for (const warning of run.journal.warnings) io.err(`warning: ${warning}\n`);
  for (const notice of run.notices) io.err(`${notice}\n`);
  for (const r of results) {
    io.out(`line ${r.line}: ${r.result} ${r.id ? readablePurl(r.id) : r.target}\n`);
    for (const warning of r.warnings) io.err(`line ${r.line}: warning: ${warning}\n`);
    if (r.error) io.err(`line ${r.line}: ${r.error}\n`);
  }
  if (options.dryRun) io.err("Dry run: nothing was written.\n");
  io.err(`${count("created")} created, ${count("updated")} updated, ${count("unchanged")} unchanged, ${count("failed")} failed.\n`);
  return exitCode(run.outcome);
}
