// Reading notes: lenient read and validation against note schema v1.
// Pure functions on the file's text; no file system, no printing.
import { parse as parseYaml } from "yaml";
import { fileNameFor, resolveTarget } from "./identity.ts";

export const SECTION_NAMES = ["Verdict", "Use when", "Avoid when", "What it does", "How to use", "Notable skills", "My notes", "Related"] as const;
export type SectionName = (typeof SECTION_NAMES)[number];

export const KINDS = ["skill-pack", "cli", "library", "framework", "plugin", "app", "platform", "awesome-list", "template", "other"];
export const DRAFT_MARKER = "<!-- magpie:draft -->";
// Sections that may carry the draft marker (note schema, rule 3): AI drafts What it does and
// Use when; import's use: and avoid: text gives draft Use when and Avoid when (rule 7).
const DRAFTABLE: readonly string[] = ["What it does", "Use when", "Avoid when"];
const REQUIRED = ["id", "name", "explored", "kind", "tags", "tried", "status"];

export interface Section {
  heading: string; // as written
  name: SectionName | null; // canonical name, or null for an unknown section
  body: string; // the lines after the heading, as written
  draft: boolean; // starts with the draft marker
}

export interface Note {
  hasFrontmatter: boolean;
  frontmatter: Record<string, unknown>;
  preamble: string; // text between the frontmatter and the first section
  sections: Section[];
  verdict: string; // the Verdict without comments, trimmed; "" when empty or missing
  status: "inbox" | "reviewed"; // derived from the Verdict (rule 1), whatever the field says
  warnings: string[];
}

export interface Problem {
  where: string; // "frontmatter", "frontmatter.<field>", "section.<name>", "sections" or "file"
  message: string;
}

// Lenient read: missing frontmatter, fields or sections are allowed; unknown sections are kept.
export function readNote(text: string): Note {
  const lines = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
  const warnings: string[] = [];
  let frontmatter: Record<string, unknown> = {};
  let hasFrontmatter = false;
  let start = 0;

  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (end > 0) {
      hasFrontmatter = true;
      start = end + 1;
      try {
        const parsed: unknown = parseYaml(lines.slice(1, end).join("\n"));
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) frontmatter = parsed as Record<string, unknown>;
        else if (parsed !== null) warnings.push("The frontmatter is not a set of fields.");
      } catch (error) {
        warnings.push(`The frontmatter can't be read: ${(error as Error).message.split("\n")[0]}`);
      }
    }
  }

  const preamble: string[] = [];
  const parts: { heading: string; name: SectionName | null; lines: string[] }[] = [];
  let fence: string | null = null;
  for (const line of lines.slice(start)) {
    const fenceMark = line.match(/^\s*(```|~~~)/)?.[1];
    if (fenceMark) fence = fence === null ? fenceMark : fence === fenceMark ? null : fence;
    const heading = fence === null && !fenceMark ? line.match(/^##(?:\s+(.*?))?\s*$/) : null;
    if (heading) {
      const title = (heading[1] ?? "").replace(/\s+/g, " ");
      const name = SECTION_NAMES.find((n) => n.toLowerCase() === title.toLowerCase()) ?? null;
      parts.push({ heading: title, name, lines: [] });
    } else if (parts.length) {
      parts[parts.length - 1].lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  const sections: Section[] = parts.map(({ heading, name, lines: body }) => ({
    heading,
    name,
    body: body.join("\n"),
    draft: body.find((line) => line.trim() !== "")?.trim() === DRAFT_MARKER,
  }));

  const verdictSection = sections.find((s) => s.name === "Verdict");
  const verdict = verdictSection ? stripComments(verdictSection.body).trim() : "";
  return {
    hasFrontmatter,
    frontmatter,
    preamble: preamble.join("\n"),
    sections,
    verdict,
    status: verdict === "" ? "inbox" : "reviewed",
    warnings,
  };
}

// Reports every schema problem it finds; never throws.
export function validate(note: Note, options: { fileName?: string } = {}): Problem[] {
  const problems: Problem[] = [];
  const add = (where: string, message: string) => problems.push({ where, message });

  if (!note.hasFrontmatter) add("frontmatter", "The note has no frontmatter.");
  else if (note.warnings.length) add("frontmatter", note.warnings[0]);
  else checkFields(note, add);

  checkSections(note, add);

  const id = note.frontmatter.id;
  if (options.fileName && typeof id === "string" && resolveTarget(id).kind === "ok") {
    const expected = fileNameFor(id);
    if (expected !== options.fileName) add("file", `The file should be named ${expected}, after its id.`);
  }
  return problems;
}

function checkFields(note: Note, add: (where: string, message: string) => void): void {
  const fm = note.frontmatter;
  const empty = (value: unknown) => value === undefined || value === null || value === "";
  for (const field of REQUIRED) if (empty(fm[field])) add(`frontmatter.${field}`, `${field} is required.`);

  if (!empty(fm.id)) {
    const problem = purlProblem(fm.id, ["github", "npm", "pypi", "cargo"]);
    if (problem) add("frontmatter.id", `id ${problem}`);
  }
  if (!empty(fm.name) && typeof fm.name !== "string") add("frontmatter.name", "name must be text.");
  for (const field of ["url", "language", "license"]) {
    if (!empty(fm[field]) && typeof fm[field] !== "string") add(`frontmatter.${field}`, `${field} must be text.`);
  }
  for (const field of ["explored", "adopted"]) {
    if (!empty(fm[field]) && !isDate(fm[field])) add(`frontmatter.${field}`, `${field} must be a date written YYYY-MM-DD.`);
  }
  if (!empty(fm.kind) && !KINDS.includes(fm.kind as string)) add("frontmatter.kind", `kind must be one of: ${KINDS.join(", ")}.`);

  if (!empty(fm.tags)) {
    if (!isTextList(fm.tags)) add("frontmatter.tags", "tags must be a list.");
    else {
      const bad = fm.tags.filter((tag) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tag));
      if (bad.length) add("frontmatter.tags", `Tags must be lowercase kebab-case: ${bad.join(", ")}.`);
    }
  }
  if (!empty(fm.topics) && !isTextList(fm.topics)) add("frontmatter.topics", "topics must be a list.");
  if (!empty(fm.packages)) {
    if (!isTextList(fm.packages)) add("frontmatter.packages", "packages must be a list of PURLs.");
    else {
      const bad = fm.packages.filter((p) => purlProblem(p, ["npm", "pypi", "cargo"]));
      if (bad.length) add("frontmatter.packages", `packages must be package PURLs without a version: ${bad.join(", ")}.`);
    }
  }
  if (!empty(fm.tried) && typeof fm.tried !== "boolean") add("frontmatter.tried", "tried must be true or false.");
  if (!empty(fm.rating) && !(Number.isInteger(fm.rating) && (fm.rating as number) >= 1 && (fm.rating as number) <= 5)) {
    add("frontmatter.rating", "rating must be a whole number from 1 to 5, or empty.");
  }

  if (!empty(fm.status)) {
    if (fm.status !== "inbox" && fm.status !== "reviewed") add("frontmatter.status", "status must be inbox or reviewed.");
    else if (fm.status !== note.status) {
      add("frontmatter.status", note.status === "inbox"
        ? "status says reviewed, but the Verdict is empty."
        : "status says inbox, but the note has a Verdict; it should be reviewed.");
    }
  }
}

function checkSections(note: Note, add: (where: string, message: string) => void): void {
  const seen = new Set<string>();
  const firsts: number[] = [];
  for (const section of note.sections) {
    if (!section.name) continue;
    if (seen.has(section.name)) add("sections", `"${section.name}" appears more than once.`);
    else {
      seen.add(section.name);
      firsts.push(SECTION_NAMES.indexOf(section.name));
    }
  }
  if (firsts.some((index, i) => i > 0 && index < firsts[i - 1])) add("sections", `Sections must be in this order: ${SECTION_NAMES.join(", ")}.`);

  if (note.verdict.includes("\n")) add("section.Verdict", "The Verdict must be one line.");
  for (const section of note.sections) {
    if (section.draft && !DRAFTABLE.includes(section.name ?? "")) {
      add(`section.${section.name ?? section.heading}`, `Only ${DRAFTABLE.join(", ")} may carry the draft marker.`);
    }
  }
}

// Returns why a value is not a supported PURL without a version, or null.
function purlProblem(value: unknown, types: string[]): string | null {
  if (typeof value !== "string" || !value.startsWith("pkg:")) return "must be a PURL, e.g. pkg:npm/pdfkit.";
  const resolved = resolveTarget(value);
  if (resolved.kind !== "ok" || !types.includes(value.slice(4).split("/")[0])) return `must be a PURL of type ${types.join(", ")}.`;
  if (resolved.purl !== value) return `must be written ${resolved.purl} (no version).`;
  return null;
}

function isDate(value: unknown): boolean {
  return value instanceof Date || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}
