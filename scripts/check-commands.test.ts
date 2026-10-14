import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkedText, magpieCommands, filesToCheck } from "./check-commands.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const lines = (text: string) => magpieCommands(text).map((hit) => hit.line);

test("a code span that runs magpie is found", () => {
  assert.deepEqual(lines("Run `magpie note pdfkit` first."), [1]);
  assert.deepEqual(lines("intro\nThe `magpie` command reads the journals."), [2]);
  assert.deepEqual(lines("Try `$ magpie recall x`."), [1]);
});

test("a command line in a code block is found, and the hook entry anywhere", () => {
  assert.deepEqual(lines("```\nmagpie recall <package>... --json\n$ magpie search pdf | cat\n  magpie ui\n```"), [2, 3, 4]);
  assert.deepEqual(lines('"hooks": [ { "type": "command", "command": "magpie hook claude-code" } ]'), [1]);
});

test("the journal folders, the draft marker, repomagpie and prose about the bird are not commands", () => {
  const text = [
    "Notes live in `~/.magpie/` and `.magpie/notes/`.",
    "Make `<!-- magpie:draft -->` the first line.",
    "Run `repomagpie note pdfkit`, or `npx repomagpie --version`.",
    "A magpie is black and white.",
    "```",
    "<journal>/.magpie/notes",
    "repomagpie recall pdfkit",
    "```",
    "Set `MAGPIE_HOME`, or read `magpie-token`.",
  ].join("\n");
  assert.deepEqual(lines(text), []);
});

test("a code span is not read across a code block", () => {
  assert.deepEqual(lines("```\necho `\n```\nmagpie is a bird `x`"), []);
});

test("a line with the allow marker is allowed", () => {
  assert.deepEqual(lines("`magpie` works as a short alias when no other `magpie` is on `PATH`. <!-- check:commands allow -->"), []);
});

test("the changelog's released sections and the decision records are left out", () => {
  const changelog = "# Changelog\n\n## [Unreleased]\n- `magpie x`\n\n## [0.1.0] - 2026-10-07\n- `magpie note`\n";
  assert.deepEqual(lines(checkedText("CHANGELOG.md", changelog)), [4]);
  const files = filesToCheck(root).map((file) => file.slice(root.length).replace(/\\/g, "/"));
  assert.ok(files.includes("README.md"));
  assert.ok(files.includes("skills/repomagpie/SKILL.md"));
  assert.ok(!files.some((file) => file.startsWith("docs/decisions/")));
});
