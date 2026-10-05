// A person's edit of one note in the local app (decision 0023, docs/ui.md §5): the PATCH request's
// edits, checked and applied through the round-trip-safe functions in write.ts. All or nothing:
// one bad edit and nothing is applied. Pure: text in, text out; never prints.
import { createHash } from "node:crypto";
import { readNote, SECTION_NAMES, type SectionName } from "./note.ts";
import { acceptDraft, setHumanFields, setSection, setVerdict, type EditResult, type HumanFields } from "./write.ts";

export interface NoteEdits {
  verdict?: unknown; // one line; "" clears it
  sections?: unknown; // {"<section name>": "<body>"}
  fields?: unknown; // {"kind", "tags", "tried", "rating"}
  accept_drafts?: unknown; // ["<section name>"]
}

export type EditOutcome = { ok: true; text: string; changed: boolean } | { ok: false; error: string };

const EDIT_KEYS = ["verdict", "sections", "fields", "accept_drafts"];

// A note's version: the SHA-256 of the file's bytes (decision 0023).
export function noteVersion(bytes: Buffer | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function editNote(text: string, edits: NoteEdits): EditOutcome {
  const fail = (error: string): EditOutcome => ({ ok: false, error });
  const unknown = Object.keys(edits).find((key) => !EDIT_KEYS.includes(key));
  if (unknown) return fail(unknown === "status" ? "status can't be set; it follows the Verdict." : `${unknown} can't be edited.`);

  const steps: ((text: string) => EditResult)[] = [];
  const { verdict, sections, fields, accept_drafts: drafts } = edits;
  if (fields !== undefined) {
    if (!isObject(fields)) return fail("fields must be an object, such as {\"tried\": true}.");
    steps.push((t) => setHumanFields(t, fields as HumanFields));
  }
  if (sections !== undefined) {
    if (!isObject(sections)) return fail("sections must be an object, such as {\"Use when\": \"- in scripts\"}.");
    for (const [name, body] of Object.entries(sections)) {
      if (name === "Verdict") return fail("Set the Verdict with \"verdict\", not in sections.");
      if (!isSectionName(name)) return fail(`"${name}" is not a section of the note schema.`);
      if (typeof body !== "string") return fail(`The body of ${name} must be text.`);
      steps.push((t) => setSection(t, name, body));
    }
  }
  if (verdict !== undefined) {
    if (typeof verdict !== "string" || /[\r\n]/.test(verdict.trim())) return fail("The Verdict must be one line of text.");
    const line = verdict.trim();
    steps.push((t) => {
      const current = readNote(t).verdict;
      if (line === current) return { text: t, changed: false, warnings: [] };
      return current === "" ? setVerdict(t, line) : setSection(t, "Verdict", line);
    });
  }
  if (drafts !== undefined) {
    if (!Array.isArray(drafts)) return fail("accept_drafts must be a list of section names.");
    for (const name of drafts) {
      if (typeof name !== "string" || !isSectionName(name)) return fail(`"${String(name)}" is not a section of the note schema.`);
      steps.push((t) => acceptDraft(t, name));
    }
  }

  let result = text;
  for (const step of steps) {
    const edit = step(result);
    if (edit.warnings.length) return fail(edit.warnings[0]);
    result = edit.text;
  }
  return { ok: true, text: result, changed: result !== text };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSectionName(name: string): name is SectionName {
  return (SECTION_NAMES as readonly string[]).includes(name);
}
