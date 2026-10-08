// The Suggest screen's rows (docs/ui.md §7): the candidates, Verdict first, in the order magpie
// suggest gives them; then the project's dependencies you noted to avoid (in_use_avoid).
import type { Alternative } from "../../../src/core/recall.ts";
import type { Candidate, SuggestJson } from "../../../src/core/suggest.ts";
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
  why: string | null; // why a candidate is one; null for an avoid row
  instead: Alternative[]; // an exact avoid row's alternatives, at most 3 (decision 0029); [] otherwise
  moreInstead: number; // how many more it has
}

const INSTEAD = 3; // as magpie suggest prints them

export function suggestItems(doc: SuggestJson): SuggestItem[] {
  return [
    ...doc.candidates.map((c): SuggestItem => ({
      kind: "candidate", id: c.id, journal: c.journal, name: c.name, type: c.id ? packageLabel(c.id).type : "", verdict: c.verdict, status: c.status, nameOnly: false, why: whyLine(c.why),
      instead: [], moreInstead: 0,
    })),
    ...doc.in_use_avoid.map((m): SuggestItem => {
      const { type, name } = packageLabel(m.id);
      const alternatives = m.confidence === "exact" ? m.alternatives : []; // a name-only note is on another package
      return {
        kind: "avoid", id: m.id, journal: m.journal, name, type, verdict: m.verdict, status: m.status, nameOnly: m.confidence === "name-only", why: null,
        instead: alternatives.slice(0, INSTEAD), moreInstead: Math.max(alternatives.length - INSTEAD, 0),
      };
    }),
  ];
}

// Why a note is a candidate, as magpie suggest prints it (a mirror of src/cli/suggest.ts; the test
// keeps them equal): the dependencies it matched, then the other keywords it matched.
export function whyLine(why: Candidate["why"]): string {
  const covered = new Set(why.dependencies.flatMap((name) => name.toLowerCase().split(/[^a-z0-9]+/)));
  const words = why.keywords.filter((k) => !covered.has(k));
  const parts = [];
  if (why.dependencies.length) parts.push(`${why.dependencies.length === 1 ? "dependency" : "dependencies"} ${why.dependencies.join(", ")}`);
  if (words.length) parts.push(`matched ${words.join(", ")}`);
  return `Why: ${parts.join("; ")}`;
}

// The same key form as a search result's, so one selection works on both screens.
export const suggestKey = (item: SuggestItem) => `${item.journal} id ${item.id}${item.kind === "avoid" ? " in use" : ""}`;

export function keywordLine(keywords: string[], max = 12): string {
  const shown = keywords.slice(0, max).join(", ");
  return keywords.length > max ? `${shown} and ${keywords.length - max} more` : shown;
}
