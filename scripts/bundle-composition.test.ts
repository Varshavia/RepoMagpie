import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scratchBase } from "../src/core/fixtures/scratch.ts";
import { compose, composition, decodeVlq, sourceName } from "./bundle-composition.ts";

// The composition of the app's scripts (npm run build:analyze), on hand-made sourcemaps.

const root = fileURLToPath(new URL("..", import.meta.url));
const mapFolder = join(root, ".scratch", "analyze"); // ../../ from it is the repository's root

test("decodeVlq: base64 VLQ numbers, with the sign in the lowest bit and 5 bits a digit", () => {
  assert.deepEqual(decodeVlq("AAAA"), [0, 0, 0, 0]);
  assert.deepEqual(decodeVlq("AACA"), [0, 0, 1, 0]);
  assert.deepEqual(decodeVlq("D"), [-1]);
  assert.deepEqual(decodeVlq("gB"), [16]);
  assert.deepEqual(decodeVlq("hB"), [-16]);
  assert.deepEqual(decodeVlq("2H3H"), [123, -123]);
  assert.throws(() => decodeVlq("g"), /doesn't end/);
  assert.throws(() => decodeVlq("A*"), /not base64 VLQ/);
});

test("compose: each segment owns the bytes up to the next one; a segment without a source, and line breaks, are unmapped", () => {
  // Line 1: bytes 0-3 from the package, 4 on ("éfghij", é is 2 bytes) from a.ts.
  // Line 2: "xy" from a segment without a source, then "z" from the package again.
  const code = "abcdéfghij\nxyz";
  const map = { sources: ["../../node_modules/@scope/pkg/dist/index.js", "../../ui/src/a.ts"], mappings: "AAAA,ICAA;A,EDAA" };
  assert.deepEqual(compose(code, map, mapFolder), [
    { source: "ui/src/a.ts", bytes: 7 },
    { source: "@scope/pkg", bytes: 5 },
    { source: "(unmapped)", bytes: 3 },
  ]);
});

test("sourceName: a package by its name, a scoped one with its scope, the last node_modules for a nested one; other paths from the repository's root", () => {
  assert.equal(sourceName("../../node_modules/react-dom/cjs/react-dom-client.production.js", mapFolder), "react-dom");
  assert.equal(sourceName("../../node_modules/@tanstack/query-core/build/modern/index.js", mapFolder), "@tanstack/query-core");
  assert.equal(sourceName("../../node_modules/a/node_modules/b/index.js", mapFolder), "b");
  assert.equal(sourceName("..\\..\\node_modules\\scheduler\\index.js", mapFolder), "scheduler");
  assert.equal(sourceName("../../ui/src/App.tsx", mapFolder), "ui/src/App.tsx");
  assert.equal(sourceName("../ui/src/layout.worker.ts", mapFolder), "ui/src/layout.worker.ts"); // a worker's map: from ui/
  assert.equal(sourceName("\0vite/preload-helper.js", mapFolder), "vite/preload-helper.js");
});

test("composition: the first script first, by index.html; a script without its map, or no build, says to run build:analyze", () => {
  const folder = join(scratchBase("composition"), "analyze");
  mkdirSync(folder);
  writeFileSync(join(folder, "index.html"), '<script type="module" src="/assets/index-AAAAAAAA.js"></script>');
  const map = (source: string) => JSON.stringify({ version: 3, sources: [source], mappings: "AAAA" });
  writeFileSync(join(folder, "index-AAAAAAAA.js"), "ab");
  writeFileSync(join(folder, "index-AAAAAAAA.js.map"), map("../node_modules/react/index.js"));
  writeFileSync(join(folder, "Big-BBBBBBBB.js"), "abcdef");
  writeFileSync(join(folder, "Big-BBBBBBBB.js.map"), map("../node_modules/sigma/index.js"));
  assert.deepEqual(composition(folder).map(({ chunk, entry, bytes }) => ({ chunk, entry, bytes })), [
    { chunk: "index-AAAAAAAA.js", entry: true, bytes: 2 },
    { chunk: "Big-BBBBBBBB.js", entry: false, bytes: 6 },
  ]);
  writeFileSync(join(folder, "Lazy-CCCCCCCC.js"), "x");
  assert.throws(() => composition(folder), /Lazy-CCCCCCCC\.js has no sourcemap: run npm run build:analyze/);
  assert.throws(() => composition(join(folder, "missing")), /No analyze build in .*Run npm run build:analyze first\./);
});
