// repomagpie domains --suggest (decision 0040): for every note in one journal that has neither
// `domains` nor `domains_suggested`, writes `domains_suggested` from its tags and topics. Never
// removes anything and never touches `domains`, so a second run changes nothing. It runs only when the
// user asks. Writes notes; never prints.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { suggestDomains } from "./domains.ts";
import { journalAliases, type Place } from "./journals.ts";
import { readableId, readNote } from "./note.ts";
import { assertWritable, noteSignature } from "./note-cache.ts";
import type { Outcome } from "./outcome.ts";
import { locateJournal, type Journal } from "./save.ts";
import { setDomains } from "./write.ts";

// The --json document of repomagpie domains --suggest.
export interface DomainsSuggestJson {
  journal: Journal["scope"];
  dry_run: boolean;
  notes: { id: string; path: string; suggested: string[] }[]; // the notes that get suggestions
  skipped: { path: string; reason: string }[]; // notes that can't be read or written; left unchanged
  error?: string;
}

export function suggestJournalDomains(request: { journal: Journal["scope"]; dryRun: boolean }, place: Place): { outcome: Outcome; document: DomainsSuggestJson } {
  const document: DomainsSuggestJson = { journal: request.journal, dry_run: request.dryRun, notes: [], skipped: [] };
  const journal = locateJournal(request.journal, place);
  if (journal.error) return { outcome: "failed", document: { ...document, error: journal.error } };

  const aliases = journalAliases(journal.path);
  const folder = join(journal.path, "notes");
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
    const id = readableId(note);
    if (id === null) {
      document.skipped.push({ path, reason: "Its frontmatter can't be read, or has no id." });
      continue;
    }
    const fm = note.frontmatter;
    if (fm.domains !== undefined || fm.domains_suggested !== undefined) continue;
    const suggested = suggestDomains(fm, aliases);
    if (!suggested.length) continue;
    const edited = setDomains(text, { suggest: suggested });
    if (edited.warnings.length) {
      document.skipped.push({ path, reason: edited.warnings[0] });
      continue;
    }
    if (!request.dryRun) {
      try {
        assertWritable(journal.path, path);
        writeFileSync(path, edited.text);
      } catch (error) {
        document.skipped.push({ path, reason: `Couldn't write it: ${(error as Error).message}` });
        continue;
      }
    }
    document.notes.push({ id, path, suggested: edited.suggested });
  }
  return { outcome: "ok", document };
}
