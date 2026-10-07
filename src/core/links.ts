// Links between notes (decisions 0026 and 0027): [[wikilinks]] in every body section and in the
// alternatives field, resolved within one journal. The link index lists each note's outgoing and
// incoming links; it is built from per-file entries cached like the note list (spec §7), so a warm
// read doesn't parse every file again. Used by the Note document and the graph. Never prints.
import { readFileSync } from "node:fs";
import { readableId, readNote } from "./note.ts";
import { isRecord, isTextOrNull, noteEntries } from "./note-cache.ts";

export interface FoundLink {
  target: string; // as written, without the #heading
  label: string | null;
}

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

const LINK = /\[\[([^[\]\n]*)\]\]/g;
// A code span: a run of backticks, then the text up to a run of the same length.
const CODE_SPAN = /(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)/g;

// The [[target]], [[target|label]] and [[target#heading|label]] links in Markdown text, in order.
// Links in fenced code blocks and in code spans are not links.
export function findLinks(markdown: string): FoundLink[] {
  const found: FoundLink[] = [];
  let fence: string | null = null;
  for (const line of markdown.split("\n")) {
    const mark = line.match(/^\s*(```|~~~)/)?.[1];
    if (mark) fence = fence === null ? mark : fence === mark ? null : fence;
    if (mark || fence) continue;
    for (const match of line.replace(CODE_SPAN, " ").matchAll(LINK)) {
      const bar = match[1].indexOf("|");
      const target = (bar === -1 ? match[1] : match[1].slice(0, bar)).split("#")[0].trim();
      const label = bar === -1 ? "" : match[1].slice(bar + 1).trim();
      if (target) found.push({ target, label: label || null });
    }
  }
  return found;
}

// The alternatives field (decision 0027): a list of wikilinks written as strings; a plain string
// names its target. Any other value makes the field unreadable, not the note.
export function alternativeLinks(value: unknown): FoundLink[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return [];
  return value.flatMap((item: string) => {
    if (item.includes("[[")) return findLinks(item);
    const target = item.trim();
    return target ? [{ target, label: null }] : [];
  });
}

const LINKS_CACHE = "links.json";
const LINKS_VERSION = 1;

interface Entry {
  id: string | null;
  name: string | null;
  links: (FoundLink & { from: string })[];
}

export function linkIndex(journal: string): LinkIndex {
  const { outgoing, incoming } = resolvedLinkIndex(journal);
  return { outgoing, incoming };
}

// The link index, plus the file each outgoing link resolves to (null when unresolved), in the same
// order as `outgoing`. The graph joins notes by file, since two files may carry the same id.
export function resolvedLinkIndex(journal: string): LinkIndex & { targets: Record<string, (string | null)[]> } {
  const { files, data } = noteEntries(journal, LINKS_CACHE, LINKS_VERSION, (_file, path) => entry(path), isEntry);
  const notes = files.filter((file) => data[file].id !== null);
  const byStem = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, file: string) => map.set(key, [...(map.get(key) ?? []), file]);
  for (const file of notes) {
    add(byStem, file.slice(0, -".md".length).toLowerCase(), file);
    const name = data[file].name;
    if (name) add(byName, name.toLowerCase(), file);
  }

  const outgoing: Record<string, Link[]> = {};
  const targets: Record<string, (string | null)[]> = {};
  const sources: Record<string, { file: string; from: string }[]> = {};
  for (const file of notes) sources[file] = [];
  for (const file of notes) {
    targets[file] = [];
    outgoing[file] = data[file].links.map(({ target, label, from }) => {
      // 1. the file stem; 2. exactly one note's name; otherwise unresolved (case-insensitive).
      const stems = byStem.get(target.toLowerCase()) ?? [];
      const named = byName.get(target.toLowerCase()) ?? [];
      const to = stems.length === 1 ? stems[0] : !stems.length && named.length === 1 ? named[0] : null;
      targets[file].push(to);
      if (!to) return { target, label, id: null, name: null, reason: stems.length > 1 || named.length > 1 ? "ambiguous" : "missing", from };
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
