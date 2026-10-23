// repomagpie delete <name> (spec §2, decision 0037): moves a note to its journal's trash, after the
// person's OK. In a terminal it shows the note, what links to it and where it goes, then asks;
// without one it needs --yes. Under --json it never asks.
import { sep } from "node:path";
import { deleteCandidates, deleteNote, emptyDelete, type DeleteCandidate, type DeleteJson } from "../core/delete.ts";
import { readablePurl } from "../core/identity.ts";
import { exitCode, type Outcome } from "../core/outcome.ts";
import { contextOf, plainIo, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface DeleteOptions extends GlobalOptions {
  journal?: "personal" | "project";
  yes?: boolean;
}

export async function deleteCommand(target: string, options: DeleteOptions, terminal: Io): Promise<number> {
  const io = plainIo(terminal);
  const json = Boolean(options.json);
  const asks = io.interactive && !json;
  const context = contextOf(io, options);
  const short = (path: string | null) => (path && io.home && path.startsWith(io.home + sep) ? `~${path.slice(io.home.length)}` : (path ?? ""));
  const stop = (outcome: Outcome, error: string, document: DeleteJson = emptyDelete(options.journal ?? "personal")): number => {
    if (json) io.out(`${JSON.stringify({ ...document, error })}\n`);
    else io.err(`repomagpie delete: ${error}\n`);
    return exitCode(outcome);
  };

  const found = deleteCandidates(target, options.journal, context);
  if (!json) for (const warning of found.warnings) io.err(`warning: ${warning}\n`);
  if (!found.candidates.length) {
    // As recall's empty case: a message, exit 0.
    if (json) io.out(`${JSON.stringify(emptyDelete(options.journal ?? "personal"))}\n`);
    else {
      io.err(`No note on ${target}.\n`);
      if (found.nameOnly.length) io.err(`These match it by name only; to delete one, name it by its PURL:\n${found.nameOnly.map((c) => `  ${readablePurl(c.id)} (${c.journal} journal)\n`).join("")}`);
    }
    return 0;
  }

  let chosen: DeleteCandidate | undefined = found.candidates[0];
  if (found.candidates.length > 1) {
    const both = new Set(found.candidates.map((c) => c.journal)).size > 1;
    const hint = both ? "Add --journal personal or --journal project." : `Name it by its PURL: ${found.candidates.map((c) => readablePurl(c.id)).join(", ")}.`;
    if (!asks) return stop("usage", `${target} matches ${found.candidates.length} notes. ${hint}`);
    io.err(`${target} matches ${found.candidates.length} notes:\n${found.candidates.map((c, i) => `  ${i + 1}  ${c.name} · ${readablePurl(c.id)} · ${c.journal} journal\n`).join("")}`);
    const answer = (await io.ask(`Which one? (1-${found.candidates.length}, Enter to cancel) `)).trim();
    chosen = /^\d+$/.test(answer) ? found.candidates[Number(answer) - 1] : undefined;
    if (!chosen) {
      io.err("Cancelled. Nothing moved.\n");
      return 0;
    }
  }

  const request = { journal: chosen.journal, address: { file: chosen.file } };
  const plan = deleteNote({ ...request, dryRun: true }, context);
  if (plan.document.error) return stop(plan.outcome, plan.document.error, plan.document);
  const { backlinks } = plan.document;
  const linkedFrom = backlinks.map((b) => `${b.name ?? readablePurl(b.id)} (${b.from === "alternatives" ? "as an alternative" : `in ${b.from}`})`).join(", ");

  if (!options.yes) {
    if (!asks) return stop("usage", "Moving a note to the trash needs your OK: run this in a terminal, or add --yes.", plan.document);
    io.err(`${chosen.name} · ${chosen.journal} journal\n  Verdict  ${chosen.verdict ?? "[inbox] no verdict yet"}\n  ${short(plan.document.path)}\n`);
    if (backlinks.length) io.err(`Linked from: ${linkedFrom}. Those links will show as unresolved; the notes stay as they are.\n`);
    io.err(`It goes to ${short(plan.document.trash)}. Nothing empties the trash; delete the file there to remove it for good.\n`);
    if (!/^y(es)?$/i.test((await io.ask("Move it to the trash? [y/N] ")).trim())) {
      io.err("Cancelled. Nothing moved.\n");
      return 0;
    }
  }

  // The version seen above: a change made meanwhile refuses the delete.
  const done = deleteNote({ ...request, version: plan.document.version ?? undefined }, context);
  if (json) {
    io.out(`${JSON.stringify(done.document)}\n`);
    return exitCode(done.outcome);
  }
  for (const warning of done.document.warnings) io.err(`warning: ${warning}\n`);
  if (done.document.error) return stop(done.outcome, done.document.error);
  io.err(`✔ Moved to the trash: ${chosen.name}\n`);
  if (options.yes && backlinks.length) io.err(`Linked from: ${linkedFrom}. Those links show as unresolved now.\n`);
  io.out(`${short(done.document.trash)}\n`);
  return 0;
}
