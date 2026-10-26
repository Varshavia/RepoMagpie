// repomagpie tags --merge <from> <to> (RFC 0001 §4.3, decision 0041): in every note of one journal,
// the tag `from` becomes `to`, at its place; a note that already has `to` just loses `from`, so no tag
// is there twice. tags.md then lists `from` as an alias of `to`, and `from`'s own line goes, so the
// next topic or filter spelled `from` lands on `to`. A human edit: it runs only when the user asks.
// Writes notes and tags.md; never prints.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Place } from "./journals.ts";
import { readableId, readNote } from "./note.ts";
import { assertWritable, noteSignature } from "./note-cache.ts";
import type { Outcome } from "./outcome.ts";
import { locateJournal, type Journal } from "./save.ts";
import { setHumanFields } from "./write.ts";

const TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// The --json document of repomagpie tags --merge.
export interface TagsMergeJson {
  journal: Journal["scope"];
  from: string;
  to: string;
  dry_run: boolean;
  notes: { id: string; path: string; tags: string[] }[]; // the notes changed, with their tags after
  skipped: { path: string; reason: string }[];
  tags_md: { alias_added: boolean; line_removed: boolean }; // what changes in tags.md
  error?: string;
}

// A note's tags after the merge: `from` replaced by `to` at its place, `to` once, the order kept.
export function mergeTags(tags: readonly string[], from: string, to: string): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const next = tag === from ? to : tag;
    if (!out.includes(next)) out.push(next);
  }
  return out;
}

export function runTagsMerge(request: { journal: Journal["scope"]; from: string; to: string; dryRun: boolean }, place: Place): { outcome: Outcome; document: TagsMergeJson } {
  const from = request.from.trim().toLowerCase();
  const to = request.to.trim().toLowerCase();
  const document: TagsMergeJson = { journal: request.journal, from, to, dry_run: request.dryRun, notes: [], skipped: [], tags_md: { alias_added: false, line_removed: false } };
  const usage = (error: string) => ({ outcome: "usage" as const, document: { ...document, error } });
  if (!TAG.test(from) || !TAG.test(to)) return usage("Give two tags, lowercase kebab-case: repomagpie tags --merge postgres postgresql");
  if (from === to) return usage("The two tags are the same.");
  const journal = locateJournal(request.journal, place);
  if (journal.error) return { outcome: "failed", document: { ...document, error: journal.error } };

  const folder = join(journal.path, "notes");
  const planned: { id: string; path: string; tags: string[]; text: string }[] = [];
  for (const file of noteSignature(journal.path).files) {
    const path = join(folder, file);
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (error) {
      document.skipped.push({ path, reason: `Couldn't read it: ${(error as Error).message}` });
      continue;
    }
    const note = readNote(text);
    const tags = note.frontmatter.tags;
    if (!Array.isArray(tags) || !tags.includes(from)) continue;
    const id = readableId(note);
    if (id === null) {
      document.skipped.push({ path, reason: "Its frontmatter can't be read, or has no id." });
      continue;
    }
    if (!tags.every((t) => typeof t === "string")) {
      document.skipped.push({ path, reason: "Its tags field isn't a list of tags; edit the file to fix it." });
      continue;
    }
    const merged = mergeTags(tags as string[], from, to);
    const edited = setHumanFields(text, { tags: merged });
    if (edited.warnings.length) document.skipped.push({ path, reason: edited.warnings[0] });
    else planned.push({ id, path, tags: merged, text: edited.text });
  }

  const tagsFile = join(journal.path, "tags.md");
  const before = existsSync(tagsFile) ? readFileSync(tagsFile, "utf8") : null;
  const after = withAlias(before, from, to);
  document.tags_md = { alias_added: after.aliasAdded, line_removed: after.lineRemoved };

  for (const note of planned) {
    if (!request.dryRun) {
      try {
        assertWritable(journal.path, note.path);
        writeFileSync(note.path, note.text);
      } catch (error) {
        document.skipped.push({ path: note.path, reason: `Couldn't write it: ${(error as Error).message}` });
        continue;
      }
    }
    document.notes.push({ id: note.id, path: note.path, tags: note.tags });
  }
  if (!request.dryRun && after.text !== before) {
    try {
      assertWritable(journal.path, tagsFile);
      writeFileSync(tagsFile, after.text);
    } catch (error) {
      return { outcome: "failed", document: { ...document, error: `The notes were changed, but tags.md couldn't be written: ${(error as Error).message}` } };
    }
  }
  return { outcome: "ok", document };
}

// tags.md with `from` as an alias of `to`: added in the parentheses of `to`'s line (made when
// missing), and `from`'s own line taken out. Every other line stays byte for byte, with the file's own
// line endings. Without tags.md, one with a "# Tags" heading and just `to`'s line.
export function withAlias(text: string | null, from: string, to: string): { text: string; aliasAdded: boolean; lineRemoved: boolean } {
  if (text === null) return { text: `# Tags\n\n- \`${to}\` (${from})\n`, aliasAdded: true, lineRemoved: false };
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const tagOf = (line: string) => line.match(/^\s*[-*]\s+`?([a-z0-9]+(?:-[a-z0-9]+)*)`?(?:\s|\(|$)/)?.[1];
  let lineRemoved = false;
  const kept = lines.filter((line) => {
    const own = tagOf(line) === from;
    if (own) lineRemoved = true;
    return !own;
  });
  let aliasAdded = false;
  const at = kept.findIndex((line) => tagOf(line) === to);
  if (at === -1) {
    while (kept.length && kept[kept.length - 1] === "") kept.pop();
    kept.push(`- \`${to}\` (${from})`, "");
    aliasAdded = true;
  } else {
    const line = kept[at];
    const parens = line.match(/^(\s*[-*]\s+`?[a-z0-9-]+`?\s*)\(([^()\r\n]*)\)/);
    if (parens) {
      const aliases = parens[2].split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
      if (!aliases.includes(from)) {
        kept[at] = `${parens[1]}(${[...parens[2].split(",").map((a) => a.trim()).filter(Boolean), from].join(", ")})${line.slice(parens[0].length)}`;
        aliasAdded = true;
      }
    } else {
      const head = line.match(/^\s*[-*]\s+`?[a-z0-9-]+`?/)?.[0] ?? line;
      kept[at] = `${head} (${from})${line.slice(head.length)}`;
      aliasAdded = true;
    }
  }
  if (!text.endsWith("\n") && kept[kept.length - 1] === "") kept.pop();
  return { text: aliasAdded || lineRemoved ? kept.join(eol) : text, aliasAdded, lineRemoved };
}
