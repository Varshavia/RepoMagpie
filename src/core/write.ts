// Writing notes: the canonical format for new notes, and round-trip-safe edits of existing ones.
// Edits splice text at the positions the yaml Document API reports, so every byte outside
// the intended change stays as the person wrote it (note schema, rules 2 and 8).
// Pure functions on text; no file system, no printing.
import { isMap, isScalar, isSeq, parseDocument, stringify, type Pair, type Scalar } from "yaml";
import { DOMAIN_LIMIT, isDomain } from "./domains.ts";
import { alternativeLinks, findLinks } from "./links.ts";
import { DRAFT_MARKER, KINDS, readNote, SECTION_NAMES, sectionItems, stripComments, YAML_LIMITS, type SectionName } from "./note.ts";
import { CAPS, cut } from "./text.ts";

export type ToolField = "id" | "name" | "url" | "language" | "license" | "topics" | "packages" | "explored" | "adopted";
const TOOL_FIELDS: readonly string[] = ["id", "name", "url", "language", "license", "topics", "packages", "explored", "adopted"];
const SET_ONCE = new Set(["explored", "adopted"]);

export interface EditResult {
  text: string;
  changed: boolean;
  warnings: string[];
}

export interface NewNote {
  id: string;
  name: string;
  explored: string;
  kind: string;
  tags: string[];
  domains?: string[]; // confirmed by the user (decision 0040); written only when not empty
  domainsSuggested?: string[]; // suggested from topics and tags; written only when not empty
  url?: string;
  language?: string;
  license?: string;
  topics?: string[];
  packages?: string[];
  adopted?: string;
  tried?: boolean;
  rating?: number | null;
  verdict?: string; // human-written only (decision 0018)
  useWhen?: string[];
  avoidWhen?: string[];
  whatItDoes?: string;
  howToUse?: string;
  skills?: string[];
  myNotes?: string;
  related?: string;
  drafts?: SectionName[]; // sections whose content gets the draft marker
}

// A new note in the canonical format (note schema v1).
export function renderNote(note: NewNote): string {
  const status = note.verdict?.trim() ? "reviewed" : "inbox";
  const fields: [string, unknown][] = [
    ["id", note.id],
    ["name", note.name],
    ["url", note.url ?? null],
    ["language", note.language ?? null],
    ["license", note.license ?? null],
    ["topics", note.topics ?? []],
    ["packages", note.packages ?? []],
    ["explored", note.explored],
    ...(note.adopted ? [["adopted", note.adopted] as [string, unknown]] : []),
    ["kind", note.kind],
    ["tags", note.tags],
    ...(note.domains?.length ? [["domains", note.domains] as [string, unknown]] : []),
    ...(note.domainsSuggested?.length ? [["domains_suggested", note.domainsSuggested] as [string, unknown]] : []),
    ["tried", note.tried ?? false],
    ["rating", note.rating ?? null],
    ["status", status],
  ];
  const frontmatter = fields.map(([key, value]) => (value === null ? `${key}:` : `${key}: ${valueText(value)}`));

  const bullets = (items?: string[]) => (items ?? []).map((item) => `- ${item}`).join("\n");
  const content: Record<SectionName, string> = {
    "Verdict": note.verdict?.trim() ?? "",
    "Use when": bullets(note.useWhen),
    "Avoid when": bullets(note.avoidWhen),
    "What it does": note.whatItDoes?.trim() ?? "",
    "How to use": note.howToUse?.trim() ?? "",
    "Notable skills": (note.skills ?? []).map((skill) => skillLine(skill)).join("\n"),
    "My notes": note.myNotes?.trim() ?? "",
    "Related": note.related?.trim() ?? "",
  };
  const body = SECTION_NAMES.map((name) => {
    let text = content[name];
    if (text && note.drafts?.includes(name)) text = `${DRAFT_MARKER}\n${text}`;
    return `## ${name}\n${text ? `${text}\n` : ""}`;
  }).join("\n");
  return `---\n${frontmatter.join("\n")}\n---\n\n${body}`;
}

// Sets tool-owned frontmatter fields. Only the changed values' text is replaced; new keys are
// added at the end of the frontmatter. explored and adopted are set once; a known licence is
// never replaced with "unknown". A note whose frontmatter can't be read is left untouched.
export function setToolFields(text: string, values: Partial<Record<ToolField, string | string[] | null>>): EditResult {
  return editFrontmatter(text, values, true);
}

// Writes the user's own one-line Verdict into an empty Verdict section and sets status: reviewed
// (spec §2, schema rule 1). An existing Verdict is never overwritten. Without a Verdict section,
// one is inserted before the first section, or at the end.
export function setVerdict(text: string, verdict: string): EditResult {
  const line = verdict.trim();
  if (!line || /[\r\n]/.test(line)) return untouched(text, "The Verdict must be one line of text.");
  const withStatus = editFrontmatter(text, { status: "reviewed" }, false);
  if (withStatus.warnings.length) return untouched(text, withStatus.warnings[0]);

  const result = withStatus.text;
  const bounds = frontmatterBounds(result);
  const cr = result.includes("\r\n") ? "\r" : "";
  const lines = result.split("\n");
  const headings = findHeadings(lines, bounds ? result.slice(0, bounds.end).split("\n").length : 0);
  const at = headings.findIndex((h) => h.name === "verdict");
  if (at !== -1) {
    const start = headings[at].line;
    const body = lines.slice(start + 1, headings[at + 1]?.line ?? lines.length).join("\n");
    if (stripComments(body).trim()) return untouched(text, "This note already has a Verdict; edit the file to change it.");
    lines.splice(start + 1, 0, line + cr);
  } else if (headings.length) {
    lines.splice(headings[0].line, 0, `## Verdict${cr}`, line + cr, cr);
  } else {
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push(cr, `## Verdict${cr}`, line + cr, "");
  }
  return { text: lines.join("\n"), changed: true, warnings: [] };
}

// The human-owned frontmatter keys a person may edit in the local app (decision 0023). status is
// not among them: it follows the Verdict (schema rule 1).
export interface HumanFields {
  kind?: string;
  tags?: string[];
  tried?: boolean;
  rating?: number | null;
  // The whole list, in order: link targets ("zod"), or whole wikilinks ("[[zod|Zod]]") written as
  // given (decision 0027). Entries already in the note are matched by target and stay as written.
  alternatives?: string[];
}

// Removes a key and its lines from the frontmatter.
const REMOVE = Symbol("remove");

// A person's edit of kind, tags, tried, rating or alternatives. Values are checked against the schema
// first; one bad value, or any other key, leaves the note untouched with a warning.
export function setHumanFields(text: string, values: HumanFields): EditResult {
  for (const [key, value] of Object.entries(values)) {
    const problem = value === undefined ? null : humanFieldProblem(key, value);
    if (problem) return untouched(text, problem);
  }
  const { alternatives, ...rest } = values;
  const fields = editFrontmatter(text, rest as Record<string, unknown>, false);
  if (alternatives === undefined || fields.warnings.length) return fields;
  const edited = editAlternatives(fields.text, alternatives);
  if (edited.warnings.length) return untouched(text, edited.warnings[0]);
  return { text: edited.text, changed: edited.text !== text, warnings: [] };
}

// Adds entries at the end of the alternatives field (magpie note --alternative, decision 0029). Each
// entry already there stays as written: it is named by its own target, the way editAlternatives
// matches it. A field that isn't a list of strings is left alone, with a warning.
export function addAlternatives(text: string, entries: string[]): EditResult {
  const value = readNote(text).frontmatter.alternatives;
  if (value !== undefined && value !== null && !(Array.isArray(value) && value.every((item) => typeof item === "string"))) {
    return untouched(text, "The note's alternatives field isn't a list, so nothing was added; edit the file to fix it.");
  }
  const kept = ((value ?? []) as string[]).flatMap((item) => alternativeLinks([item]).slice(0, 1).map((link) => link.target));
  return editAlternatives(text, [...kept, ...entries]);
}

// Adds tags after the note's existing ones ("Add GitHub topics as tags", decision 0030). Each entry
// already there keeps its exact text (quotes, a comment on its line); a block list gets new lines at
// its indentation, a flow list new items with its own separator. A missing or empty value gets the
// whole list. A value that isn't a list of strings, or frontmatter that can't be read, is left alone,
// with a warning.
export function appendTagEntries(text: string, tags: string[]): EditResult {
  const bounds = readableFrontmatter(text);
  if (!bounds) return untouched(text, "The frontmatter can't be read; the note was left unchanged.");
  const frontmatter = text.slice(bounds.start, bounds.end);
  const doc = parseDocument(frontmatter);
  const pair = isMap(doc.contents) ? (doc.contents.items as Pair[]).find((p) => isScalar(p.key) && p.key.value === "tags") : undefined;
  const value = pair?.value;
  if (!pair || value === null || (isScalar(value) && (value.value === null || value.value === ""))) return editFrontmatter(text, { tags }, false);
  if (!isSeq(value) || !value.items.every((item) => isScalar(item) && typeof item.value === "string")) {
    return untouched(text, "The note's tags field isn't a list of tags, so nothing was added; edit the file to fix it.");
  }
  const items = value.items as Scalar<string>[];
  if (!items.length) return editFrontmatter(text, { tags }, false);
  if (!tags.length) return { text, changed: false, warnings: [] };

  const range = (item: Scalar<string>) => item.range as [number, number, number];
  const last = range(items[items.length - 1])[1];
  let at: number;
  let insert: string;
  if (value.flow) {
    const separator = items.length > 1 ? frontmatter.slice(range(items[0])[1], range(items[1])[0]) : ", ";
    at = last;
    insert = tags.map((tag) => separator + valueText(tag)).join("");
  } else {
    // After the last entry's line, at the first entry's indentation ("  - ").
    const first = range(items[0])[0];
    const prefix = frontmatter.slice(frontmatter.lastIndexOf("\n", first - 1) + 1, first);
    const newline = frontmatter[last - 1] === "\n" ? last - 1 : frontmatter.indexOf("\n", last);
    at = newline === -1 ? frontmatter.length : newline + 1;
    insert = tags.map((tag) => `${prefix}${valueText(tag)}${bounds.eol}`).join("");
  }
  const result = text.slice(0, bounds.start) + frontmatter.slice(0, at) + insert + frontmatter.slice(at) + text.slice(bounds.end);
  return { text: result, changed: result !== text, warnings: [] };
}

export interface DomainChange {
  confirm?: string[]; // the user's domains: added to `domains`, taken out of `domains_suggested`
  remove?: string[]; // taken out of wherever they are
  dismiss?: string[]; // suggestions the user doesn't want: taken out of `domains_suggested` only, never `domains`
  restore?: { domain: string; at: number }; // a dismissed suggestion back, at its old position (Undo)
  suggest?: string[]; // RepoMagpie's suggestions, written only to a note that has neither field
}

export interface DomainResult extends EditResult {
  confirmed: string[]; // the domains newly added to `domains`
  removed: string[];
  suggested: string[];
}

// The two domain fields (decision 0040): `domains`, the user's, at most DOMAIN_LIMIT known ones;
// `domains_suggested`, RepoMagpie's, never holding a confirmed one. Confirming moves a domain from
// the suggestions to `domains`; removing takes it out of both; dismissing, out of the suggestions
// only, and restoring puts a dismissed one back where it was. A field emptied stays, as [], so
// `repomagpie domains --suggest` knows the user took the suggestions out. Values that aren't in the
// vocabulary are kept as written. A field that isn't a list of text is left alone, with a warning.
export function setDomains(text: string, change: DomainChange): DomainResult {
  const none = (edit: EditResult): DomainResult => ({ ...edit, confirmed: [], removed: [], suggested: [] });
  const fm = readNote(text).frontmatter;
  const isList = (value: unknown) => value === undefined || value === null || (Array.isArray(value) && value.every((v) => typeof v === "string"));
  for (const key of ["domains", "domains_suggested"]) {
    if (!isList(fm[key])) return none(untouched(text, `The note's ${key} field isn't a list, so it was left unchanged; edit the file to fix it.`));
  }
  const confirmedNow = ((fm.domains ?? []) as string[]).slice();
  const suggestedNow = ((fm.domains_suggested ?? []) as string[]).slice();
  const remove = new Set(change.remove ?? []);
  const dismiss = new Set(change.dismiss ?? []);
  const confirm = [...new Set(change.confirm ?? [])].filter((d) => !remove.has(d));
  const confirmed = confirm.filter((d) => !confirmedNow.includes(d));
  const removed = [...new Set([...remove, ...dismiss])].filter((d) => (remove.has(d) && confirmedNow.includes(d)) || suggestedNow.includes(d));
  const nextDomains = [...confirmedNow.filter((d) => !remove.has(d)), ...confirmed];
  if (new Set(nextDomains.filter(isDomain)).size > DOMAIN_LIMIT) {
    return none(untouched(text, `A note has at most ${DOMAIN_LIMIT} domains; a note with more is a platform. Remove one first.`));
  }
  const kept = suggestedNow.map((d) => !remove.has(d) && !dismiss.has(d) && !nextDomains.includes(d));
  let nextSuggested = suggestedNow.filter((_, k) => kept[k]);
  const back = change.restore;
  const restoreAt = back && !nextDomains.includes(back.domain) && !nextSuggested.includes(back.domain) ? Math.min(back.at, nextSuggested.length) : -1;
  if (back && restoreAt !== -1) nextSuggested.splice(restoreAt, 0, back.domain);
  const fresh = fm.domains === undefined && fm.domains_suggested === undefined;
  const suggested = fresh && !confirmed.length && !back ? [...new Set(change.suggest ?? [])].filter((d) => !nextDomains.includes(d)) : [];
  if (suggested.length) nextSuggested = suggested;

  const values: Record<string, unknown> = {};
  if (confirmed.length || [...remove].some((d) => confirmedNow.includes(d))) values.domains = nextDomains;
  if (suggested.length || JSON.stringify(nextSuggested) !== JSON.stringify(suggestedNow)) values.domains_suggested = nextSuggested;
  if (!Object.keys(values).length) return none({ text, changed: false, warnings: [] });
  // Suggestions taken out or put back are edited as text, so the ones that stay keep their own text;
  // an emptied list is written [] whole.
  let base = text;
  const bounds = frontmatterBounds(text);
  const list = bounds && nextSuggested.length && !suggested.length ? stringList(text.slice(bounds.start, bounds.end), "domains_suggested") : null;
  if (bounds && list && list.items.length === suggestedNow.length) {
    const keptAt = kept.flatMap((keep, k) => (keep ? [k] : []));
    const newBefore = new Map<number, string[]>();
    const pending: string[] = [];
    if (back && restoreAt !== -1) {
      if (restoreAt < keptAt.length) newBefore.set(keptAt[restoreAt], [back.domain]);
      else pending.push(back.domain);
    }
    base = rewriteList(text, bounds, text.slice(bounds.start, bounds.end), list.flow, list.items, kept, newBefore, pending).text;
    delete values.domains_suggested;
  }
  // A new key goes after `tags`, where a new note has it; editFrontmatter would put it at the end.
  const edited = Object.keys(values).length ? insertAfterTags(base, values) : { text: base, changed: false, warnings: [] };
  return edited.warnings.length ? none(edited) : { ...edited, changed: edited.text !== text, confirmed, removed, suggested };
}

// Sets frontmatter values; a key the frontmatter doesn't have yet goes after `tags` (domains before
// domains_suggested), or at the end without `tags`.
function insertAfterTags(text: string, values: Record<string, unknown>): EditResult {
  const bounds = readableFrontmatter(text);
  if (!bounds) return untouched(text, "The frontmatter can't be read; the note was left unchanged.");
  const present = readNote(text).frontmatter;
  const existing = Object.fromEntries(Object.entries(values).filter(([key]) => key in present));
  const fresh = Object.entries(values).filter(([key]) => !(key in present));
  let result = editFrontmatter(text, existing, false);
  if (result.warnings.length || !fresh.length) return result;
  const frontmatter = result.text.slice(bounds.start, readableFrontmatter(result.text)?.end ?? bounds.end);
  const doc = parseDocument(frontmatter);
  const after = (key: string) => (isMap(doc.contents) ? (doc.contents.items as Pair[]).find((p) => isScalar(p.key) && p.key.value === key) : undefined);
  const anchor = after("domains") ?? after("tags");
  if (!anchor) return editFrontmatter(result.text, Object.fromEntries(fresh), false);
  const end = (anchor.value as { range?: [number, number, number] } | null)?.range?.[1] ?? (anchor.key as { range?: [number, number, number] }).range?.[1] ?? 0;
  const lineEnd = frontmatter[end - 1] === "\n" ? end : (() => {
    const newline = frontmatter.indexOf("\n", end);
    return newline === -1 ? frontmatter.length : newline + 1;
  })();
  const lines = fresh.map(([key, value]) => `${key}: ${valueText(value)}${bounds.eol}`).join("");
  const updated = result.text.slice(0, bounds.start) + frontmatter.slice(0, lineEnd) + lines + frontmatter.slice(lineEnd) + result.text.slice(bounds.start + frontmatter.length);
  result = { text: updated, changed: updated !== text, warnings: [] };
  return result;
}

const WIKILINK = /^\[\[[^[\]\r\n]+\]\]$/;
const isWikilink = (entry: string) => WIKILINK.test(entry.trim()) && findLinks(entry.trim()).length === 1;
// A requested entry's target, and what is written for it when it is new.
const entryTarget = (entry: string) => (isWikilink(entry) ? findLinks(entry.trim())[0].target : entry.trim());
const entryText = (entry: string) => (isWikilink(entry) ? entry.trim() : `[[${entry.trim()}]]`);

// alternatives, edited as text: every entry that stays keeps its exact text (quotes, label, comment
// on its line), a removed one goes with its line (a block list) or its comma (a flow list), and a new
// one is written as a quoted wikilink at its place. An entry with no target can't be named, so it
// stays. The key goes when nothing is left. Reordering is refused. A missing key, an empty value or
// one that isn't a list of strings is written whole.
function editAlternatives(text: string, entries: string[]): EditResult {
  const bounds = frontmatterBounds(text);
  if (!bounds) return untouched(text, "The note has no frontmatter; it was left unchanged.");
  const frontmatter = text.slice(bounds.start, bounds.end);
  const list = stringList(frontmatter, "alternatives");
  if (!list) return editFrontmatter(text, { alternatives: entries.length ? entries.map(entryText) : REMOVE }, false);
  const { items } = list;

  // Match each requested entry to the first unused entry with its target (ignoring case).
  const targetOf = (item: Scalar<string>) => alternativeLinks([item.value])[0]?.target.toLowerCase() ?? null;
  const used = new Set<number>();
  const newBefore = new Map<number, string[]>();
  let pending: string[] = [];
  let last = -1;
  for (const entry of entries) {
    const target = entryTarget(entry).toLowerCase();
    const at = items.findIndex((item, k) => !used.has(k) && targetOf(item) === target);
    if (at === -1) {
      pending.push(entryText(entry));
      continue;
    }
    if (at < last) return untouched(text, "Alternatives can only be added or removed here; change their order in the note's file.");
    used.add(at);
    last = at;
    if (pending.length) newBefore.set(at, pending);
    pending = [];
  }
  const kept = items.map((item, k) => used.has(k) || targetOf(item) === null);
  if (!kept.some(Boolean) && !newBefore.size && !pending.length) return editFrontmatter(text, { alternatives: REMOVE }, false);
  return rewriteList(text, bounds, frontmatter, list.flow, items, kept, newBefore, pending);
}

// A frontmatter key's value when it is a list of at least one string; flow: written [a, b].
function stringList(frontmatter: string, key: string): { flow: boolean; items: Scalar<string>[] } | null {
  const doc = parseDocument(frontmatter);
  const pair = isMap(doc.contents) ? (doc.contents.items as Pair[]).find((p) => isScalar(p.key) && p.key.value === key) : undefined;
  const seq = pair && isSeq(pair.value) ? pair.value : null;
  return seq && seq.items.length && seq.items.every((item) => isScalar(item) && typeof item.value === "string") ? { flow: Boolean(seq.flow), items: seq.items as Scalar<string>[] } : null;
}

// A list rewritten as text: each kept entry keeps its own text (quotes, a comment on its line), a
// dropped one goes with its line (a block list) or its comma (a flow list), and a new value is
// written in RepoMagpie's style before entry k (newBefore) or after the last (pending).
function rewriteList(text: string, bounds: { start: number; end: number; eol: string }, frontmatter: string, flow: boolean, items: Scalar<string>[], kept: boolean[], newBefore: Map<number, string[]>, pending: string[]): EditResult {
  const range = (item: Scalar<string>) => item.range as [number, number, number];
  let start: number;
  let end: number;
  let out = "";
  if (flow) {
    // Between the first and the last entry: the kept entries' own text, with the list's separator.
    start = range(items[0])[0];
    end = range(items[items.length - 1])[1];
    const separator = items.length > 1 ? frontmatter.slice(range(items[0])[1], range(items[1])[0]) : ", ";
    const parts: string[] = [];
    items.forEach((item, k) => {
      parts.push(...(newBefore.get(k) ?? []).map(valueText));
      if (kept[k]) parts.push(frontmatter.slice(range(item)[0], range(item)[1]));
    });
    parts.push(...pending.map(valueText));
    out = parts.join(separator);
  } else {
    // Each entry's lines: from its line to the next entry's (comment lines after it go with it).
    const lineStart = (at: number) => frontmatter.lastIndexOf("\n", at - 1) + 1;
    const lineEnd = (at: number) => {
      if (frontmatter[at - 1] === "\n") return at;
      const newline = frontmatter.indexOf("\n", at);
      return newline === -1 ? frontmatter.length : newline + 1;
    };
    const starts = items.map((item) => lineStart(range(item)[0]));
    start = starts[0];
    end = lineEnd(range(items[items.length - 1])[1]);
    const prefix = frontmatter.slice(starts[0], range(items[0])[0]); // "  - "
    const line = (entry: string) => `${prefix}${valueText(entry)}${bounds.eol}`;
    items.forEach((_, k) => {
      out += (newBefore.get(k) ?? []).map(line).join("");
      if (kept[k]) out += frontmatter.slice(starts[k], k + 1 < items.length ? starts[k + 1] : end);
    });
    out += pending.map(line).join("");
  }
  const result = text.slice(0, bounds.start) + frontmatter.slice(0, start) + out + frontmatter.slice(end) + text.slice(bounds.end);
  return { text: result, changed: result !== text, warnings: [] };
}

function humanFieldProblem(key: string, value: unknown): string | null {
  switch (key) {
    case "kind":
      return typeof value === "string" && KINDS.includes(value) ? null : `kind must be one of: ${KINDS.join(", ")}.`;
    case "tags":
      return Array.isArray(value) && value.every((tag) => typeof tag === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(tag))
        ? null
        : "tags must be a list of lowercase kebab-case tags.";
    case "tried":
      return typeof value === "boolean" ? null : "tried must be true or false.";
    case "rating":
      return value === null || (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5)
        ? null
        : "rating must be a whole number from 1 to 5, or empty.";
    case "alternatives":
      return Array.isArray(value) && value.every((entry) => typeof entry === "string" && ((/^[^[\]|#\r\n]+$/.test(entry) && entry.trim() !== "") || isWikilink(entry)))
        ? null
        : "alternatives must be a list of note names or file stems (without [[ ]], | or #), or of single wikilinks such as [[zod|Zod]].";
    default:
      return `${key} can't be edited by hand; only kind, tags, tried, rating and alternatives can.`;
  }
}

// A person's edit of one section (decision 0023): its body is replaced and nothing else changes.
// Blank lines around the new body are dropped, and one blank line separates it from the next
// section. Saving a draft section accepts it, so the draft marker goes (schema rule 3), unless
// the body is unchanged. A missing section is inserted before the next one in schema order, or at
// the end after the file's own last line; an empty body for a missing section changes nothing. A
// Verdict edit also sets status to match it (schema rule 1). Only notes with readable
// frontmatter are edited.
export function setSection(text: string, name: SectionName, body: string): EditResult {
  if (!SECTION_NAMES.includes(name)) return untouched(text, `"${name}" is not a section of the note schema.`);
  const bounds = readableFrontmatter(text);
  if (!bounds) return untouched(text, "The note has no readable frontmatter; it was left unchanged.");
  const wanted = trimBlankLines(body.replace(/\r\n/g, "\n").split("\n"));
  if (findHeadings(wanted, 0).length) return untouched(text, `The ${name} section can't contain a "## " heading.`);

  const cr = text.includes("\r\n") ? "\r" : "";
  const lines = text.split("\n");
  const headings = findHeadings(lines, bodyStart(text, bounds));
  const block = wanted.filter((line) => line.trim() !== DRAFT_MARKER).map((line) => line + cr);
  const at = headings.findIndex((h) => h.name === name.toLowerCase());
  if (at !== -1) {
    const start = headings[at].line + 1;
    const end = headings[at + 1]?.line ?? lines.length;
    const current = trimBlankLines(lines.slice(start, end).map((line) => line.replace(/\r$/, "")));
    if (current.join("\n") === wanted.join("\n")) return { text, changed: false, warnings: [] };
    lines.splice(start, end - start, ...block, at + 1 < headings.length ? cr : "");
  } else {
    if (!block.length) return { text, changed: false, warnings: [] };
    const order = SECTION_NAMES.indexOf(name);
    const next = headings.find((h) => SECTION_NAMES.findIndex((n) => n.toLowerCase() === h.name) > order);
    if (next) lines.splice(next.line, 0, `## ${name}${cr}`, ...block, cr);
    else {
      // At the end, after the file's own ending: a line break and a blank line only where missing.
      if (lines[lines.length - 1] !== "") {
        lines[lines.length - 1] += cr;
        lines.push("");
      }
      if (lines.length < 2 || lines[lines.length - 2].trim() !== "") lines.splice(lines.length - 1, 0, cr);
      lines.splice(lines.length - 1, 0, `## ${name}${cr}`, ...block);
    }
  }
  let result = lines.join("\n");
  if (name === "Verdict") result = editFrontmatter(result, { status: readNote(result).status }, false).text;
  return { text: result, changed: result !== text, warnings: [] };
}

// Why a list of the person's Use when or Avoid when items can't be written: each is one line of
// text, at most CAPS.item characters, and one request takes at most CAPS.items of them (the caps
// agent-facing output keeps, decision 0032). `label` names the input: "--use-when", "Use when". Null
// when they're fine.
export function itemsProblem(label: string, items: unknown): string | null {
  if (items === undefined) return null;
  if (!Array.isArray(items) || !items.every((item) => typeof item === "string")) return `${label} takes a list of text items.`;
  if (items.length > CAPS.items) return `${label} takes at most ${CAPS.items} items.`;
  const bad = items.find((item) => !item.trim() || /[\r\n]/.test(item.trim()) || item.trim().length > CAPS.item);
  return bad === undefined ? null : `${label} takes one line of text, at most ${CAPS.item} characters: ${JSON.stringify(cut(bad, 80))}.`;
}

export interface ItemsResult extends EditResult {
  added: string[]; // the items written, as given
  present: string[]; // the items the section already had (ignoring case), so not written again
  replacedDraft: boolean;
}

// The person's own items for "Use when" or "Avoid when" (magpie note --use-when / --avoid-when, spec
// §2), one bullet each. A missing or empty section gets them. A section holding only a draft gets them
// in place of the draft: the person decides (decision 0018). A section with the person's own lines
// keeps every one, in order, and gets the new items after its last line; an item it already has,
// ignoring case, isn't added again. A section the edit can't safely reach is left alone, with a
// warning: one that appears twice, or holds a code fence or a comment that doesn't close.
export function addSectionItems(text: string, name: "Use when" | "Avoid when", items: string[]): ItemsResult {
  const result = (edit: EditResult, added: string[] = [], present: string[] = [], replacedDraft = false): ItemsResult =>
    edit.warnings.length ? { ...edit, added: [], present: [], replacedDraft: false } : { ...edit, added, present, replacedDraft };
  const bounds = readableFrontmatter(text);
  if (!bounds) return result(untouched(text, "The note has no readable frontmatter; it was left unchanged."));
  const lines = text.split("\n");
  const headings = findHeadings(lines, bodyStart(text, bounds));
  const found = headings.flatMap((h, k) => (h.name === name.toLowerCase() ? [k] : []));
  const refuse = (why: string) => result(untouched(text, `The note's "${name}" section ${why}, so nothing was written; edit the file instead.`));
  if (found.length > 1) return refuse("appears more than once");

  const wanted: string[] = [];
  for (const item of items.map((i) => i.trim())) if (item && !wanted.some((w) => w.toLowerCase() === item.toLowerCase())) wanted.push(item);
  const bullets = (list: string[], marker = "-") => list.map((item) => `${marker} ${item}`);
  if (!found.length) return result(setSection(text, name, bullets(wanted).join("\n")), wanted);

  const at = found[0];
  const start = headings[at].line + 1;
  const end = headings[at + 1]?.line ?? lines.length;
  const body = lines.slice(start, end).map((line) => line.replace(/\r$/, ""));
  const joined = body.join("\n");
  if (body.filter((line) => /^\s*(```|~~~)/.test(line)).length % 2) return refuse("has a code fence that doesn't close");
  if (joined.lastIndexOf("<!--") > joined.lastIndexOf("-->")) return refuse("has a comment that doesn't close");

  if (body.find((line) => line.trim() !== "")?.trim() === DRAFT_MARKER) {
    return result(setSection(text, name, bullets(wanted).join("\n")), wanted, [], true);
  }
  const have = sectionItems(joined).map((item) => item.toLowerCase());
  const present = wanted.filter((item) => have.includes(item.toLowerCase()));
  const added = wanted.filter((item) => !have.includes(item.toLowerCase()));
  if (!added.length) return result({ text, changed: false, warnings: [] }, [], present);

  // After the section's last line that isn't blank, with its own bullet marker; one blank line before
  // the next heading.
  const cr = text.includes("\r\n") ? "\r" : "";
  const marker = body.map((line) => line.match(/^([-*+])\s/)?.[1]).find(Boolean) ?? "-";
  let last = end - 1;
  while (last >= start && lines[last].trim() === "") last--;
  if (last + 1 === lines.length) {
    lines[last] += cr; // the file's last line had no line break
    lines.push("");
  }
  const block = bullets(added, marker).map((line) => line + cr);
  if (last + 1 < lines.length && last + 1 === end && at + 1 < headings.length) block.push(cr);
  lines.splice(last + 1, 0, ...block);
  return result({ text: lines.join("\n"), changed: true, warnings: [] }, added, present);
}

// "Accept draft" (decision 0023): removes the draft marker of one section and changes nothing else.
// A section that isn't a draft, or is missing, is left as it is.
export function acceptDraft(text: string, name: SectionName): EditResult {
  const bounds = readableFrontmatter(text);
  if (!bounds) return untouched(text, "The note has no readable frontmatter; it was left unchanged.");
  const lines = text.split("\n");
  const headings = findHeadings(lines, bodyStart(text, bounds));
  const at = headings.findIndex((h) => h.name === name.toLowerCase());
  if (at === -1) return { text, changed: false, warnings: [] };
  const end = headings[at + 1]?.line ?? lines.length;
  let first = headings[at].line + 1;
  while (first < end && lines[first].trim() === "") first++;
  if (first === end || lines[first].trim() !== DRAFT_MARKER) return { text, changed: false, warnings: [] };
  lines.splice(first, 1);
  return { text: lines.join("\n"), changed: true, warnings: [] };
}

// Splices new values into the frontmatter. With `toolOnly`, keys that aren't tool-owned are refused.
function editFrontmatter(text: string, values: Record<string, unknown>, toolOnly: boolean): EditResult {
  const warnings: string[] = [];
  const bounds = frontmatterBounds(text);
  if (!bounds) return untouched(text, "The note has no frontmatter; it was left unchanged.");
  const frontmatter = text.slice(bounds.start, bounds.end);
  const doc = parseDocument(frontmatter);
  if (doc.errors.length || (doc.contents !== null && !isMap(doc.contents))) {
    return untouched(text, "The frontmatter can't be read; the note was left unchanged.");
  }
  let current: Record<string, unknown>;
  try {
    current = (doc.toJS(YAML_LIMITS) ?? {}) as Record<string, unknown>;
  } catch {
    return untouched(text, "The frontmatter can't be read; the note was left unchanged."); // too many aliases
  }
  const pairs = isMap(doc.contents) ? (doc.contents.items as Pair[]) : [];
  const edits: { at: number; to: number; insert: string }[] = [];
  const added: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    if (toolOnly && !TOOL_FIELDS.includes(key)) {
      warnings.push(`${key} is not a tool-owned field; it was left unchanged.`);
      continue;
    }
    if (value === undefined) continue;
    if (value === REMOVE) {
      // The key's whole lines: from the start of its line to the end of its value's last line.
      const pair = pairs.find((p) => isScalar(p.key) && p.key.value === key);
      if (!pair) continue;
      const keyRange = (pair.key as { range?: [number, number, number] }).range ?? [0, 0, 0];
      const lineStart = frontmatter.lastIndexOf("\n", keyRange[0] - 1) + 1;
      let end = (pair.value as { range?: [number, number, number] } | null)?.range?.[1] ?? keyRange[1];
      if (frontmatter[end - 1] !== "\n") {
        const newline = frontmatter.indexOf("\n", end);
        end = newline === -1 ? frontmatter.length : newline + 1;
      }
      edits.push({ at: lineStart, to: end, insert: "" });
      continue;
    }
    const old = current[key];
    const isEmpty = old === undefined || old === null || old === "";
    if (SET_ONCE.has(key) && !isEmpty) continue;
    if (key === "license" && value === "unknown" && !isEmpty) continue;
    if (JSON.stringify(old ?? null) === JSON.stringify(value)) continue;

    const newText = value === null ? "" : valueText(value);
    const pair = pairs.find((p) => isScalar(p.key) && p.key.value === key);
    if (!pair) {
      added.push(newText ? `${key}: ${newText}` : `${key}:`);
      continue;
    }
    const keyEnd = (pair.key as { range?: [number, number, number] }).range?.[1] ?? 0;
    const colon = frontmatter.indexOf(":", keyEnd) + 1;
    const range = (pair.value as { range?: [number, number, number] } | null)?.range;
    if (range && range[1] > range[0]) {
      const ending = frontmatter.slice(range[0], range[1]).match(/\r?\n$/)?.[0] ?? "";
      const block = isSeq(pair.value) && !pair.value.flow;
      const lineStart = frontmatter.lastIndexOf("\n", range[0] - 1) + 1;
      const indent = frontmatter.slice(lineStart, range[0]);
      if (block && Array.isArray(value) && value.length && /^[ \t]*$/.test(indent)) {
        // A block list stays a block list, at its own indentation.
        const items = value.map((item) => `- ${valueText(item)}`).join(bounds.eol + indent);
        edits.push({ at: range[0], to: range[1], insert: items + ending });
      } else if (block || value === null) {
        // An emptied block list, or an emptied value: written right after the colon.
        edits.push({ at: colon, to: range[1], insert: (newText ? ` ${newText}` : "") + ending });
      } else {
        edits.push({ at: range[0], to: range[1], insert: newText + ending });
      }
    } else {
      // An empty value: write after the colon and the space that follows it, or after the colon and a
      // new space ("key:   # comment" becomes "key: value  # comment").
      const at = /[ \t]/.test(frontmatter[colon] ?? "") ? colon + 1 : colon;
      edits.push({ at, to: at, insert: newText ? `${at === colon ? " " : ""}${newText}` : "" });
    }
  }

  let result = frontmatter;
  for (const edit of edits.sort((a, b) => b.at - a.at)) result = result.slice(0, edit.at) + edit.insert + result.slice(edit.to);
  for (const line of added) result += line + bounds.eol;
  const newText = text.slice(0, bounds.start) + result + text.slice(bounds.end);
  return { text: newText, changed: newText !== text, warnings };
}

// Appends "- `skill` —" to "Notable skills" as a text insertion (decision 0006, rule 2).
// Existing lines are never edited. Without the section, it is inserted before My notes or Related.
export function appendSkillLine(text: string, skill: string): EditResult {
  if (!skill.trim() || /[`\r\n]/.test(skill)) return untouched(text, `Not a valid skill name: ${JSON.stringify(skill)}.`);
  const bounds = frontmatterBounds(text);
  if (bounds && parseDocument(text.slice(bounds.start, bounds.end)).errors.length) {
    return untouched(text, "The frontmatter can't be read; the note was left unchanged.");
  }
  const cr = text.includes("\r\n") ? "\r" : "";
  const lines = text.split("\n");
  const bodyStart = bounds ? text.slice(0, bounds.end).split("\n").length : 0; // the line after the closing ---
  const headings = findHeadings(lines, bodyStart);
  const newLine = skillLine(skill) + cr;

  const at = headings.findIndex((h) => h.name === "notable skills");
  if (at !== -1) {
    const start = headings[at].line;
    const end = headings[at + 1]?.line ?? lines.length;
    const listed = lines.slice(start + 1, end).some((line) => line.match(/^\s*[-*]\s*`([^`]*)`/)?.[1] === skill);
    if (listed) return { text, changed: false, warnings: [] };
    let last = end - 1;
    while (last > start && lines[last].trim() === "") last--;
    lines.splice(last + 1, 0, newLine);
  } else {
    const before = headings.find((h) => h.name === "my notes" || h.name === "related");
    const section = [`## Notable skills${cr}`, newLine, cr];
    if (before) lines.splice(before.line, 0, ...section);
    else {
      while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
      lines.push(cr, ...section.slice(0, 2), "");
    }
  }
  const result = lines.join("\n");
  return { text: result, changed: result !== text, warnings: [] };
}

function skillLine(skill: string): string {
  return `- \`${skill}\` —`;
}

function valueText(value: unknown): string {
  return stringify(value, { collectionStyle: "flow", flowCollectionPadding: false, lineWidth: 0 }).replace(/\r?\n$/, "");
}

function untouched(text: string, warning: string): EditResult {
  return { text, changed: false, warnings: [warning] };
}

// The frontmatter's text lies between `start` and `end` (the start of the closing --- line).
function frontmatterBounds(text: string): { start: number; end: number; eol: string } | null {
  const offset = text.charCodeAt(0) === 0xfeff ? 1 : 0; // a byte-order mark
  const opening = /^---[ \t]*(\r?\n)/.exec(text.slice(offset));
  if (!opening) return null;
  const start = offset + opening[0].length;
  for (let pos = start; pos <= text.length; ) {
    const newline = text.indexOf("\n", pos);
    const lineEnd = newline === -1 ? text.length : newline;
    if (text.slice(pos, lineEnd).replace(/\r$/, "").trim() === "---") return { start, end: pos, eol: opening[1] };
    if (newline === -1) return null;
    pos = newline + 1;
  }
  return null;
}

// The frontmatter's bounds when it can be read; null for a note without frontmatter or with
// frontmatter that isn't a readable set of fields.
function readableFrontmatter(text: string): { start: number; end: number; eol: string } | null {
  const bounds = frontmatterBounds(text);
  if (!bounds) return null;
  const doc = parseDocument(text.slice(bounds.start, bounds.end));
  return doc.errors.length || (doc.contents !== null && !isMap(doc.contents)) ? null : bounds;
}

// The index of the first line after the frontmatter's closing ---.
function bodyStart(text: string, bounds: { end: number }): number {
  return text.slice(0, bounds.end).split("\n").length;
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end);
}

// "## " headings outside fenced code blocks, with their line index and lowercased name.
function findHeadings(lines: string[], from: number): { line: number; name: string }[] {
  const headings: { line: number; name: string }[] = [];
  let fence: string | null = null;
  for (let i = from; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    const mark = line.match(/^\s*(```|~~~)/)?.[1];
    if (mark) {
      fence = fence === null ? mark : fence === mark ? null : fence;
      continue;
    }
    const heading = fence === null ? line.match(/^##(?:\s+(.*?))?\s*$/) : null;
    if (heading) headings.push({ line: i, name: (heading[1] ?? "").replace(/\s+/g, " ").toLowerCase() });
  }
  return headings;
}
