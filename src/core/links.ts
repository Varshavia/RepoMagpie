// Links between notes (decisions 0026 and 0027): [[wikilinks]] in every body section and in the
// alternatives field, resolved within one journal by the rules in wikilinks.ts. The link index lists
// each note's outgoing and incoming links; it is built from per-file entries cached like the note
// list (spec §7), so a warm read doesn't parse every file again. Used by the Note document and the
// graph. Never prints.
import { readFileSync } from "node:fs";
import { readableId, readNote } from "./note.ts";
import { isRecord, isTextOrNull, noteEntries } from "./note-cache.ts";
import { alternativeLinks, findLinks, targetResolver, type FoundLink } from "./wikilinks.ts";

export { alternativeLinks, findLinks, type FoundLink };

export interface Link extends FoundLink {
  id: string | null; // the note it resolves to
  name: string | null;
  reason?: "missing" | "ambiguous"; // why it doesn't resolve
  from: string; // the section it is in (its name, or its heading as written), or "alternatives"
}

export interface Backlink {
  id: string;
  name: string | null;
  from: string;
}

// Keyed by note file name. Notes whose frontmatter can't be read are left out.
export interface LinkIndex {
  outgoing: Record<string, Link[]>;
  incoming: Record<string, Backlink[]>;
}

const LINKS_CACHE = "links.json";
const LINKS_VERSION = 1;

export interface Entry {
  id: string | null;
  name: string | null;
  links: (FoundLink & { from: string })[];
}

export interface LinkEntries {
  files: string[];
  data: Record<string, Entry>;
}

// Each note file's id, name and links as written, from the link cache: files added or changed since
// it was written are read again. One read of it serves both finding a note by id and the link index
// (each read stats every note: about 22 ms at 2,000 notes).
export function linkEntries(journal: string): LinkEntries {
  return noteEntries(journal, LINKS_CACHE, LINKS_VERSION, (_file, path) => entry(path), isEntry);
}

export function linkIndex(journal: string, entries = linkEntries(journal)): LinkIndex {
  const { outgoing, incoming } = resolvedLinkIndex(journal, entries);
  return { outgoing, incoming };
}

// The link index, plus the file each outgoing link resolves to (null when unresolved), in the same
// order as `outgoing`. The graph joins notes by file, since two files may carry the same id.
export function resolvedLinkIndex(journal: string, entries = linkEntries(journal)): LinkIndex & { targets: Record<string, (string | null)[]> } {
  const { files, data } = entries;
  const notes = files.filter((file) => data[file].id !== null);
  const resolve = targetResolver(notes.map((file) => ({ file, name: data[file].name })));

  const outgoing: Record<string, Link[]> = {};
  const targets: Record<string, (string | null)[]> = {};
  const sources: Record<string, { file: string; from: string }[]> = {};
  for (const file of notes) sources[file] = [];
  for (const file of notes) {
    targets[file] = [];
    outgoing[file] = data[file].links.map(({ target, label, from }) => {
      const resolved = resolve(target);
      targets[file].push(resolved.file);
      if (resolved.file === null) return { target, label, id: null, name: null, reason: resolved.reason, from };
      const to = resolved.file;
      if (to !== file && !sources[to].some((s) => s.file === file && s.from === from)) sources[to].push({ file, from });
      return { target, label, id: data[to].id, name: data[to].name, from };
    });
  }

  const incoming: Record<string, Backlink[]> = {};
  const sortKey = (file: string) => (data[file].name ?? data[file].id ?? file).toLowerCase();
  for (const file of notes) {
    incoming[file] = sources[file]
      .sort((a, b) => compare(sortKey(a.file), sortKey(b.file)) || compare(a.file, b.file))
      .map(({ file: source, from }) => ({ id: data[source].id as string, name: data[source].name, from }));
  }
  return { outgoing, incoming, targets };
}

// Whether a cached value has an entry's shape (a damaged cache is read again from the note).
function isEntry(e: unknown): boolean {
  return isRecord(e) && isTextOrNull(e.id) && isTextOrNull(e.name) && Array.isArray(e.links) &&
    e.links.every((link) => isRecord(link) && typeof link.target === "string" && isTextOrNull(link.label) && typeof link.from === "string");
}

// One note's id, name and links, as written. A note that can't be read has no id and no links.
function entry(path: string): Entry {
  let note;
  try {
    note = readNote(readFileSync(path, "utf8"));
  } catch {
    return { id: null, name: null, links: [] };
  }
  const id = readableId(note);
  if (id === null) return { id: null, name: null, links: [] };
  return {
    id,
    name: typeof note.frontmatter.name === "string" ? note.frontmatter.name : null,
    links: [
      ...alternativeLinks(note.frontmatter.alternatives).map((link) => ({ ...link, from: "alternatives" })),
      ...note.sections.flatMap((section) => findLinks(section.body).map((link) => ({ ...link, from: section.name ?? section.heading }))),
    ],
  };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
