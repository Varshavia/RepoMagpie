import { test } from "node:test";
import assert from "node:assert/strict";
import { readNote, validate } from "./note.ts";
import { acceptDraft, appendSkillLine, renderNote, setHumanFields, setSection, setToolFields, setVerdict } from "./write.ts";

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

// --- setSection: a person's edit of one section's body (decision 0023); the rest byte for byte ---

const USE_WHEN = "- quick one-page PDFs from a script   <!-- my reminder -->\n";
const DRAFTED = HAND_WRITTEN.replace("## My own section", "## What it does\n<!-- magpie:draft -->\nA PDF library.\n\n## My own section");

test("setSection replaces only that section's body", () => {
  const r = setSection(HAND_WRITTEN, "Use when", "- in scripts\n- in CI");
  assert.equal(r.text, HAND_WRITTEN.replace(USE_WHEN, "- in scripts\n- in CI\n"));
  assert.equal(r.changed, true);
  assert.deepEqual(r.warnings, []);
});

test("blank lines around the new body are trimmed; one blank line separates it from the next section", () => {
  const r = setSection(HAND_WRITTEN, "Use when", "\n\n- in scripts\n\n\n");
  assert.equal(r.text, HAND_WRITTEN.replace(USE_WHEN, "- in scripts\n"));
});

test("the last section ends with one line break", () => {
  const r = setSection(HAND_WRITTEN, "My notes", "New.");
  assert.equal(r.text, HAND_WRITTEN.replace("Tried it in 2025.\n", "New.\n"));
});

test("an empty body leaves the heading and one blank line", () => {
  const r = setSection(HAND_WRITTEN, "Use when", "");
  assert.equal(r.text, HAND_WRITTEN.replace(`## Use when\n${USE_WHEN}`, "## Use when\n"));
});

test("a missing section is inserted before the next section in schema order", () => {
  const r = setSection(HAND_WRITTEN, "Avoid when", "- big files");
  assert.equal(r.text, HAND_WRITTEN.replace("## Notable skills\n", "## Avoid when\n- big files\n\n## Notable skills\n"));
});

test("a missing section with no later section goes at the end after a blank line", () => {
  const r = setSection(HAND_WRITTEN, "Related", "[[puppeteer]]");
  assert.equal(r.text, `${HAND_WRITTEN}\n## Related\n[[puppeteer]]\n`);
});

test("saving an edited draft removes its draft marker (schema rule 3)", () => {
  for (const body of ["<!-- magpie:draft -->\nA library for PDFs.", "A library for PDFs."]) {
    const r = setSection(DRAFTED, "What it does", body);
    assert.equal(r.text, DRAFTED.replace("<!-- magpie:draft -->\nA PDF library.\n", "A library for PDFs.\n"));
  }
});

test("a body equal to the current one changes nothing, so a draft stays a draft", () => {
  const r = setSection(DRAFTED, "What it does", "<!-- magpie:draft -->\nA PDF library.\n");
  assert.equal(r.text, DRAFTED);
  assert.equal(r.changed, false);
});

test("setSection on the Verdict keeps status in step with it (schema rule 1)", () => {
  const changed = setSection(HAND_WRITTEN, "Verdict", "use it for one-page PDFs");
  assert.equal(changed.text, HAND_WRITTEN.replace("avoid: async streams painful; use puppeteer", "use it for one-page PDFs"));
  const cleared = setSection(HAND_WRITTEN, "Verdict", "");
  assert.equal(cleared.text, HAND_WRITTEN.replace("status: reviewed", "status: inbox").replace("avoid: async streams painful; use puppeteer\n", ""));
  assert.equal(readNote(cleared.text).status, "inbox");
});

test("a heading inside a code block is not a section", () => {
  const text = HAND_WRITTEN.replace("Hand-written, **kept** exactly.", "```\n## Use when\n```");
  const r = setSection(text, "Use when", "- in CI");
  assert.equal(r.text, text.replace(USE_WHEN, "- in CI\n"));
});

test("setSection keeps CRLF line endings", () => {
  const crlf = HAND_WRITTEN.replace(/\n/g, "\r\n");
  const r = setSection(crlf, "Use when", "- in scripts\n- in CI");
  assert.equal(r.text, crlf.replace(USE_WHEN.replace("\n", "\r\n"), "- in scripts\r\n- in CI\r\n"));
});

test("setSection refuses an unknown section, a body with a section heading, and unreadable frontmatter", () => {
  const broken = HAND_WRITTEN.replace("topics: [ pdf,  documents ]", "topics: [ pdf,  documents");
  const cases: [string, string, string][] = [
    [HAND_WRITTEN, "My own section", "x"],
    [HAND_WRITTEN, "Use when", "- a\n## Sneaky\n- b"],
    [broken, "Use when", "- a"],
    ["## Verdict\n\n## Use when\n", "Use when", "- a"],
  ];
  for (const [text, name, body] of cases) {
    const r = setSection(text, name as never, body);
    assert.equal(r.text, text);
    assert.equal(r.changed, false);
    assert.equal(r.warnings.length, 1, name);
  }
});

// --- setHumanFields: kind, tags, tried and rating only (decision 0023) ---

test("setHumanFields changes only the given values", () => {
  const r = setHumanFields(HAND_WRITTEN, { kind: "framework", tried: false });
  assert.equal(r.text, HAND_WRITTEN.replace("kind: library", "kind: framework").replace("tried: true", "tried: false"));
  assert.deepEqual(r.warnings, []);
});

test("a block list stays a block list", () => {
  const r = setHumanFields(HAND_WRITTEN, { tags: ["pdf", "testing"] });
  assert.equal(r.text, HAND_WRITTEN.replace("tags:\n  - pdf\n", "tags:\n  - pdf\n  - testing\n"));
});

test("an emptied block list becomes []", () => {
  const r = setHumanFields(HAND_WRITTEN, { tags: [] });
  assert.equal(r.text, HAND_WRITTEN.replace("tags:\n  - pdf\n", "tags: []\n"));
});

test("a flow list stays a flow list", () => {
  const text = HAND_WRITTEN.replace("tags:\n  - pdf\n", "tags: [pdf]\n");
  const r = setHumanFields(text, { tags: ["pdf", "testing"] });
  assert.equal(r.text, text.replace("tags: [pdf]", "tags: [pdf, testing]"));
});

test("rating is filled in and emptied again", () => {
  const rated = setHumanFields(HAND_WRITTEN, { rating: 3 });
  assert.equal(rated.text, HAND_WRITTEN.replace("rating:\n", "rating: 3\n"));
  assert.equal(setHumanFields(rated.text, { rating: null }).text, HAND_WRITTEN);
});

test("a missing human-owned key is added at the end of the frontmatter", () => {
  const text = HAND_WRITTEN.replace("rating:\n", "");
  const r = setHumanFields(text, { rating: 4 });
  assert.equal(r.text, text.replace("status: reviewed\n---", "status: reviewed\nrating: 4\n---"));
});

test("setHumanFields keeps CRLF line endings", () => {
  const crlf = HAND_WRITTEN.replace(/\n/g, "\r\n");
  const r = setHumanFields(crlf, { tags: ["pdf", "testing"], rating: 2 });
  assert.equal(r.text, crlf.replace("tags:\r\n  - pdf\r\n", "tags:\r\n  - pdf\r\n  - testing\r\n").replace("rating:\r\n", "rating: 2\r\n"));
});

test("invalid values, tool-owned keys and status are refused; nothing changes", () => {
  const cases = [{ kind: "gadget" }, { tags: ["Not Kebab"] }, { tags: "pdf" }, { tried: "yes" }, { rating: 6 }, { rating: 2.5 }, { name: "PDFKit" }, { status: "inbox" }];
  for (const values of cases) {
    const r = setHumanFields(HAND_WRITTEN, values as never);
    assert.equal(r.text, HAND_WRITTEN, JSON.stringify(values));
    assert.equal(r.warnings.length, 1, JSON.stringify(values));
  }
});

// --- acceptDraft: the draft marker goes, the text stays ---

test("acceptDraft removes only the marker line", () => {
  const r = acceptDraft(DRAFTED, "What it does");
  assert.equal(r.text, DRAFTED.replace("<!-- magpie:draft -->\n", ""));
  assert.equal(r.changed, true);
});

test("acceptDraft on a section that isn't a draft, or is missing, changes nothing", () => {
  for (const name of ["Use when", "Avoid when"] as const) {
    const r = acceptDraft(DRAFTED, name);
    assert.equal(r.text, DRAFTED);
    assert.equal(r.changed, false);
    assert.deepEqual(r.warnings, []);
  }
});

test("acceptDraft keeps CRLF line endings", () => {
  const crlf = DRAFTED.replace(/\n/g, "\r\n");
  assert.equal(acceptDraft(crlf, "What it does").text, crlf.replace("<!-- magpie:draft -->\r\n", ""));
});
