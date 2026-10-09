// magpie tags --from-topics (spec §2, decision 0030): the human output of core's tagsFromTopics.
import { readablePurl } from "../core/identity.ts";
import { exitCode } from "../core/outcome.ts";
import type { Journal } from "../core/save.ts";
import { tagsFromTopics } from "../core/tags-from-topics.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface TagsOptions extends GlobalOptions {
  fromTopics?: boolean;
  journal: Journal["scope"];
  dryRun?: boolean;
}

export function tagsCommand(options: TagsOptions, io: Io): number {
  if (!options.fromTopics) {
    io.err("magpie tags: say what to do. For now there is one action: magpie tags --from-topics [--dry-run]\n");
    return 2;
  }
  const run = tagsFromTopics({ journal: options.journal, dryRun: Boolean(options.dryRun) }, contextOf(io, options));
  const { document } = run;
  if (options.json) {
    io.out(`${JSON.stringify(document)}\n`);
    return exitCode(run.outcome);
  }
  for (const note of document.notes) io.out(`${readablePurl(note.id)}: + ${note.added.join(", ")}\n`);
  for (const skipped of document.skipped) io.err(`skipped ${skipped.path}: ${skipped.reason}\n`);
  if (document.error) io.err(`magpie tags: ${document.error}\n`);
  if (document.notes.length) {
    const tags = document.notes.reduce((sum, note) => sum + note.added.length, 0);
    const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;
    const listed = document.tags_md_added.length ? `, and ${plural(document.tags_md_added.length, "new tag")} to tags.md` : "";
    io.err(`${options.dryRun ? "Would add" : "Added"} ${plural(tags, "tag")} to ${plural(document.notes.length, "note")}${listed}.\n`);
  } else if (!document.error) io.err("No GitHub topics to add as tags.\n");
  if (options.dryRun) io.err("Dry run: nothing was written.\n");
  return exitCode(run.outcome);
}
