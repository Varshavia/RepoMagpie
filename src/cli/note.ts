// magpie note <name-or-url> ["text"] (spec §2): the human output of core's runNote.
import { exitCode } from "../core/outcome.ts";
import { runNote, type Journal } from "../core/save.ts";
import type { PackageType } from "../core/identity.ts";
import { contextOf, plainIo, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface NoteOptions extends GlobalOptions {
  type?: PackageType;
  to: Journal["scope"];
  alternative?: string[];
  useWhen?: string[];
  avoidWhen?: string[];
  domain?: string[];
}

export async function noteCommand(target: string, text: string | undefined, options: NoteOptions, terminal: Io): Promise<number> {
  const io = plainIo(terminal);
  const json = Boolean(options.json);
  const ask = io.interactive && !json ? io.ask : undefined;
  const request = { target, text, type: options.type, to: options.to, alternatives: options.alternative, useWhen: options.useWhen, avoidWhen: options.avoidWhen, domains: options.domain };
  const run = await runNote(request, contextOf(io, options), ask);
  if (json) {
    io.out(`${JSON.stringify(run.document)}\n`);
    return exitCode(run.outcome);
  }

  const { journal, saved: r } = run;
  if (!r) {
    io.err(`repomagpie note: ${run.document.error}\n`);
    return exitCode(run.outcome);
  }
  for (const warning of [...journal.warnings, ...r.warnings]) io.err(`warning: ${warning}\n`);
  for (const notice of r.notices) io.err(`${notice}\n`);
  for (const target of r.alternatives.present) io.err(`Already an alternative: ${target}\n`);
  for (const item of r.items.present) io.err(`Already in the note: ${item}\n`);
  for (const list of r.items.draftsReplaced) io.err(`Your items replaced the draft in ${list === "use_when" ? "Use when" : "Avoid when"}.\n`);
  const where = journal.scope === "personal" ? "your personal journal" : "the project journal";
  const name = r.name ?? r.id;
  if (r.result === "created") io.err(`✔ Saved to ${where}: ${name}\n`);
  else if (r.result === "updated") io.err(`✔ Updated in ${where}: ${name}\n`);
  else if (r.result === "unchanged") io.err(`Already in ${where}: ${name}\n`);
  else io.err(`repomagpie note: ${r.error}\n`);
  if (r.error === null && r.asksFirst) io.err(`RepoMagpie will ask before ${name} is installed.\n`);
  if (r.tagsMdAdded.length) io.err(`Added to tags.md: ${r.tagsMdAdded.join(", ")}\n`);
  if (r.path) io.out(`${r.path}\n`);
  return exitCode(run.outcome);
}
