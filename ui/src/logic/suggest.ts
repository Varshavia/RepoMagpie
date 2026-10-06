// The Suggest screen's rows (docs/ui.md §7): the candidates, Verdict first, in the order magpie
// suggest gives them; then the project's dependencies you noted to avoid (in_use_avoid).
import type { SuggestJson } from "../../../src/core/suggest.ts";
import { packageLabel } from "./schema.ts";

export interface SuggestItem {
  kind: "candidate" | "avoid";
  id: string | null;
  journal: "personal" | "project";
  name: string;
  type: string;
  verdict: string | null;
  status: "inbox" | "reviewed";
  nameOnly: boolean; // an avoid note matched by name only (recall's lower confidence)
}

export function suggestItems(doc: SuggestJson): SuggestItem[] {
  return [
    ...doc.candidates.map((c): SuggestItem => ({
      kind: "candidate", id: c.id, journal: c.journal, name: c.name, type: c.id ? packageLabel(c.id).type : "", verdict: c.verdict, status: c.status, nameOnly: false,
    })),
    ...doc.in_use_avoid.map((m): SuggestItem => {
      const { type, name } = packageLabel(m.id);
      return { kind: "avoid", id: m.id, journal: m.journal, name, type, verdict: m.verdict, status: m.status, nameOnly: m.confidence === "name-only" };
    }),
  ];
}

// The same key form as a search result's, so one selection works on both screens.
export const suggestKey = (item: SuggestItem) => `${item.journal} id ${item.id}${item.kind === "avoid" ? " in use" : ""}`;

export function keywordLine(keywords: string[], max = 12): string {
  const shown = keywords.slice(0, max).join(", ");
  return keywords.length > max ? `${shown} and ${keywords.length - max} more` : shown;
}
