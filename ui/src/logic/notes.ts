// The sidebar's counts and the centre list, from one journal's Note list document.
import type { NoteSummary } from "../../../src/core/documents.ts";

export type ListView = { list: "inbox" } | { list: "all" } | { list: "kind"; value: string } | { list: "tag"; value: string };

export interface Counts {
  all: number;
  inbox: number;
  kinds: { name: string; count: number }[]; // by name
  tags: { name: string; count: number }[]; // most used first, then by name
}

export function sidebarCounts(notes: NoteSummary[]): Counts {
  const kinds = new Map<string, number>();
  const tags = new Map<string, number>();
  let inbox = 0;
  for (const n of notes) {
    if (n.status === "inbox") inbox++;
    if (n.kind) kinds.set(n.kind, (kinds.get(n.kind) ?? 0) + 1);
    for (const t of n.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return {
    all: notes.length,
    inbox,
    kinds: [...kinds].map(([name, count]) => ({ name, count })).sort(byName),
    tags: [...tags].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || byName(a, b)),
  };
}

// The sidebar's tags at scale (docs/ui.md §7, decision 0030): the 15 with the most notes (sidebarCounts
// sorts them), or all of them. The tag open in the centre stays visible.
export const SIDEBAR_TAGS = 15;

export function shownTags<T extends { name: string }>(tags: T[], all: boolean, current: string | null): T[] {
  if (all || tags.length <= SIDEBAR_TAGS) return tags;
  const top = tags.slice(0, SIDEBAR_TAGS);
  return top.some((t) => t.name === current) ? top : [...top, ...tags.filter((t) => t.name === current)];
}

// The sidebar's Tags section, from the Tag list document: "missing" for a journal with notes but no
// tags.md ("Create tag list"), "empty" for a tags.md without tags ("Edit tag list"). A journal not
// created yet gets the starter list with its first note, so it is "ready".
export type TagListState = "missing" | "empty" | "ready";

export function tagListState(doc: { tags: string[]; exists: boolean }): TagListState {
  if (doc.tags.length) return "ready";
  return doc.exists ? "empty" : "missing";
}

export function filterNotes(notes: NoteSummary[], view: ListView): NoteSummary[] {
  switch (view.list) {
    case "all":
      return notes;
    case "inbox":
      return notes.filter((n) => n.status === "inbox");
    case "kind":
      return notes.filter((n) => n.kind === view.value);
    case "tag":
      return notes.filter((n) => n.tags.includes(view.value));
  }
}

// One note's key across both journals: by id, or by file name for a read-only note.
export function noteKey(journal: string, note: { id: string | null; file: string | null }): string {
  return note.id !== null ? `${journal} id ${note.id}` : `${journal} file ${note.file}`;
}

// The row to select after `done` leaves the list (a saved Verdict leaves the Inbox): the next one,
// or at the end the one before; the first when `done` isn't in the list.
export function nextAfter(keys: string[], done: string): string | null {
  const at = keys.indexOf(done);
  if (at === -1) return keys[0] ?? null;
  return keys[at + 1] ?? keys[at - 1] ?? null;
}
