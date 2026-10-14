import { test } from "node:test";
import assert from "node:assert/strict";
import { renderNote, type NewNote } from "../core/write.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// Note text is data (decision 0032): agent-facing --json shows hidden characters as markers, is
// capped and names what it cut; human output shows the markers and is never cut. Hostile notes are
// inert: example.invalid, echo pwned.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...n });
const c = (...codes: number[]) => String.fromCodePoint(...codes);
const ESC = c(0x1b);
const HOSTILE = new RegExp(`[${c(0x00)}-${c(0x1f)}${c(0x7f)}-${c(0x9f)}${c(0x200b)}-${c(0x200f)}${c(0x202a)}-${c(0x202e)}${c(0x2066)}-${c(0x2069)}${c(0xfeff)}]`);
const strings = (value: unknown): string[] =>
  typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

const LONG = `avoid: ${ESC}[31m${"v".repeat(3000)}${ESC}]52;c;ZWNobyBwd25lZA==${c(0x07)} end${c(0x202e)}`;
const SHOWN_TAIL = `${"v".repeat(3000)}<U+001B>]52;c;ZWNobyBwd25lZA==<U+0007> end<U+202E>`;
const withAlternatives = (text: string, entries: string[]) =>
  text.replace("\nstatus:", `\nalternatives: [${entries.map((e) => JSON.stringify(e)).join(", ")}]\nstatus:`);
const PDFKIT = withAlternatives(
  note({ id: "pkg:npm/pdfkit", verdict: LONG, tags: ["pdf"], avoidWhen: Array.from({ length: 25 }, (_, i) => (i ? `case ${i}` : "w".repeat(800))) }),
  Array.from({ length: 25 }, (_, i) => `[[alt-${i}]]`),
);
const files = { "journal/notes/npm--pdfkit.md": PDFKIT, "project/package.json": JSON.stringify({ dependencies: { pdfkit: "*" } }) };

test("recall --json: hidden characters as markers, note text capped, and each cut field named in truncated", async () => {
  const box = sandbox(files);
  const { matches } = JSON.parse((await magpie(box, ["recall", "pdfkit", "--json"])).out);
  const [m] = matches;
  assert.equal(m.verdict.length, 1000);
  assert.ok(m.verdict.startsWith("avoid: <U+001B>[31mvvv") && m.verdict.endsWith("…"));
  assert.equal(m.avoid_when.length, 20);
  assert.equal(m.avoid_when[0].length, 500);
  assert.equal(m.alternatives.length, 20);
  assert.deepEqual(m.truncated, ["verdict", "avoid_when", "alternatives"]);
  for (const text of strings(matches)) assert.doesNotMatch(text, HOSTILE, text.slice(0, 80));
});

test("recall for people: the Verdict shows its markers and is never cut", async () => {
  const box = sandbox(files);
  const { out } = await magpie(box, ["recall", "pdfkit"], { env: { MAGPIE_HOME: box.journal, NO_COLOR: "1" } });
  assert.ok(out.includes(`avoid: <U+001B>[31m${SHOWN_TAIL}`), "the whole Verdict, with markers");
  assert.doesNotMatch(out.replace(/\n/g, ""), HOSTILE);
  assert.ok(!out.includes("truncated"));
});

test("search --json caps and names what it cut; search for people shows the whole Verdict, with markers", async () => {
  const box = sandbox(files);
  const { results } = JSON.parse((await magpie(box, ["search", "pdfkit", "--json"])).out);
  assert.equal(results[0].verdict.length, 1000);
  assert.deepEqual(results[0].truncated, ["verdict"]);
  const human = await magpie(box, ["search", "pdfkit"], { env: { MAGPIE_HOME: box.journal, NO_COLOR: "1" } });
  assert.ok(human.out.includes(SHOWN_TAIL));
  assert.doesNotMatch(human.out.replace(/\n/g, ""), HOSTILE);
});

test("suggest --json caps candidates and in_use_avoid the same way", async () => {
  const box = sandbox({ ...files, "journal/notes/npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib", verdict: `pdf ${"p".repeat(1500)}`, tags: ["pdf"] }) });
  const document = JSON.parse((await magpie(box, ["suggest", "pdf files", "--json"])).out);
  const candidate = document.candidates.find((x: { id: string }) => x.id === "pkg:npm/pdf-lib");
  assert.equal(candidate.verdict.length, 1000);
  assert.deepEqual(candidate.truncated, ["verdict"]);
  const [avoid] = document.in_use_avoid;
  assert.equal(avoid.id, "pkg:npm/pdfkit");
  assert.deepEqual(avoid.truncated, ["verdict", "avoid_when", "alternatives"]);
  for (const text of strings(document)) assert.doesNotMatch(text, HOSTILE, text.slice(0, 80));
});

// A cloned repository's manifests are written by strangers too: a dependency's name reaches
// why.dependencies and the why line with markers. The keywords themselves are only letters and
// digits; a marker there is a word break.
test("suggest: a hostile dependency name in the project's package.json shows its markers in why.dependencies and the why line", async () => {
  const dependency = `pdf-${c(0x202e)}render${c(0x07)}${ESC}`;
  const box = sandbox({
    "journal/notes/npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib", verdict: "pdf render", tags: ["pdf"] }),
    "project/package.json": JSON.stringify({ dependencies: { [dependency]: "*" } }),
  });
  const document = JSON.parse((await magpie(box, ["suggest", "--json"])).out);
  assert.deepEqual(document.keywords, ["pdf", "render"]);
  const shown = "pdf-<U+202E>render<U+0007><U+001B>";
  assert.deepEqual(document.candidates[0].why.dependencies, [shown]);
  for (const text of strings(document)) assert.doesNotMatch(text, HOSTILE, text.slice(0, 80));
  const human = await magpie(box, ["suggest"], { env: { MAGPIE_HOME: box.journal, NO_COLOR: "1" } });
  assert.ok(human.out.includes(`Why: dependency ${shown}`), human.out);
  assert.doesNotMatch(human.out.replace(/\n/g, ""), HOSTILE);
});

test("an honest note's --json has no truncated key", async () => {
  const box = sandbox({ "journal/notes/npm--chalk.md": note({ id: "pkg:npm/chalk", verdict: "colours" }) });
  const { matches } = JSON.parse((await magpie(box, ["recall", "chalk", "--json"])).out);
  assert.ok(!("truncated" in matches[0]));
});
