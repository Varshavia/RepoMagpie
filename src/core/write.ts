// Writing notes: the canonical format for new notes, and round-trip-safe edits of existing ones.
// Edits splice text at the positions the yaml Document API reports, so every byte outside
// the intended change stays as the person wrote it (note schema, rules 2 and 8).
// Pure functions on text; no file system, no printing.
import { isMap, isScalar, parseDocument, stringify, type Pair } from "yaml";
import { DRAFT_MARKER, SECTION_NAMES, type SectionName } from "./note.ts";

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
  const warnings: string[] = [];
  const bounds = frontmatterBounds(text);
  if (!bounds) return untouched(text, "The note has no frontmatter; it was left unchanged.");
  const frontmatter = text.slice(bounds.start, bounds.end);
  const doc = parseDocument(frontmatter);
  if (doc.errors.length || (doc.contents !== null && !isMap(doc.contents))) {
    return untouched(text, "The frontmatter can't be read; the note was left unchanged.");
  }
  const current = (doc.toJS() ?? {}) as Record<string, unknown>;
  const pairs = isMap(doc.contents) ? (doc.contents.items as Pair[]) : [];
  const edits: { at: number; to: number; insert: string }[] = [];
  const added: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    if (!TOOL_FIELDS.includes(key)) {
      warnings.push(`${key} is not a tool-owned field; it was left unchanged.`);
      continue;
    }
    if (value === undefined) continue;
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
    const range = (pair.value as { range?: [number, number, number] } | null)?.range;
    if (range && range[1] > range[0]) {
      const ending = frontmatter.slice(range[0], range[1]).match(/\r?\n$/)?.[0] ?? "";
      edits.push({ at: range[0], to: range[1], insert: newText + ending });
    } else {
      // An empty value: write right after the colon.
      const keyEnd = (pair.key as { range?: [number, number, number] }).range?.[1] ?? 0;
      const colon = frontmatter.indexOf(":", keyEnd) + 1;
      const space = /[ \t]/.test(frontmatter[colon] ?? "") ? "" : " ";
      edits.push({ at: colon, to: colon, insert: newText ? `${space}${newText}` : "" });
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
  const offset = text.startsWith("﻿") ? 1 : 0;
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
