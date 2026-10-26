// magpie tags --from-topics (spec §2, decision 0030) and magpie tags --merge <from> <to> (decision
// 0041): the human output of core's tagsFromTopics and runTagsMerge.
import { readablePurl } from "../core/identity.ts";
import { exitCode } from "../core/outcome.ts";
import type { Journal } from "../core/save.ts";
import { tagsFromTopics } from "../core/tags-from-topics.ts";
import { runTagsMerge, type TagsMergeJson } from "../core/tags-merge.ts";
import { clean } from "../core/text.ts";
import { contextOf, plainIo, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface TagsOptions extends GlobalOptions {
  fromTopics?: boolean;
  merge?: boolean;
  journal: Journal["scope"];
  dryRun?: boolean;
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

export async function tagsCommand(tags: string[], options: TagsOptions, terminal: Io): Promise<number> {
  const io = plainIo(terminal);
  if (options.merge && options.fromTopics) {
    io.err("repomagpie tags: --merge and --from-topics are two actions; run them one at a time.\n");
    return 2;
  }
  if (options.merge) return mergeCommand(tags, options, io);
  if (!options.fromTopics) {
    io.err("repomagpie tags: say what to do: repomagpie tags --from-topics [--dry-run], or repomagpie tags --merge <from> <to> [--dry-run]\n");
    return 2;
  }
  if (tags.length) {
    io.err("repomagpie tags: --from-topics takes no tags.\n");
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
  if (document.error) io.err(`repomagpie tags: ${document.error}\n`);
  if (document.notes.length) {
    const count = document.notes.reduce((sum, note) => sum + note.added.length, 0);
    const listed = document.tags_md_added.length ? `, and ${plural(document.tags_md_added.length, "new tag")} to tags.md` : "";
    io.err(`${options.dryRun ? "Would add" : "Added"} ${plural(count, "tag")} to ${plural(document.notes.length, "note")}${listed}.\n`);
  } else if (!document.error) io.err("No GitHub topics to add as tags.\n");
  if (options.dryRun) io.err("Dry run: nothing was written.\n");
  return exitCode(run.outcome);
}

// The plan first (one line per note, and what tags.md gets); in a terminal, a question before writing.
async function mergeCommand(tags: string[], options: TagsOptions, io: Io): Promise<number> {
  if (tags.length !== 2) {
    io.err("repomagpie tags: --merge takes two tags, the one to replace and the one to keep: repomagpie tags --merge postgres postgresql\n");
    return 2;
  }
  const place = contextOf(io, options);
  const merge = (dryRun: boolean) => runTagsMerge({ journal: options.journal, from: tags[0], to: tags[1], dryRun }, place);
  if (options.json) {
    const run = merge(Boolean(options.dryRun));
    io.out(`${JSON.stringify(run.document)}\n`);
    return exitCode(run.outcome);
  }
  const plan = merge(true);
  const { document } = plan;
  if (document.error) {
    io.err(`repomagpie tags: ${clean(document.error)}\n`);
    return exitCode(plan.outcome);
  }
  for (const note of document.notes) io.out(`${clean(readablePurl(note.id))}: ${note.tags.join(", ")}\n`);
  for (const skipped of document.skipped) io.err(`skipped ${clean(skipped.path)}: ${clean(skipped.reason)}\n`);
  const tagsMd = tagsMdLine(document);
  io.err(`${plural(document.notes.length, "note")} ${document.notes.length === 1 ? "has" : "have"} ${document.from}; it becomes ${document.to}.${tagsMd ? ` ${tagsMd}` : ""}\n`);
  if (!document.notes.length && !tagsMd) return 0;
  if (options.dryRun) {
    io.err("Dry run: nothing was written.\n");
    return 0;
  }
  if (io.interactive) {
    const answer = (await io.ask("Merge them? (y/N) ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      io.err("Nothing was written.\n");
      return 0;
    }
  }
  const run = merge(false);
  if (run.document.error) {
    io.err(`repomagpie tags: ${clean(run.document.error)}\n`);
    return exitCode(run.outcome);
  }
  for (const skipped of run.document.skipped) if (!document.skipped.some((s) => s.path === skipped.path)) io.err(`skipped ${clean(skipped.path)}: ${clean(skipped.reason)}\n`);
  io.err(`Merged ${run.document.from} into ${run.document.to} in ${plural(run.document.notes.length, "note")}.\n`);
  return exitCode(run.outcome);
}

function tagsMdLine(document: TagsMergeJson): string {
  const parts = [
    ...(document.tags_md.alias_added ? [`tags.md lists ${document.from} as an alias of ${document.to}`] : []),
    ...(document.tags_md.line_removed ? [`${document.from}'s own line goes`] : []),
  ];
  return parts.length ? `${parts.join(", and ")}.` : "";
}
