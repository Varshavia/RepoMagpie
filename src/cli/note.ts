// magpie note <name-or-url> ["text"] (spec §2): the human output of core's runNote.
import { exitCode } from "../core/outcome.ts";
import { runNote, type Journal } from "../core/save.ts";
import type { PackageType } from "../core/identity.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface NoteOptions extends GlobalOptions {
  type?: PackageType;
  to: Journal["scope"];
  alternative?: string[];
}

export async function noteCommand(target: string, text: string | undefined, options: NoteOptions, io: Io): Promise<number> {
  const json = Boolean(options.json);
  const ask = io.interactive && !json ? io.ask : undefined;
  const request = { target, text, type: options.type, to: options.to, alternatives: options.alternative };
  const run = await runNote(request, contextOf(io, options), ask);
  if (json) {
    io.out(`${JSON.stringify(run.document)}\n`);
    return exitCode(run.outcome);
  }

  const { journal, saved: r } = run;
  if (!r) {
    io.err(`magpie note: ${run.document.error}\n`);
    return exitCode(run.outcome);
  }
  for (const warning of [...journal.warnings, ...r.warnings]) io.err(`warning: ${warning}\n`);
  for (const notice of r.notices) io.err(`${notice}\n`);
  for (const target of r.alternatives.present) io.err(`Already an alternative: ${target}\n`);
  const where = journal.scope === "personal" ? "your personal journal" : "the project journal";
  const name = r.name ?? r.id;
  if (r.result === "created") io.err(`✔ Saved to ${where}: ${name}\n`);
  else if (r.result === "updated") io.err(`✔ Updated in ${where}: ${name}\n`);
  else if (r.result === "unchanged") io.err(`Already in ${where}: ${name}\n`);
  else io.err(`magpie note: ${r.error}\n`);
  if (r.tagsMdAdded.length) io.err(`Added to tags.md: ${r.tagsMdAdded.join(", ")}\n`);
  if (r.path) io.out(`${r.path}\n`);
  return exitCode(run.outcome);
}
