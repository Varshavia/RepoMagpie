// The Suggest screen's rows (docs/ui.md §7): the candidates, Verdict first, in the order magpie
// suggest gives them, one row per package; then the project's dependencies you noted to avoid that
// the need matched; then, for the collapsed section at the end, every one of those dependencies.
import type { Alternative } from "../../../src/core/recall.ts";
import type { Candidate, SuggestJson } from "../../../src/core/suggest.ts";
import { packageLabel } from "./schema.ts";

type Journal = "personal" | "project";

export interface SuggestItem {
  kind: "candidate" | "avoid";
  section: boolean; // a row of the collapsed "In this project but your notes say avoid" section
  id: string | null;
  journal: Journal; // the note the row shows: the project's when both journals have one
  journals: Journal[]; // every journal with a note on the package, the project first
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
  const candidates = onePerPackage(doc.candidates.map((c) => ({
    matched: true,
    item: {
      kind: "candidate", section: false, id: c.id, journal: c.journal, journals: [c.journal], name: c.name, type: c.id ? packageLabel(c.id).type : "", verdict: c.verdict, status: c.status,
      nameOnly: false, why: whyLine(c.why), instead: [], moreInstead: 0,
    } satisfies SuggestItem,
  })));
  const avoid = onePerPackage(doc.in_use_avoid.map((m) => {
    const { type, name } = packageLabel(m.id);
    const alternatives = m.confidence === "exact" ? m.alternatives : []; // a name-only note is on another package
    return {
      matched: m.matched,
      item: {
        kind: "avoid", section: false, id: m.id, journal: m.journal, journals: [m.journal], name, type, verdict: m.verdict, status: m.status, nameOnly: m.confidence === "name-only", why: null,
        instead: alternatives.slice(0, INSTEAD), moreInstead: Math.max(alternatives.length - INSTEAD, 0),
      } satisfies SuggestItem,
    };
  }));
  return [
    ...candidates.map((c) => c.item),
    ...avoid.filter((a) => a.matched).map((a) => a.item),
    ...avoid.map((a): SuggestItem => ({ ...a.item, section: true })),
  ];
}

// A package noted in both journals is one row: the project's note, with both journals named. A note
// without an id is never merged; matched holds when either note matched.
function onePerPackage(rows: { matched: boolean; item: SuggestItem }[]): { matched: boolean; item: SuggestItem }[] {
  const out: { matched: boolean; item: SuggestItem }[] = [];
  const byId = new Map<string, { matched: boolean; item: SuggestItem }>();
  for (const row of rows) {
    const same = row.item.id === null ? undefined : byId.get(row.item.id);
    if (!same) {
      const kept = { ...row, item: { ...row.item } };
      out.push(kept);
      if (row.item.id !== null) byId.set(row.item.id, kept);
      continue;
    }
    const journals: Journal[] = same.item.journals.includes(row.item.journal) ? same.item.journals : [...same.item.journals, row.item.journal];
    if (row.item.journal === "project" && same.item.journal !== "project") same.item = { ...row.item };
    same.item.journals = journals.sort((a, b) => (a === b ? 0 : a === "project" ? -1 : 1));
    same.matched ||= row.matched;
  }
  return out;
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
export const suggestKey = (item: SuggestItem) => `${item.journal} id ${item.id}${item.section ? " avoided" : item.kind === "avoid" ? " in use" : ""}`;

export function keywordLine(keywords: string[], max = 12): string {
  const shown = keywords.slice(0, max).join(", ");
  return keywords.length > max ? `${shown} and ${keywords.length - max} more` : shown;
}
