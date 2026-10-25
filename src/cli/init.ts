// repomagpie init --auto (spec §2): the human output of core's runInitAuto, then, in a terminal, a
// Verdict asked for each dependency without a note, one by one, saved through runNote. It never
// writes a Verdict of its own: an empty answer skips, q stops. With --json or no terminal it only lists.
import { runInitAuto, type InitAutoJson, type NotedDependency } from "../core/init-auto.ts";
import { exitCode } from "../core/outcome.ts";
import { runNote, type Journal } from "../core/save.ts";
import { contextOf, plainIo, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface InitOptions extends GlobalOptions {
  auto?: boolean;
  to: Journal["scope"];
}

export async function initCommand(options: InitOptions, terminal: Io): Promise<number> {
  const io = plainIo(terminal);
  if (!options.auto) {
    io.err("repomagpie init: say what to do. For now there is one action: repomagpie init --auto lists this project's dependencies by what your notes say (an avoid note, a note, no note) and, in a terminal, asks for a Verdict on each one without a note.\n");
    return 2;
  }
  const place = contextOf(io, options);
  const run = runInitAuto(place);
  if (options.json) {
    io.out(`${JSON.stringify(run.document)}\n`);
    return exitCode(run.outcome);
  }
  const doc = run.document;
  for (const warning of run.warnings) io.err(`warning: ${warning}\n`);
  if (doc.error) {
    io.err(`repomagpie init: ${doc.error}\n`);
    return exitCode(run.outcome);
  }
  io.out(groups(doc));
  if (!doc.none.length) return 0;
  if (!io.interactive) {
    io.err("No terminal to ask in: nothing was written. Note one with repomagpie note <name> \"<your Verdict>\".\n");
    return 0;
  }

  io.err(`\nNote the ${plural(doc.none.length, "package")} without a note, one by one: your Verdict, in your own words. Enter skips one; q stops.\n`);
  let saved = 0;
  let failed = false;
  for (const dependency of doc.none) {
    const verdict = (await io.ask(`${dependency.name} (${dependency.type}): `)).trim();
    if (verdict.toLowerCase() === "q") break;
    if (!verdict) continue;
    const useWhen = (await io.ask("  Use when, in a few words (Enter skips): ")).trim();
    const note = await runNote({ target: dependency.name, type: dependency.type, text: verdict, to: options.to, useWhen: useWhen ? [useWhen] : undefined }, place);
    if (note.saved?.error === null) {
      saved++;
      io.err(`  ✔ Saved to ${note.journal.scope === "personal" ? "your personal journal" : "the project journal"}: ${dependency.name}\n`);
    } else {
      failed = true;
      io.err(`  repomagpie init: ${dependency.name}: ${note.document.error}\n`);
    }
  }
  io.err(saved ? `Saved ${plural(saved, "note")}.\n` : "Nothing was written.\n");
  return failed ? 1 : 0;
}

// The three groups, for people: avoid notes first, then notes with the Verdict's first words, then
// the names without a note.
function groups(doc: InitAutoJson): string {
  const noted = doc.avoid.length + doc.noted.length;
  const lines = [`This project uses ${plural(doc.dependencies, "package")} (${doc.manifests.join(", ")}). You have notes on ${noted}${doc.avoid.length ? `; ${doc.avoid.length} ${doc.avoid.length === 1 ? "says" : "say"} avoid` : ""}.`];
  const rows = [...doc.avoid, ...doc.noted];
  const width = (field: "name" | "type" | "journal") => Math.max(0, ...rows.map((d) => d[field].length));
  const row = (d: NotedDependency) =>
    `  ${d.name.padEnd(width("name"))}  ${d.type.padEnd(width("type"))}  ${d.journal.padEnd(width("journal"))}  ${d.verdict === null ? "[inbox] no verdict yet" : `Verdict: ${firstWords(d.verdict)}`}`;
  if (doc.avoid.length) lines.push("", "Avoid", ...doc.avoid.map(row));
  if (doc.noted.length) lines.push("", "Noted", ...doc.noted.map(row));
  if (doc.none.length) lines.push("", "No note", `  ${doc.none.map((d) => d.name).join(", ")}`);
  return `${lines.join("\n")}\n`;
}

function firstWords(verdict: string, count = 8): string {
  const words = verdict.split(/\s+/).filter(Boolean);
  return words.length > count ? `${words.slice(0, count).join(" ")} …` : words.join(" ");
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;
