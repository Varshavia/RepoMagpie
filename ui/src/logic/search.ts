// Search results in the app (docs/ui.md §7): why a result matched, from its `why` (decision 0041).
import type { SearchResult } from "../../../src/core/search.ts";

// "domain database (suggested) · tag postgresql · words orm, sql"; null when nothing is named.
export function whyLine(result: Pick<SearchResult, "why" | "domains_suggested">): string | null {
  const { domains, tags, words } = result.why;
  const parts = [
    ...domains.map((d) => `domain ${d}${result.domains_suggested.includes(d) ? " (suggested)" : ""}`),
    ...tags.map((t) => `tag ${t}`),
    ...(words.length ? [`${words.length === 1 ? "word" : "words"} ${words.join(", ")}`] : []),
  ];
  return parts.length ? parts.join(" · ") : null;
}
