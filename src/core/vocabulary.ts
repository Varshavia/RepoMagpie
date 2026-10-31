// The vocabulary an agent maps a question onto (decision 0041): the domains with their
// definitions, and the tags the journals use, each with its note count and its aliases. Read-only;
// MCP's vocabulary tool returns it. Reads the search index search reads; never prints.
import MiniSearch from "minisearch";
import { DOMAINS } from "./domains.ts";
import type { Place } from "./journals.ts";
import type { Outcome } from "./outcome.ts";
import type { SearchDoc } from "./search-index.ts";
import { searchSources, type JournalSource } from "./search.ts";
import { canonicalTag } from "./tag-aliases.ts";
import { CAPS, forAgent } from "./text.ts";

export interface VocabularyJson {
  domains: { id: string; definition: string }[];
  tags: { tag: string; count: number; aliases: string[] }[]; // most used first, then by name
  error?: string;
}

// A tag's count is its notes in the journals read; an alias is a spelling that becomes the tag in
// one of them (tags.md's own, or the starter list's for a tag tags.md gives none).
export function runVocabulary(request: { journal?: JournalSource["scope"] }, place: Place): { outcome: Outcome; document: VocabularyJson; warnings: string[] } {
  const { sources, warnings } = searchSources(request.journal, place);
  const counts = new Map<string, number>();
  const aliases = new Map<string, Set<string>>();
  for (const source of sources) {
    const map = source.aliases ?? new Map<string, string>();
    for (const hit of source.index.search(MiniSearch.wildcard, { filter: (r) => (r as unknown as SearchDoc).type === "note" })) {
      for (const tag of new Set((hit as unknown as SearchDoc).tags.map((t) => canonicalTag(t, map)))) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    for (const [alias, tag] of map) aliases.set(tag, (aliases.get(tag) ?? new Set()).add(alias));
  }
  const tags = [...counts]
    .map(([tag, count]) => ({ tag, count, aliases: [...(aliases.get(tag) ?? [])].sort() }))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  return { outcome: "ok", document: { domains: DOMAINS.map(({ id, definition }) => ({ id, definition })), tags }, warnings };
}

// As agent-facing output shows it (decision 0032, rule 2): tags come from notes and tags.md, so each
// is cleaned and capped, and the list stops at the 500 most used.
export const VOCABULARY_TAGS = 500;
export function vocabularyForAgent(document: VocabularyJson): VocabularyJson {
  const tags = document.tags.map((t) => forAgent(t, { tag: CAPS.tag, aliases: { each: CAPS.tag, count: CAPS.tags } }));
  return forAgent({ ...document, tags }, { tags: { each: CAPS.other, count: VOCABULARY_TAGS } });
}
