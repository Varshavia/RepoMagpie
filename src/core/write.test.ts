import { test } from "node:test";
import assert from "node:assert/strict";
import { readNote, validate } from "./note.ts";
import { appendSkillLine, renderNote, setToolFields, setVerdict } from "./write.ts";

// A hand-written note: comments, odd spacing, a block list, an empty value, text above the
// sections, an extra hand-written section, and sections a person typed.
const HAND_WRITTEN = `---
# my own comment about this note
id: pkg:npm/pdfkit
name:   pdfkit      # odd spacing on purpose
url: https://www.npmjs.com/package/pdfkit
license: MIT
topics: [ pdf,  documents ]
explored: 2026-10-01
kind: library
tags:
  - pdf
tried: true
rating:
status: reviewed
---

Some text above the sections.

##  Verdict
avoid: async streams painful; use puppeteer

## Use when
- quick one-page PDFs from a script   <!-- my reminder -->

## My own section
Hand-written, **kept** exactly.

## Notable skills
- \`existing\` — something I wrote

## My notes
Tried it in 2025.
`;

// --- setToolFields: only tool-owned keys change, byte for byte everywhere else ---

test("changing a tool-owned value changes only that value", () => {
  const r = setToolFields(HAND_WRITTEN, { license: "Apache-2.0" });
  assert.equal(r.text, HAND_WRITTEN.replace("license: MIT", "license: Apache-2.0"));
  assert.equal(r.changed, true);
  assert.deepEqual(r.warnings, []);
});

test("a value next to a comment keeps the comment and the spacing around it", () => {
  const r = setToolFields(HAND_WRITTEN, { name: "PDFKit" });
  assert.equal(r.text, HAND_WRITTEN.replace("name:   pdfkit      #", "name:   PDFKit      #"));
});

test("a list value is replaced as one flow list; the rest stays", () => {
  const r = setToolFields(HAND_WRITTEN, { topics: ["pdf", "documents", "print"] });
  assert.equal(r.text, HAND_WRITTEN.replace("topics: [ pdf,  documents ]", "topics: [pdf, documents, print]"));
});

test("setting a value that is already there changes nothing", () => {
  const r = setToolFields(HAND_WRITTEN, { license: "MIT", topics: ["pdf", "documents"], url: "https://www.npmjs.com/package/pdfkit" });
  assert.equal(r.text, HAND_WRITTEN);
  assert.equal(r.changed, false);
});

test("a missing tool-owned key is added at the end of the frontmatter", () => {
  const r = setToolFields(HAND_WRITTEN, { language: "JavaScript" });
  assert.equal(r.text, HAND_WRITTEN.replace("status: reviewed\n---", "status: reviewed\nlanguage: JavaScript\n---"));
});

test("a packages list is added as PURLs in flow style", () => {
  const r = setToolFields(HAND_WRITTEN, { packages: ["pkg:npm/pdfkit"] });
  assert.equal(r.text, HAND_WRITTEN.replace("status: reviewed\n---", "status: reviewed\npackages: [pkg:npm/pdfkit]\n---"));
});

test("license is never replaced with unknown (rule 2)", () => {
  const r = setToolFields(HAND_WRITTEN, { license: "unknown" });
  assert.equal(r.text, HAND_WRITTEN);
  assert.equal(r.changed, false);
});

test("license unknown is written when there is no licence yet", () => {
  const r = setToolFields(HAND_WRITTEN.replace("license: MIT\n", ""), { license: "unknown" });
  assert.match(r.text, /\nlicense: unknown\n---/);
});

test("explored is set once and never refreshed", () => {
  const r = setToolFields(HAND_WRITTEN, { explored: "2026-10-03" });
  assert.equal(r.text, HAND_WRITTEN);
  assert.equal(r.changed, false);
});

test("human-owned keys are refused with a warning; nothing changes", () => {
  const r = setToolFields(HAND_WRITTEN, { kind: "framework" } as never);
  assert.equal(r.text, HAND_WRITTEN);
  assert.equal(r.changed, false);
  assert.equal(r.warnings.length, 1);
});

test("an empty value gets filled after the colon", () => {
  const text = HAND_WRITTEN.replace("url: https://www.npmjs.com/package/pdfkit", "url:");
  const r = setToolFields(text, { url: "https://www.npmjs.com/package/pdfkit" });
  assert.equal(r.text, HAND_WRITTEN);
});

test("CRLF line endings are kept", () => {
  const crlf = HAND_WRITTEN.replace(/\n/g, "\r\n");
  const r = setToolFields(crlf, { license: "Apache-2.0", language: "JavaScript" });
  assert.equal(r.text, crlf.replace("license: MIT", "license: Apache-2.0").replace("status: reviewed\r\n---", "status: reviewed\r\nlanguage: JavaScript\r\n---"));
});

test("an unparsable frontmatter is left untouched with a warning", () => {
  const broken = HAND_WRITTEN.replace("topics: [ pdf,  documents ]", "topics: [ pdf,  documents");
  const r = setToolFields(broken, { license: "Apache-2.0" });
  assert.equal(r.text, broken);
  assert.equal(r.changed, false);
  assert.equal(r.warnings.length, 1);
});

test("a note without frontmatter is left untouched with a warning", () => {
  const text = "## Verdict\nok\n";
  const r = setToolFields(text, { license: "MIT" });
  assert.equal(r.text, text);
  assert.equal(r.warnings.length, 1);
});

// --- appendSkillLine: a text insertion; existing lines are never edited ---

test("a new skill line goes after the last line of Notable skills", () => {
  const r = appendSkillLine(HAND_WRITTEN, "new-skill");
  assert.equal(r.text, HAND_WRITTEN.replace("- `existing` — something I wrote\n", "- `existing` — something I wrote\n- `new-skill` —\n"));
  assert.equal(r.changed, true);
});

test("a skill that is already listed is not added again", () => {
  const r = appendSkillLine(HAND_WRITTEN, "existing");
  assert.equal(r.text, HAND_WRITTEN);
  assert.equal(r.changed, false);
});

test("an empty Notable skills section gets its first line right after the heading", () => {
  const text = HAND_WRITTEN.replace("- `existing` — something I wrote\n", "");
  const r = appendSkillLine(text, "new-skill");
  assert.equal(r.text, text.replace("## Notable skills\n", "## Notable skills\n- `new-skill` —\n"));
});

test("without a Notable skills section, one is inserted before My notes", () => {
  const text = HAND_WRITTEN.replace("## Notable skills\n- `existing` — something I wrote\n\n", "");
  const r = appendSkillLine(text, "new-skill");
  assert.equal(r.text, text.replace("## My notes\n", "## Notable skills\n- `new-skill` —\n\n## My notes\n"));
});

test("without Notable skills, My notes or Related, the section goes at the end after a blank line", () => {
  const text = "---\nid: pkg:npm/pdfkit\n---\n\n## Verdict\nok\n";
  const r = appendSkillLine(text, "new-skill");
  assert.equal(r.text, "---\nid: pkg:npm/pdfkit\n---\n\n## Verdict\nok\n\n## Notable skills\n- `new-skill` —\n");
});

test("a '## Notable skills' line inside a code block is not the section", () => {
  const text = HAND_WRITTEN.replace("Hand-written, **kept** exactly.", "```\n## Notable skills\n```");
  const r = appendSkillLine(text, "new-skill");
  assert.equal(r.text, text.replace("- `existing` — something I wrote\n", "- `existing` — something I wrote\n- `new-skill` —\n"));
});

test("appending a skill keeps CRLF line endings", () => {
  const crlf = HAND_WRITTEN.replace(/\n/g, "\r\n");
  const r = appendSkillLine(crlf, "new-skill");
  assert.equal(r.text, crlf.replace("- `existing` — something I wrote\r\n", "- `existing` — something I wrote\r\n- `new-skill` —\r\n"));
});

test("a skill name with a backtick is refused with a warning", () => {
  const r = appendSkillLine(HAND_WRITTEN, "bad`name");
  assert.equal(r.text, HAND_WRITTEN);
  assert.equal(r.warnings.length, 1);
});

test("appendSkillLine leaves a file with unparsable frontmatter untouched", () => {
  const broken = HAND_WRITTEN.replace("topics: [ pdf,  documents ]", "topics: [ pdf,  documents");
  const r = appendSkillLine(broken, "new-skill");
  assert.equal(r.text, broken);
  assert.equal(r.warnings.length, 1);
});

// --- setVerdict: the user's own text into an empty Verdict, and status: reviewed (spec §2) ---

const NO_VERDICT = HAND_WRITTEN.replace("avoid: async streams painful; use puppeteer\n", "").replace("status: reviewed", "status: inbox");

test("a Verdict goes right after an empty Verdict heading; status becomes reviewed; nothing else changes", () => {
  const r = setVerdict(NO_VERDICT, "use it for one-page PDFs only");
  assert.equal(r.text, NO_VERDICT.replace("status: inbox", "status: reviewed").replace("##  Verdict\n", "##  Verdict\nuse it for one-page PDFs only\n"));
  assert.equal(r.changed, true);
  assert.deepEqual(r.warnings, []);
});

test("a Verdict section holding only a comment counts as empty; the comment stays", () => {
  const text = NO_VERDICT.replace("##  Verdict\n", "##  Verdict\n<!-- one line -->\n");
  const r = setVerdict(text, "ok");
  assert.equal(r.text, text.replace("status: inbox", "status: reviewed").replace("##  Verdict\n", "##  Verdict\nok\n"));
});

test("an existing Verdict is never overwritten", () => {
  const r = setVerdict(HAND_WRITTEN, "something else");
  assert.equal(r.text, HAND_WRITTEN);
  assert.equal(r.changed, false);
  assert.equal(r.warnings.length, 1);
});

test("without a Verdict section, one is inserted before the first section", () => {
  const text = NO_VERDICT.replace("##  Verdict\n\n", "");
  const r = setVerdict(text, "ok");
  assert.equal(r.text, text.replace("status: inbox", "status: reviewed").replace("## Use when\n", "## Verdict\nok\n\n## Use when\n"));
});

test("without any section, the Verdict goes at the end after a blank line", () => {
  const text = "---\nid: pkg:npm/pdfkit\nstatus: inbox\n---\n\nSome text.\n";
  const r = setVerdict(text, "ok");
  assert.equal(r.text, "---\nid: pkg:npm/pdfkit\nstatus: reviewed\n---\n\nSome text.\n\n## Verdict\nok\n");
});

test("a missing status is added as reviewed", () => {
  const text = NO_VERDICT.replace("status: inbox\n", "");
  const r = setVerdict(text, "ok");
  assert.equal(r.text, text.replace("rating:\n---", "rating:\nstatus: reviewed\n---").replace("##  Verdict\n", "##  Verdict\nok\n"));
});

test("setVerdict keeps CRLF line endings", () => {
  const crlf = NO_VERDICT.replace(/\n/g, "\r\n");
  const r = setVerdict(crlf, "ok");
  assert.equal(r.text, crlf.replace("status: inbox", "status: reviewed").replace("##  Verdict\r\n", "##  Verdict\r\nok\r\n"));
});

test("a Verdict of more than one line, or an empty one, is refused", () => {
  for (const verdict of ["two\nlines", "   "]) {
    const r = setVerdict(NO_VERDICT, verdict);
    assert.equal(r.text, NO_VERDICT);
    assert.equal(r.warnings.length, 1);
  }
});

test("setVerdict leaves a note without readable frontmatter untouched", () => {
  const broken = NO_VERDICT.replace("topics: [ pdf,  documents ]", "topics: [ pdf,  documents");
  for (const text of [broken, "## Verdict\n\n## Use when\n"]) {
    const r = setVerdict(text, "ok");
    assert.equal(r.text, text);
    assert.equal(r.warnings.length, 1);
  }
});

test("the result validates as reviewed", () => {
  const r = setVerdict(NO_VERDICT, "ok");
  const note = readNote(r.text);
  assert.equal(note.status, "reviewed");
  assert.equal(note.frontmatter.status, "reviewed");
});

// --- renderNote: strict canonical format for new notes ---

const CANONICAL_INBOX = `---
id: pkg:github/microsoft/playwright-cli
name: microsoft/playwright-cli
url: https://github.com/microsoft/playwright-cli
language: TypeScript
license: Apache-2.0
topics: [playwright, testing]
packages: [pkg:npm/%40playwright/cli]
explored: 2026-10-03
kind: cli
tags: [testing]
tried: false
rating:
status: inbox
---

## Verdict

## Use when
<!-- magpie:draft -->
- letting an agent test a web UI end to end

## Avoid when

## What it does
<!-- magpie:draft -->
Playwright browser automation as a CLI, with a skill for coding agents.

## How to use

## Notable skills
- \`playwright-cli\` —

## My notes

## Related
`;

test("renders a new note in the canonical format", () => {
  const text = renderNote({
    id: "pkg:github/microsoft/playwright-cli",
    name: "microsoft/playwright-cli",
    url: "https://github.com/microsoft/playwright-cli",
    language: "TypeScript",
    license: "Apache-2.0",
    topics: ["playwright", "testing"],
    packages: ["pkg:npm/%40playwright/cli"],
    explored: "2026-10-03",
    kind: "cli",
    tags: ["testing"],
    useWhen: ["letting an agent test a web UI end to end"],
    whatItDoes: "Playwright browser automation as a CLI, with a skill for coding agents.",
    skills: ["playwright-cli"],
    drafts: ["Use when", "What it does"],
  });
  assert.equal(text, CANONICAL_INBOX);
  assert.deepEqual(validate(readNote(text), { fileName: "github--microsoft--playwright-cli.md" }), []);
});

test("a note rendered with a Verdict is reviewed and validates", () => {
  const text = renderNote({ id: "pkg:npm/pdfkit", name: "pdfkit", explored: "2026-10-03", kind: "library", tags: ["pdf"], verdict: "avoid: async streams painful; use puppeteer" });
  const note = readNote(text);
  assert.equal(note.frontmatter.status, "reviewed");
  assert.equal(note.verdict, "avoid: async streams painful; use puppeteer");
  assert.deepEqual(validate(note), []);
});

test("values that need quoting are quoted", () => {
  const text = renderNote({ id: "pkg:npm/pdfkit", name: "pdfkit: the PDF library", explored: "2026-10-03", kind: "library", tags: [] });
  assert.equal(readNote(text).frontmatter.name, "pdfkit: the PDF library");
});
