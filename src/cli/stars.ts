// repomagpie import --stars (decision 0068): reads the user's GitHub stars, prints a summary, and
// writes the chosen ones as inbox notes only after a yes in a terminal, or with --yes. Without a
// terminal and without --yes it writes nothing and prints the command to run. Under --json it never
// asks: without --yes the document is the preview.
import { exitCode } from "../core/outcome.ts";
import { DEFAULT_LIMIT, emptyStars, runStars, type StarsJson, type StarSelection } from "../core/stars.ts";
import { readablePurl } from "../core/identity.ts";
import { clean } from "../core/text.ts";
import { contextOf, plainIo, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface StarsOptions extends GlobalOptions {
  to: "personal" | "project";
  user?: string;
  limit?: number;
  all?: boolean;
  language?: string[];
  topic?: string[];
  since?: string;
  yes?: boolean;
}

export async function starsCommand(options: StarsOptions, terminal: Io): Promise<number> {
  const io = plainIo(terminal);
  const json = Boolean(options.json);
  const user = options.user ?? null;
  const selection: StarSelection = { limit: options.all ? null : (options.limit ?? DEFAULT_LIMIT), languages: options.language ?? [], topics: options.topic ?? [], since: options.since ?? null };
  const print = (document: StarsJson) => io.out(`${JSON.stringify(document)}\n`);
  const stop = (document: StarsJson, code: number) => {
    if (json) print(document);
    else io.err(`repomagpie import: ${clean(document.error ?? "")}\n`);
    return code;
  };
  if (options.all && options.limit !== undefined) return stop(emptyStars(options.to, user, selection, "--all and --limit can't be used together."), 2);

  const context = contextOf(io, options);
  if (!json) io.err(user ? `Reading ${user}'s public stars from GitHub…\n` : "Reading your stars from GitHub…\n");
  const preview = await runStars({ user, to: options.to, selection, write: false }, context);
  if (preview.document.error) return stop(preview.document, exitCode(preview.outcome));
  const command = commandFor(options);

  if (!json) {
    for (const line of summary(preview.document)) io.out(`${line}\n`);
    for (const warning of preview.document.warnings) io.err(`warning: ${clean(warning)}\n`);
  }
  const count = preview.document.selected.length;
  if (!options.yes) {
    if (json) {
      print(preview.document);
      return 0;
    }
    if (!count) return 0;
    if (!io.interactive) {
      io.err(`Nothing was written. To import ${count === 1 ? "it" : `these ${count}`}, run:\n  ${command}\n`);
      return 0;
    }
    const answer = await io.ask(`Import ${count === 1 ? "it" : `these ${count}`} into your ${options.to} journal's inbox? [y/N] `);
    if (!/^y(es)?$/i.test(answer.trim())) {
      io.err("Cancelled. Nothing was written.\n");
      return 0;
    }
  }

  const run = await runStars({ user, to: options.to, selection, write: true }, context, preview.list ?? undefined);
  if (json) {
    print(run.document);
    return exitCode(run.outcome);
  }
  const { document } = run;
  if (!count) return exitCode(run.outcome);
  for (const notice of run.notices) io.err(`${notice}\n`);
  for (const item of document.items) {
    if (item.result === "created") io.out(`created ${readablePurl(item.id)}\n`);
    for (const warning of item.warnings) io.err(`${readablePurl(item.id)}: warning: ${clean(warning)}\n`);
    if (item.error) io.err(`${readablePurl(item.id)}: ${clean(item.error)}\n`);
  }
  const added = document.tags_md_added;
  if (added.length) io.err(`Added ${added.length} ${added.length === 1 ? "tag" : "tags"} to tags.md: ${added.join(", ")}\n`);
  io.err(`${document.created} starred ${document.created === 1 ? "note" : "notes"} in your ${options.to} journal's inbox${document.failed ? `, ${document.failed} failed` : ""}. They stay out of recall and the hook until you write a Verdict.\n`);
  if (!document.complete) io.err(`The list was cut short. Run the same command again later to import the rest; stars already noted are skipped:\n  ${command}\n`);
  return exitCode(run.outcome);
}

// The summary people see before anything is written: what was read, the top languages and topics,
// what is already noted or in the trash, and what the import would write.
function summary(d: StarsJson): string[] {
  const n = (count: number) => count.toLocaleString("en-US");
  const top = (counts: StarsJson["languages"]) => counts.slice(0, 5).map((c) => `${clean(c.name)} ${n(c.count)}`).join(", ") || "none";
  const whose = d.user ? `${clean(d.user)}'s public GitHub stars` : "Your GitHub stars";
  const lines = [
    `${whose}: ${n(d.total)}${d.complete ? "" : " read (not all)"}.`,
    `  ${n(d.new)} new, ${n(d.in_journal)} already in your journal${d.in_trash ? `, ${n(d.in_trash)} skipped because they're in the trash` : ""}.`,
    `  Top languages: ${top(d.languages)}`,
    `  Top topics: ${top(d.topics)}`,
  ];
  const filtered = d.filters.languages.length || d.filters.topics.length || d.filters.since;
  if (!d.selected.length) {
    lines.push(d.new ? "No new star matches these filters. Nothing to import." : `Every star is already in your journal${d.in_trash ? " or its trash" : ""}. Nothing to import.`);
    return lines;
  }
  const which = d.filters.limit === null || d.selected.length === d.matching ? `all ${n(d.selected.length)}` : `the ${n(d.selected.length)} most recently starred`;
  lines.push(`Import ${which} of ${n(d.matching)} new ${filtered ? "stars these filters keep" : "stars"}, starred ${d.selected.at(-1)?.starred} to ${d.selected[0].starred}:`);
  const shown = d.selected.slice(0, 10);
  for (const s of shown) lines.push(`  ${clean(s.name)}${s.language ? ` · ${clean(s.language)}` : ""}${s.archived ? " · archived" : ""}`);
  if (d.selected.length > shown.length) lines.push(`  +${n(d.selected.length - shown.length)} more`);
  return lines;
}

// The command that imports the same selection without asking.
function commandFor(options: StarsOptions): string {
  const flags = [
    ...(options.user ? ["--user", options.user] : []),
    ...(options.to === "project" ? ["--to", "project"] : []),
    ...(options.language ?? []).flatMap((l) => ["--language", l]),
    ...(options.topic ?? []).flatMap((t) => ["--topic", t]),
    ...(options.since ? ["--since", options.since] : []),
    ...(options.all ? ["--all"] : options.limit !== undefined ? ["--limit", String(options.limit)] : []),
    "--yes",
  ];
  const quote = (value: string) => (/^[\w@./:-]+$/.test(value) ? value : `"${value.replace(/["\\$`]/g, "\\$&")}"`);
  return `repomagpie import --stars ${flags.map((f) => quote(clean(f))).join(" ")}`;
}
