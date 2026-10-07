// Links in the note view (docs/ui.md §7): how a [[link]] shows, "Linked from", the [[ autocomplete,
// and the address a followed link leaves in the browser's history. Resolving is core's (the Note
// document's links and backlinks); nothing here decides where a link goes.
import type { Backlink, Link } from "../../../src/core/links.ts";

export type Scope = "personal" | "project";
export interface LinkNote {
  id: string | null;
  file: string;
  name: string | null;
}

// The note's link with this target. Links resolve by target alone, ignoring case, so any one does.
export function linkFor(links: Link[], target: string): Link | null {
  const key = target.toLowerCase();
  return links.find((link) => link.target.toLowerCase() === key) ?? null;
}

export function linkText(link: Link): string {
  return link.label ?? link.name ?? link.target;
}

export function unresolvedTitle(link: Link): string {
  return link.reason === "ambiguous" ? `Several notes are named “${link.target}”` : `No note named “${link.target}” in this journal`;
}

// "Linked from": one row per note, in core's order (by name), with where its links are.
export function backlinkGroups(backlinks: Backlink[]): { id: string; name: string | null; places: string[] }[] {
  const groups: { id: string; name: string | null; places: string[] }[] = [];
  for (const { id, name, from } of backlinks) {
    let group = groups.find((g) => g.id === id);
    if (!group) groups.push((group = { id, name, places: [] }));
    group.places.push(from === "alternatives" ? "as an alternative" : `in ${from}`);
  }
  return groups;
}

// The address of a note opened from a link: the browser's Back returns to the note before it.
export function noteHash(journal: Scope, id: string): string {
  return `#note/${journal}/${encodeURIComponent(id)}`;
}

export function parseNoteHash(hash: string): { journal: Scope; id: string } | null {
  const match = hash.match(/^#note\/(personal|project)\/(.+)$/);
  if (!match) return null;
  try {
    return { journal: match[1] as Scope, id: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

// The [[ being typed: where it starts and the text between it and the caret. None once the text
// holds a ] or [, a |, a # or a line break: the link is closed, or its label or heading is typed.
export function linkQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("[[");
  if (start === -1) return null;
  const query = before.slice(start + 2);
  return /[[\]|#\n]/.test(query) ? null : { start, query };
}

const MAX_CANDIDATES = 8;

// Notes to link to: name or file stem contains the text, ignoring case; those that start with it
// first, then by name. Only notes with an id (one that can't be read can't be opened by a link).
export function linkCandidates<T extends LinkNote>(notes: T[], query: string, exclude?: string | null): T[] {
  const q = query.trim().toLowerCase();
  const stem = (n: LinkNote) => n.file.replace(/\.md$/, "").toLowerCase();
  const label = (n: LinkNote) => (n.name ?? stem(n)).toLowerCase();
  return notes
    .filter((n) => n.id !== null && n.id !== exclude && (label(n).includes(q) || stem(n).includes(q)))
    .map((n) => ({ n, first: label(n).startsWith(q) || stem(n).startsWith(q) ? 0 : 1 }))
    .sort((a, b) => a.first - b.first || (label(a.n) < label(b.n) ? -1 : label(a.n) > label(b.n) ? 1 : 0))
    .slice(0, MAX_CANDIDATES)
    .map(({ n }) => n);
}

// --- alternatives (decision 0027) ---

// The note's own alternatives: its links from the alternatives field, in order.
export function alternativesOf(links: Link[]): Link[] {
  return links.filter((link) => link.from === "alternatives");
}

// "Alternative to: …": notes that list this one. One side is enough, so this comes from backlinks.
export function alternativeTo(backlinks: Backlink[]): Backlink[] {
  return backlinks.filter((link) => link.from === "alternatives");
}

// The targets with one more at the end; nothing changes for an empty one or one already there.
export function withAlternative(targets: string[], target: string): string[] {
  const added = target.trim();
  return !added || targets.some((t) => t.toLowerCase() === added.toLowerCase()) ? targets : [...targets, added];
}

export type AlternativeOption = { kind: "note"; note: LinkNote; target: string } | { kind: "text"; target: string };

// "+ Add" with the [[ autocomplete's list: notes to choose (not the note itself, nor one already
// listed), then the text as typed, for a subject without a note, unless it names a listed note.
export function alternativeOptions(notes: LinkNote[], query: string, listed: string[], self: string | null): AlternativeOption[] {
  const stem = (n: LinkNote) => n.file.replace(/\.md$/, "");
  const taken = new Set(listed.map((t) => t.toLowerCase()));
  const open = notes.filter((n) => !taken.has(stem(n).toLowerCase()) && !(n.name && taken.has(n.name.toLowerCase())));
  const options: AlternativeOption[] = linkCandidates(open, query, self).map((note) => ({ kind: "note", note, target: stem(note) }));
  const text = query.trim();
  const named = (n: LinkNote) => stem(n).toLowerCase() === text.toLowerCase() || n.name?.toLowerCase() === text.toLowerCase();
  if (text && !notes.some(named)) options.push({ kind: "text", target: text });
  return options;
}

// [[<file stem>|<name>]] in place of the typed [[text (and a ]] right after the caret), with the
// caret after it.
export function insertLink(text: string, start: number, caret: number, note: LinkNote): { text: string; caret: number } {
  const stem = note.file.replace(/\.md$/, "");
  const link = note.name ? `[[${stem}|${note.name}]]` : `[[${stem}]]`;
  const rest = text.slice(caret);
  return { text: text.slice(0, start) + link + (rest.startsWith("]]") ? rest.slice(2) : rest), caret: start + link.length };
}
