// "Add GitHub topics as tags" (decision 0030): for every note in one journal, adds the topics that may
// become tags and aren't tags yet, ranked, after its existing tags, until it has 8. Never removes or
// reorders a tag. The ranking reads the journal as it was before the run, so the result doesn't depend
// on the order the notes are visited. A human edit: it runs only when the user asks (magpie tags
// --from-topics, the app's button). Writes notes and tags.md; never prints.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendTags, carried, journalTagList, type Place } from "./journals.ts";
import { readableId, readNote } from "./note.ts";
import type { Outcome } from "./outcome.ts";
import { locateJournal, type Journal } from "./save.ts";
import { rankTopics, TAG_LIMIT } from "./topic-tags.ts";
import { appendTagEntries } from "./write.ts";

type Scope = Journal["scope"];

// The --json document of magpie tags --from-topics, and the answer of POST /api/tags/from-topics.
export interface TagsFromTopicsJson {
  journal: Scope;
  notes: { id: string; path: string; added: string[] }[]; // the notes that get tags, by file name
  skipped: { path: string; reason: string }[]; // notes that can't be read or written; left unchanged
  tags_md_added: string[]; // the tags appended to tags.md, in order
  error?: string;
}

export function tagsFromTopics(request: { journal: Scope; dryRun: boolean }, place: Place): { outcome: Outcome; document: TagsFromTopicsJson } {
  const document: TagsFromTopicsJson = { journal: request.journal, notes: [], skipped: [], tags_md_added: [] };
  const journal = locateJournal(request.journal, place);
  if (journal.error) return { outcome: "failed", document: { ...document, error: journal.error } };

  // Every note, read once, before anything is written.
  const folder = join(journal.path, "notes");
  const notes = noteFiles(folder).map((file) => {
    const path = join(folder, file);
    try {
      const text = readFileSync(path, "utf8");
      const note = readNote(text);
      return { path, text, frontmatter: note.frontmatter, id: readableId(note) };
    } catch {
      return { path, text: "", frontmatter: {}, id: null };
    }
  });
  const carriers = new Map<string, number>(); // topic or tag → how many notes carry it
  for (const note of notes) if (note.id !== null) for (const label of carried(note.frontmatter)) carriers.set(label, (carriers.get(label) ?? 0) + 1);
  const tagList = journalTagList(journal.path);

  const planned: { id: string; path: string; added: string[]; text: string }[] = [];
  for (const note of notes) {
    if (note.id === null) {
      document.skipped.push({ path: note.path, reason: "Its frontmatter can't be read, or has no id." });
      continue;
    }
    const own = carried(note.frontmatter);
    const shared = { has: (topic: string) => (carriers.get(topic) ?? 0) - (own.includes(topic) ? 1 : 0) > 0 };
    const tags: unknown[] = Array.isArray(note.frontmatter.tags) ? note.frontmatter.tags : [];
    const topics: unknown[] = Array.isArray(note.frontmatter.topics) ? note.frontmatter.topics : [];
    const room = TAG_LIMIT - tags.length;
    if (room <= 0) continue;
    const added = rankTopics(topics, note.id, { tagList, shared }).filter((topic) => !tags.includes(topic)).slice(0, room);
    if (!added.length) continue;
    const edited = appendTagEntries(note.text, added);
    if (edited.warnings.length) document.skipped.push({ path: note.path, reason: edited.warnings[0] });
    else planned.push({ id: note.id, path: note.path, added, text: edited.text });
  }

  for (const note of planned) {
    if (!request.dryRun) {
      try {
        writeFileSync(note.path, note.text);
      } catch (error) {
        document.skipped.push({ path: note.path, reason: `Couldn't write it: ${(error as Error).message}` });
        continue;
      }
    }
    document.notes.push({ id: note.id, path: note.path, added: note.added });
  }
  document.skipped.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const newTags = [...new Set(document.notes.flatMap((note) => note.added))].filter((tag) => !tagList.includes(tag));
  if (request.dryRun) document.tags_md_added = newTags;
  else {
    try {
      document.tags_md_added = appendTags(journal.path, newTags);
    } catch (error) {
      return { outcome: "failed", document: { ...document, error: `The notes were tagged, but tags.md couldn't be written: ${(error as Error).message}` } };
    }
  }
  return { outcome: "ok", document };
}

// The .md files in <journal>/notes/, sorted; none when the folder doesn't exist.
function noteFiles(folder: string): string[] {
  try {
    return readdirSync(folder).filter((name) => name.endsWith(".md")).sort();
  } catch {
    return [];
  }
}
