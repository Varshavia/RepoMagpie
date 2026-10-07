// The app's edit of one note (spec, "Editing a note"): only what the person changed, with the version
// the note was read with. Core checks and applies it; these helpers only shape the request.
import type { NoteJson } from "../../../src/core/documents.ts";
import { TAG_PATTERN } from "./schema.ts";

export interface Form {
  verdict: string;
  kind: string; // "" when the note has none
  tags: string[];
  tried: boolean;
  rating: number | null; // 1 to 5
}

export interface Patch {
  journal: "personal" | "project";
  id: string;
  version: string;
  verdict?: string;
  fields?: Partial<Pick<Form, "kind" | "tags" | "tried" | "rating">> & { alternatives?: string[] }; // alternatives: link targets
  sections?: Record<string, string>;
  accept_drafts?: string[];
}

export function formOf(note: NoteJson): Form {
  const fm = note.frontmatter;
  const rating = fm.rating;
  return {
    verdict: note.verdict ?? "",
    kind: typeof fm.kind === "string" ? fm.kind : "",
    tags: Array.isArray(fm.tags) ? fm.tags.filter((t): t is string => typeof t === "string") : [],
    tried: fm.tried === true,
    rating: typeof rating === "number" && Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
  };
}

// The line under a note's title: whether you ran it, and your rating; null when neither is set.
export function triedLine({ tried, rating }: Pick<Form, "tried" | "rating">): string | null {
  if (!tried && rating === null) return null;
  return [tried ? "Tried" : "Not tried", ...(rating === null ? [] : [`rated ${rating} of 5`])].join(" · ");
}

// The PATCH body for the form's changes, or null when nothing changed or the note can't be edited.
export function patchFor(note: NoteJson, form: Form): Patch | null {
  if (note.read_only || note.id === null || note.version === null) return null;
  const before = formOf(note);
  const patch: Patch = { journal: note.journal, id: note.id, version: note.version };
  const verdict = oneLine(form.verdict);
  if (verdict !== before.verdict) patch.verdict = verdict;
  const fields: Patch["fields"] = {};
  if (form.kind && form.kind !== before.kind) fields.kind = form.kind;
  if (form.tags.join(" ") !== before.tags.join(" ")) fields.tags = form.tags;
  if (form.tried !== before.tried) fields.tried = form.tried;
  if (form.rating !== before.rating) fields.rating = form.rating;
  if (Object.keys(fields).length) patch.fields = fields;
  return patch.verdict === undefined && !patch.fields ? null : patch;
}

// The Verdict is one line.
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseTags(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[\s,]+/).filter(Boolean))];
}

// "From GitHub topics": the note's topics that could become tags, in GitHub's order, at most 8. Not
// one the note has, not the repository's own name, and only ones that are valid tags.
export function topicSuggestions(topics: unknown, tags: string[], id: string | null): string[] {
  if (!Array.isArray(topics)) return [];
  const repo = id?.match(/^pkg:github\/[^/]+\/([^/?#@]+)/)?.[1]?.toLowerCase();
  const valid = topics.filter((t): t is string => typeof t === "string" && TAG_PATTERN.test(t) && !tags.includes(t) && t !== repo);
  return [...new Set(valid)].slice(0, 8);
}

// The tags core would refuse.
export function tagProblems(tags: string[]): string[] {
  return tags.filter((t) => !TAG_PATTERN.test(t));
}
