import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { filesToScan, invisibleCharacters } from "./check-characters.ts";

// The check for invisible characters in the repository's files (feat/hardening, piece 7): bidi
// controls, zero-width characters, line and paragraph separators and the byte-order mark, which can
// make code read differently from what it does. Built from code points, so this file holds none.

const c = (code: number) => String.fromCharCode(code);
const root = fileURLToPath(new URL("..", import.meta.url));

test("each invisible character is found, with its line, column and code point", () => {
  for (const code of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f, 0x061c, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x2028, 0x2029]) {
    const hits = invisibleCharacters(`const a = 1;\nconst b = "x${c(code)}y";\n`);
    assert.deepEqual(hits, [{ line: 2, column: 13, code: `U+${code.toString(16).toUpperCase().padStart(4, "0")}` }], code.toString(16));
  }
});

test("visible text outside ASCII is fine: accents, CJK, emoji, typographic quotes, the ellipsis", () => {
  assert.deepEqual(invisibleCharacters(`caf${c(0xe9)} ${c(0x4f7f)} ${String.fromCodePoint(0x1f600)} ${c(0x201c)}q${c(0x201d)} ${c(0x2026)} ${c(0x0440)}`), []);
});

test("the scan covers the tracked and new text files, not images or ignored folders", () => {
  const files = filesToScan(root).map((file) => file.slice(root.length).replace(/\\/g, "/"));
  for (const file of ["src/core/text.ts", "ui/src/App.tsx", "docs/spec.md", ".github/workflows/ci.yml", "package.json"]) assert.ok(files.includes(file), file);
  assert.ok(!files.some((file) => /\.(png|svg|ico)$/.test(file)), "no images");
  assert.ok(!files.some((file) => /^(\.worklog|\.scratch|node_modules|dist)\//.test(file)));
});
