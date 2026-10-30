import { test } from "node:test";
import assert from "node:assert/strict";
import { captureNote, type CaptureInput } from "./capture.ts";
import type { RepoMetadata } from "./github.ts";
import { readNote, validate } from "./note.ts";
import { fileNameFor } from "./identity.ts";

const PLAYWRIGHT: RepoMetadata = {
  name: "microsoft/playwright-cli",
  url: "https://github.com/microsoft/playwright-cli",
  description: "CLI for common Playwright actions.",
  language: "JavaScript",
  license: "Apache-2.0",
  topics: ["playwright", "testing"],
  skills: ["dev", "playwright-cli"],
  skillFolders: 1,
  template: false,
  packages: ["pkg:npm/%40playwright/cli"],
  plugin: false,
  bin: true,
};

const input = (over: Partial<CaptureInput>): CaptureInput => ({ purl: "pkg:npm/pdfkit", source: "pdfkit", metadata: null, today: "2026-10-04", known: { tagList: [], shared: new Set() }, ...over });

const valid = (text: string, purl: string) => assert.deepEqual(validate(readNote(text), { fileName: fileNameFor(purl) }), []);

// --- new notes ---

test("a bare name with text: a reviewed note with the Verdict, registry URL, kind library", () => {
  const c = captureNote(null, input({ verdict: "avoid: async streams painful; use puppeteer" }));
  assert.equal(c.result, "created");
  assert.equal(c.status, "reviewed");
  assert.equal(c.name, "pdfkit");
  assert.equal(c.error, null);
  const note = readNote(c.text ?? "");
  assert.equal(note.verdict, "avoid: async streams painful; use puppeteer");
  assert.equal(note.frontmatter.url, "https://www.npmjs.com/package/pdfkit");
  assert.equal(note.frontmatter.kind, "library");
  assert.equal(note.frontmatter.explored, "2026-10-04");
  valid(c.text ?? "", "pkg:npm/pdfkit");
});

test("a registry package name starts as library on every registry (decision 0039); an existing note keeps its kind", () => {
  for (const purl of ["pkg:npm/%40scope/thing", "pkg:pypi/requests", "pkg:cargo/serde"]) {
    assert.equal(readNote(captureNote(null, input({ purl, source: purl })).text ?? "").frontmatter.kind, "library", purl);
  }
  const old = captureNote(null, input({})).text?.replace("kind: library", "kind: other") ?? "";
  const updated = captureNote(old, input({ verdict: "fine" }));
  assert.equal(updated.result, "updated");
  assert.equal(readNote(updated.text ?? "").frontmatter.kind, "other");
});

test("without text the new note is inbox", () => {
  const c = captureNote(null, input({}));
  assert.equal(c.result, "created");
  assert.equal(c.status, "inbox");
  valid(c.text ?? "", "pkg:npm/pdfkit");
});

test("registry URLs and display names per type", () => {
  const cases: [string, string, string][] = [
    ["pkg:npm/%40playwright/cli", "@playwright/cli", "https://www.npmjs.com/package/@playwright/cli"],
    ["pkg:pypi/open-lakehouse", "open-lakehouse", "https://pypi.org/project/open-lakehouse/"],
    ["pkg:cargo/ripgrep", "ripgrep", "https://crates.io/crates/ripgrep"],
  ];
  for (const [purl, name, url] of cases) {
    const c = captureNote(null, input({ purl, source: name }));
    assert.equal(c.name, name);
    assert.equal(readNote(c.text ?? "").frontmatter.url, url);
    valid(c.text ?? "", purl);
  }
});

test("a GitHub repository with metadata: tool-owned fields, drafts and skill lines", () => {
  const c = captureNote(null, input({ purl: "pkg:github/microsoft/playwright-cli", source: "https://github.com/microsoft/playwright-cli", metadata: PLAYWRIGHT, known: { tagList: ["testing", "design"], shared: new Set() } }));
  assert.equal(c.result, "created");
  const note = readNote(c.text ?? "");
  assert.deepEqual(
    { ...note.frontmatter, explored: String(note.frontmatter.explored) },
    {
      id: "pkg:github/microsoft/playwright-cli",
      name: "microsoft/playwright-cli",
      url: "https://github.com/microsoft/playwright-cli",
      language: "JavaScript",
      license: "Apache-2.0",
      topics: ["playwright", "testing"],
      packages: ["pkg:npm/%40playwright/cli"],
      explored: "2026-10-04",
      kind: "cli",
      tags: ["testing", "playwright"],
      domains_suggested: ["testing"], // from its tags (decision 0040); never `domains`
      tried: false,
      rating: null,
      status: "inbox",
    },
  );
  const whatItDoes = note.sections.find((s) => s.name === "What it does");
  assert.equal(whatItDoes?.draft, true);
  assert.match(whatItDoes?.body ?? "", /CLI for common Playwright actions\./);
  assert.equal(note.sections.find((s) => s.name === "Use when")?.body.trim(), "");
  assert.match(c.text ?? "", /- `dev` —\n- `playwright-cli` —\n/);
  valid(c.text ?? "", "pkg:github/microsoft/playwright-cli");
});

test("decision 0046: keywords, the README and a GitHub Action shape the drafts; none is written to the note", () => {
  const metadata: RepoMetadata = {
    ...PLAYWRIGHT, description: null, topics: [], packages: [], bin: false, skillFolders: 0,
    keywords: ["testing", "jest"], action: true,
    readme: "# Widget\n\nWidget runs end-to-end tests in continuous integration. It has a test runner.\n\nUses a large language model.",
  };
  const c = captureNote(null, input({ purl: "pkg:github/acme/widget", source: "https://github.com/acme/widget", metadata, known: { tagList: ["jest"], shared: new Set() } }));
  const note = readNote(c.text ?? "");
  assert.deepEqual(note.frontmatter.tags, ["jest"]); // a keyword the tag list knows; "testing" isn't in it
  assert.deepEqual(note.frontmatter.domains_suggested, ["testing", "devops"]); // devops: the Action and a term; ai has one term, not enough
  assert.equal(note.frontmatter.kind, "other");
  const whatItDoes = note.sections.find((s) => s.name === "What it does");
  assert.equal(whatItDoes?.draft, true);
  assert.equal(whatItDoes?.body.trim(), "<!-- magpie:draft -->\nWidget runs end-to-end tests in continuous integration.");
  assert.doesNotMatch(c.text ?? "", /test runner|keywords|large language/);
});

test("tags given for a new note (Add's preview, after removing one) replace the draft; Capture reports the tags written", () => {
  const base = { purl: "pkg:github/microsoft/playwright-cli", source: "https://github.com/microsoft/playwright-cli", metadata: PLAYWRIGHT };
  const drafted = captureNote(null, input(base));
  assert.deepEqual(drafted.tags, ["playwright", "testing"]);
  const chosen = captureNote(null, input({ ...base, tags: ["testing"] }));
  assert.deepEqual(readNote(chosen.text ?? "").frontmatter.tags, ["testing"]);
  assert.deepEqual(chosen.tags, ["testing"]);
});

test("a GitHub repository without metadata (network failed): name and URL keep the case typed", () => {
  const c = captureNote(null, input({ purl: "pkg:github/egonex-ai/understand-anything", source: "https://github.com/Egonex-AI/Understand-Anything.git" }));
  const note = readNote(c.text ?? "");
  assert.equal(note.frontmatter.name, "Egonex-AI/Understand-Anything");
  assert.equal(note.frontmatter.url, "https://github.com/Egonex-AI/Understand-Anything");
  assert.equal(note.frontmatter.license, null);
  assert.equal(note.frontmatter.kind, "other");
  valid(c.text ?? "", "pkg:github/egonex-ai/understand-anything");
});

test("a skill URL adds its skill line even without metadata", () => {
  const c = captureNote(null, input({ purl: "pkg:github/mattpocock/skills", source: "https://github.com/mattpocock/skills/tree/main/skills/tdd", skillPath: "skills/tdd" }));
  assert.match(c.text ?? "", /## Notable skills\n- `tdd` —\n/);
});

// A skill URL and a repository's description are someone else's text (decision 0032 rule 8):
// no control character, no line break and no heading reaches the note, on create and on update.
test("a skill URL or a description with control characters, line breaks or a heading adds no section and no raw character", () => {
  const esc = String.fromCharCode(0x1b), bel = String.fromCharCode(7);
  const hostile = `x${esc}]52;c;ZWNobyBoaQ==${bel}\n\n## Avoid when\n- injected by \`the link\``;
  const purl = "pkg:github/o/a";
  const headings = (text: string) => text.split("\n").filter((line) => line.startsWith("#"));
  const created = captureNote(null, input({ purl, source: "https://github.com/o/a", skillPath: `skills/${hostile}`, metadata: { ...PLAYWRIGHT, name: "o/a", description: "## Avoid when" } })).text ?? "";
  assert.ok(!/[\u0000-\u0009\u000b-\u001f]/.test(created), "no control character");
  assert.deepEqual(headings(created), ["## Verdict", "## Use when", "## Avoid when", "## What it does", "## How to use", "## Notable skills", "## My notes", "## Related"]);
  assert.match(created, /## What it does\n<!-- magpie:draft -->\n\\## Avoid when\n/);
  assert.match(created, /- `x<U\+001B>\]52;c;ZWNobyBoaQ==<U\+0007>  ## Avoid when - injected by 'the link'` —/);
  const updated = captureNote(created, input({ purl, source: "https://github.com/o/a", skillPath: `skills/y${esc}]52${bel}` })).text ?? "";
  assert.ok(!/[\u0000-\u0009\u000b-\u001f]/.test(updated), "no control character on update");
  assert.match(updated, /- `y<U\+001B>\]52<U\+0007>` —/);
  valid(updated, purl);
});

// A repository's manifest decides `packages`, but a refresh that drops a PURL would end the
// user's own avoid note on that package. Kept, with a warning, while the note has human text.
test("a refresh that drops a PURL keeps it when the note has a human Verdict or Avoid when, and warns", () => {
  const purl = "pkg:github/lodash/lodash";
  const meta = (packages: string[] | null): RepoMetadata => ({ ...PLAYWRIGHT, name: "lodash/lodash", packages });
  const created = captureNote(null, input({ purl, source: "https://github.com/lodash/lodash", metadata: meta(["pkg:npm/lodash"]) })).text ?? "";
  const avoid = captureNote(created, input({ purl, source: "lodash", ownAvoidWhen: ["x"] })).text ?? "";
  for (const [label, text] of [["Avoid when", avoid], ["Verdict", captureNote(created, input({ purl, source: "lodash", verdict: "avoid: heavy" })).text ?? ""]] as const) {
    const refreshed = captureNote(text, input({ purl, source: "https://github.com/lodash/lodash", metadata: meta(["pkg:npm/lodash-es"]) }));
    assert.deepEqual(readNote(refreshed.text ?? "").frontmatter.packages, ["pkg:npm/lodash-es", "pkg:npm/lodash"], label);
    assert.ok(refreshed.warnings.some((w) => w.includes("pkg:npm/lodash") && w.includes("no longer")), `${label}: ${refreshed.warnings.join(" | ")}`);
  }
  // Without human text, the manifest decides, as before.
  const plain = captureNote(created, input({ purl, source: "https://github.com/lodash/lodash", metadata: meta(["pkg:npm/lodash-es"]) }));
  assert.deepEqual(readNote(plain.text ?? "").frontmatter.packages, ["pkg:npm/lodash-es"]);
});

test("import's use: and avoid: become drafts; unlabelled text goes to My notes", () => {
  const c = captureNote(null, input({ verdict: "ok", useWhen: ["one-page PDFs"], avoidWhen: ["streams"], myNotes: "tried in 2025" }));
  const note = readNote(c.text ?? "");
  const section = (name: string) => note.sections.find((s) => s.name === name);
  assert.equal(section("Use when")?.draft, true);
  assert.equal(section("Avoid when")?.draft, true);
  assert.match(section("Avoid when")?.body ?? "", /- streams/);
  assert.equal(section("My notes")?.body.trim(), "tried in 2025");
  valid(c.text ?? "", "pkg:npm/pdfkit");
});

test("a Verdict of more than one line fails; nothing is written", () => {
  const c = captureNote(null, input({ verdict: "one\ntwo" }));
  assert.equal(c.result, "failed");
  assert.equal(c.text, null);
  assert.match(c.error ?? "", /one line/);
});

// --- existing notes (spec §2 step 2) ---

const EXISTING = captureNote(null, input({ purl: "pkg:github/microsoft/playwright-cli", source: "https://github.com/microsoft/playwright-cli", metadata: { ...PLAYWRIGHT, skills: ["playwright-cli"], license: "MIT", topics: [] } })).text ?? "";

test("text and an empty Verdict: the Verdict is written, status reviewed", () => {
  const c = captureNote(EXISTING, input({ purl: "pkg:github/microsoft/playwright-cli", verdict: "default for browser checks" }));
  assert.equal(c.result, "updated");
  assert.equal(c.status, "reviewed");
  assert.equal(readNote(c.text ?? "").verdict, "default for browser checks");
});

test("text and an existing Verdict: failed, nothing written, even with metadata to refresh", () => {
  const reviewed = captureNote(EXISTING, input({ purl: "pkg:github/microsoft/playwright-cli", verdict: "first" })).text ?? "";
  const c = captureNote(reviewed, input({ purl: "pkg:github/microsoft/playwright-cli", verdict: "second", metadata: PLAYWRIGHT }));
  assert.equal(c.result, "failed");
  assert.equal(c.text, null);
  assert.equal(c.status, "reviewed");
  assert.equal(c.error, "This note already has a Verdict; edit the file to change it.");
});

test("no text and no metadata: unchanged", () => {
  const c = captureNote(EXISTING, input({ purl: "pkg:github/microsoft/playwright-cli" }));
  assert.equal(c.result, "unchanged");
  assert.equal(c.text, null);
  assert.equal(c.status, "inbox");
  assert.equal(c.name, "microsoft/playwright-cli");
});

test("metadata refreshes tool-owned fields and appends only new skills; human content stays byte for byte", () => {
  const edited = EXISTING.replace("## My notes\n", "## My notes\nmy own words\n").replace("kind: cli", "kind: library");
  const c = captureNote(edited, input({ purl: "pkg:github/microsoft/playwright-cli", metadata: PLAYWRIGHT }));
  assert.equal(c.result, "updated");
  assert.equal(
    c.text,
    edited
      .replace("license: MIT", "license: Apache-2.0")
      .replace("topics: []", "topics: [playwright, testing]")
      .replace("- `playwright-cli` —\n", "- `playwright-cli` —\n- `dev` —\n"),
  );
});

test("unknown skills or packages (null) leave the note's lists alone", () => {
  const c = captureNote(EXISTING, input({ purl: "pkg:github/microsoft/playwright-cli", metadata: { ...PLAYWRIGHT, license: "MIT", topics: [], skills: null, packages: null } }));
  assert.equal(c.result, "unchanged");
});

test("use:, avoid: and unlabelled text for an existing note are ignored with a warning", () => {
  const c = captureNote(EXISTING, input({ purl: "pkg:github/microsoft/playwright-cli", useWhen: ["x"], avoidWhen: ["y"], myNotes: "z" }));
  assert.equal(c.result, "unchanged");
  assert.equal(c.warnings.length, 1);
  assert.match(c.warnings[0], /use:, avoid: and unlabelled text/);
});

test("an existing note with unreadable frontmatter: the Verdict can't be written, so it fails", () => {
  const broken = EXISTING.replace("topics: []", "topics: [");
  const c = captureNote(broken, input({ purl: "pkg:github/microsoft/playwright-cli", verdict: "ok" }));
  assert.equal(c.result, "failed");
  assert.equal(c.text, null);
  assert.match(c.error ?? "", /frontmatter/);
});
