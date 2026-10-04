// magpie import <file> (spec §2): the bulk form of note. One bad line never stops the rest.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Capture } from "../core/capture.ts";
import { resolveTarget, type PackageType } from "../core/identity.ts";
import { parseImport } from "../core/import.ts";
import { findManifests, listNotes } from "../core/journals.ts";
import { locateJournal, saveItem, type GlobalOptions, type Journal } from "./note.ts";
import type { Io } from "./program.ts";

export interface ImportOptions extends GlobalOptions {
  to: Journal["scope"];
  dryRun?: boolean;
}

interface LineResult {
  line: number;
  target: string;
  id: string | null;
  result: Capture["result"];
  error: string | null;
  warnings: string[];
}

export async function importCommand(file: string, options: ImportOptions, io: Io): Promise<number> {
  const json = Boolean(options.json);
  const print = (document: object) => io.out(`${JSON.stringify(document)}\n`);
  const stop = (error: string) => {
    if (json) print({ items: [], created: 0, updated: 0, failed: 0, error });
    else io.err(`magpie import: ${error}\n`);
    return 1;
  };

  const journal = locateJournal(options.to, options, io);
  if (journal.error) return stop(journal.error);
  let text: string;
  try {
    text = readFileSync(resolve(io.cwd, file), "utf8");
  } catch (error) {
    return stop(`Can't read ${file}: ${(error as Error).message}`);
  }

  const items = parseImport(text);
  if (!items.length) {
    if (json) print({ items: [], created: 0, updated: 0, failed: 0 });
    else io.err(`No items found in ${file}. Each item is a line that starts with "- ".\n`);
    return 0;
  }

  const notes = listNotes(journal.path);
  const manifests = findManifests(io.cwd);
  const notices = new Set<string>();
  const results: LineResult[] = [];
  for (const item of items) {
    const failed = (error: string, id: string | null = null): LineResult => ({ line: item.line, target: item.target, id, result: "failed", error, warnings: [] });
    if (item.error) {
      results.push(failed(item.error));
      continue;
    }
    const resolution = resolveTarget(item.target, { manifests });
    if (resolution.kind === "ambiguous") {
      const types: PackageType[] = resolution.candidates.length ? resolution.candidates : ["npm", "pypi", "cargo"];
      results.push(failed(`${item.target} could be ${types.join(", ")}; write a PURL instead, such as pkg:${types[0]}/${item.target}.`));
      continue;
    }
    if (resolution.kind === "rejected") {
      results.push(failed(resolution.reason));
      continue;
    }
    const { useWhen, avoidWhen, verdict, myNotes } = item;
    const saved = await saveItem(journal, notes, { purl: resolution.purl, skillPath: resolution.skillPath, source: item.target, verdict, useWhen, avoidWhen, myNotes }, io, options.dryRun);
    for (const notice of saved.notices) notices.add(notice);
    results.push({ line: item.line, target: item.target, id: saved.id, result: saved.result, error: saved.error, warnings: saved.warnings });
  }

  const count = (result: Capture["result"]) => results.filter((r) => r.result === result).length;
  if (json) {
    print({
      items: results.map(({ line, id, result, error, warnings }) => ({ line, id, result, error, warnings })),
      created: count("created"),
      updated: count("updated"),
      failed: count("failed"),
    });
  } else {
    for (const warning of journal.warnings) io.err(`warning: ${warning}\n`);
    for (const notice of notices) io.err(`${notice}\n`);
    for (const r of results) {
      io.out(`line ${r.line}: ${r.result} ${r.id ?? r.target}\n`);
      for (const warning of r.warnings) io.err(`line ${r.line}: warning: ${warning}\n`);
      if (r.error) io.err(`line ${r.line}: ${r.error}\n`);
    }
    if (options.dryRun) io.err("Dry run: nothing was written.\n");
    io.err(`${count("created")} created, ${count("updated")} updated, ${count("unchanged")} unchanged, ${count("failed")} failed.\n`);
  }
  return count("failed") ? 1 : 0;
}
