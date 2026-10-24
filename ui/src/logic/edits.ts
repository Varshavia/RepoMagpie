// The app's edit of one note (spec, "Editing a note"): only what the person changed, with the version
// the note was read with. Core checks and applies it; these helpers only shape the request.
import type { NoteJson } from "../../../src/core/documents.ts";
import type { TagsFromTopicsJson } from "../../../src/core/tags-from-topics.ts";
import { isStopTopic, TAG_PATTERN } from "./schema.ts";

export interface Form {
  verdict: string;
  kind: string; // "" when the note has none
  tags: string[];
  tried: boolean;
  rating: number | null; // 1 to 5
  useWhen: string[]; // items to add to "Use when", in the person's words; none until they type one
  useWhenText: string; // a line typed but not added yet: saved with the items
  avoidWhen: string[]; // items to add to "Avoid when"
  avoidWhenText: string;
}

export interface Patch {
  journal: "personal" | "project";
  id: string;
  version: string;
  verdict?: string;
  fields?: Partial<Pick<Form, "kind" | "tags" | "tried" | "rating">> & { alternatives?: string[] }; // alternatives: link targets
  sections?: Record<string, string>;
  accept_drafts?: string[];
  add_items?: Partial<Record<"Use when" | "Avoid when", string[]>>; // appended as note --use-when does
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
    useWhen: [],
    useWhenText: "",
    avoidWhen: [],
    avoidWhenText: "",
  };
}

// An item typed into the Use when or Avoid when field, added to the list: one line, trimmed, once
// (ignoring case). The list unchanged when it is blank or already there.
export function withItem(items: string[], typed: string): string[] {
  const item = oneLine(typed);
  return !item || items.some((i) => i.toLowerCase() === item.toLowerCase()) ? items : [...items, item];
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
  const items: Patch["add_items"] = {};
  const useWhen = withItem(form.useWhen, form.useWhenText);
  const avoidWhen = withItem(form.avoidWhen, form.avoidWhenText);
  if (useWhen.length) items["Use when"] = useWhen;
  if (avoidWhen.length) items["Avoid when"] = avoidWhen;
  if (Object.keys(items).length) patch.add_items = items;
  return patch.verdict === undefined && !patch.fields && !patch.add_items ? null : patch;
}

// The Verdict is one line.
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseTags(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[\s,]+/).filter(Boolean))];
}

// The note view's "From GitHub topics": the note's topics that could become tags, in GitHub's order,
// at most 8. Not one the note has, not the repository's own name, not on the stop list, and only ones
// that are valid tags. Not ranked: that needs every note (decision 0030).
export function topicSuggestions(topics: unknown, tags: string[], id: string | null): string[] {
  if (!Array.isArray(topics)) return [];
  const repo = id?.match(/^pkg:github\/[^/]+\/([^/?#@]+)/)?.[1]?.toLowerCase();
  const valid = topics.filter((t): t is string => typeof t === "string" && TAG_PATTERN.test(t) && !isStopTopic(t) && !tags.includes(t) && t !== repo);
  return [...new Set(valid)].slice(0, 8);
}

// Add's "From GitHub topics" (decision 0030): the topics core ranked as possible tags (the preview's
// topic_tags), without the tags chosen so far, at most 8.
export function addTopicSuggestions(topicTags: string[], tags: string[]): string[] {
  return topicTags.filter((t) => !tags.includes(t)).slice(0, 8);
}

// "Add GitHub topics as tags" (decision 0030): what it will do, from its dry run.
export function fromTopicsSummary(doc: TagsFromTopicsJson): string {
  const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;
  const { notes, tags_md_added: added, skipped } = doc;
  const what = !notes.length
    ? "Nothing to add: every note has its GitHub topics as tags, or 8 tags already."
    : `Adds up to 8 tags to ${plural(notes.length, "note")}${added.length ? `, and ${plural(added.length, "new tag")} to your tag list.` : ". Your tag list already has them."}`;
  if (!skipped.length) return what;
  return `${what} ${plural(skipped.length, "note")} can't be read, so ${skipped.length === 1 ? "it stays as it is" : "they stay as they are"}.`;
}

// The tags core would refuse.
export function tagProblems(tags: string[]): string[] {
  return tags.filter((t) => !TAG_PATTERN.test(t));
}
