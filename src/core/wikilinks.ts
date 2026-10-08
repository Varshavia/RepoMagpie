// The wikilink rules (decisions 0027 and 0029): the [[target]] syntax, the alternatives field, and how
// a target resolves within one journal. Shared by the link index (links.ts) and recall, which the
// hook loads: this module imports nothing, so the hook's chunk doesn't load the link index.
export interface FoundLink {
  target: string; // as written, without the #heading
  label: string | null;
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

export type Resolution = { file: string } | { file: null; reason: "missing" | "ambiguous" };

// Resolves targets among a journal's notes (those with a readable id), by file name:
// 1. the file stem; 2. exactly one note's name; otherwise unresolved. Case-insensitive.
export function targetResolver(notes: { file: string; name: string | null }[]): (target: string) => Resolution {
  const byStem = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, file: string) => map.set(key, [...(map.get(key) ?? []), file]);
  for (const { file, name } of notes) {
    add(byStem, file.slice(0, -".md".length).toLowerCase(), file);
    if (name) add(byName, name.toLowerCase(), file);
  }
  return (target) => {
    const stems = byStem.get(target.toLowerCase()) ?? [];
    const named = byName.get(target.toLowerCase()) ?? [];
    if (stems.length === 1) return { file: stems[0] };
    if (!stems.length && named.length === 1) return { file: named[0] };
    return { file: null, reason: stems.length > 1 || named.length > 1 ? "ambiguous" : "missing" };
  };
}
