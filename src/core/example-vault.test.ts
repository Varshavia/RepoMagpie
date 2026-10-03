import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolveTarget } from "./identity.ts";
import { readNote, validate } from "./note.ts";

// The example vault (examples/vault/) must stay valid against the note schema.
const vault = new URL("../../examples/vault/", import.meta.url);
const files = readdirSync(new URL("notes/", vault)).filter((name) => name.endsWith(".md")).sort();
const notes = files.map((file) => ({ file, note: readNote(readFileSync(new URL(`notes/${file}`, vault), "utf8")) }));

const tagList = readFileSync(new URL("tags.md", vault), "utf8")
  .split(/\r?\n/)
  .map((line) => line.match(/^- `([a-z0-9-]+)`/)?.[1])
  .filter((tag): tag is string => Boolean(tag));

test("there is one note per seed repository in docs/seed-repos.md", () => {
  const seeds = readFileSync(new URL("../../docs/seed-repos.md", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^- \*\*URL:\*\* (\S+)/)?.[1])
    .filter((url): url is string => Boolean(url))
    .map((url) => {
      const r = resolveTarget(url);
      return r.kind === "ok" ? r.purl : `unresolved: ${url}`;
    })
    .sort();
  assert.equal(seeds.length, 8);
  assert.deepEqual(notes.map(({ note }) => note.frontmatter.id).sort(), seeds);
});

for (const { file, note } of notes) {
  test(`${file} validates against the note schema`, () => {
    assert.deepEqual(validate(note, { fileName: file }), []);
  });

  test(`${file} uses only tags from tags.md`, () => {
    const tags = note.frontmatter.tags as string[];
    assert.deepEqual(tags.filter((tag) => !tagList.includes(tag)), []);
  });
}
