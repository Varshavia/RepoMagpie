import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { scratchBase } from "../src/core/fixtures/scratch.ts";
import { bundleSizes, entryFiles, FIRST_LOAD_LINE_KB } from "./bundle-sizes.ts";
import { checkBundle, type Limits } from "./check-bundle.ts";

// npm run check:bundle's two lines (docs/ui.md §10) on tiny fixture builds: the files are random
// bytes, so gzip can't shrink them and each weighs about its size. The limits are scaled down with
// them; the real ones are tested by the build in CI.

const LIMITS: Limits = { budget: 12, line: 5 };
const page = (tags: string) => `<!doctype html>\n<html><head>\n${tags}\n</head><body><div id="root"></div></body></html>\n`;
const ENTRY = '<script type="module" crossorigin src="/assets/index-AAAAAAAA.js"></script>\n<link rel="stylesheet" crossorigin href="/assets/index-BBBBBBBB.css">';

// A dist/ui folder: index.html and files of the given sizes in kB.
function build(html: string, files: Record<string, number>): string {
  const folder = join(scratchBase("bundle"), "ui");
  mkdirSync(folder);
  writeFileSync(join(folder, "index.html"), html);
  for (const [name, kb] of Object.entries(files)) writeFileSync(join(folder, name), randomBytes(kb * 1024));
  return folder;
}

test("under both lines: passes without a notice", () => {
  const { lines, errors } = checkBundle(build(page(ENTRY), { "index-AAAAAAAA.js": 2, "index-BBBBBBBB.css": 1, "GraphPage-CCCCCCCC.js": 3 }), LIMITS);
  assert.deepEqual(errors, []);
  assert.ok(lines.some((line) => /kB {2}GraphPage-CCCCCCCC\.js \(lazy\)$/.test(line)));
  assert.ok(lines.some((line) => /kB {2}first files: index-AAAAAAAA\.js, index-BBBBBBBB\.css, index\.html \(decision 0048's line 5\.0 kB\)$/.test(line)));
});

test("over the total: fails, the first files under their line", () => {
  const { errors } = checkBundle(build(page(ENTRY), { "index-AAAAAAAA.js": 2, "index-BBBBBBBB.css": 1, "GraphPage-CCCCCCCC.js": 10 }), LIMITS);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^The app is over its budget by \d+\.\d kB\.$/);
});

test("over decision 0048's line: fails, with no allowance", () => {
  const { errors } = checkBundle(build(page(ENTRY), { "index-AAAAAAAA.js": 5, "index-BBBBBBBB.css": 1 }), LIMITS);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^The first files are 6\.\d kB: 1\.\d kB over decision 0048's line \(5\.0 kB\)\.$/);
});

test("a module preload is a first file; a style index.html doesn't name is lazy, and a page without a stylesheet works", () => {
  const preload = build(page(`${ENTRY}\n<link rel="modulepreload" crossorigin href="/assets/vendor-DDDDDDDD.js">`), { "index-AAAAAAAA.js": 1, "index-BBBBBBBB.css": 1, "vendor-DDDDDDDD.js": 1 });
  assert.deepEqual(bundleSizes(preload).firstLoad.map((file) => file.name), ["index-AAAAAAAA.js", "index-BBBBBBBB.css", "index.html", "vendor-DDDDDDDD.js"]);

  const noStyles = build(page('<script type="module" src="/assets/index-AAAAAAAA.js"></script>\n<link rel="icon" href="/assets/logo.svg">'), { "index-AAAAAAAA.js": 1, "GraphPage-CCCCCCCC.css": 1 });
  const sizes = bundleSizes(noStyles);
  assert.deepEqual(sizes.firstLoad.map((file) => file.name), ["index-AAAAAAAA.js", "index.html"]);
  assert.deepEqual(sizes.lazy.map((file) => file.name), ["GraphPage-CCCCCCCC.css"]);
  assert.deepEqual(checkBundle(noStyles, LIMITS).errors, []);
});

test("the entry files come from the tags, by file name: not icons, not other links", () => {
  assert.deepEqual(entryFiles(page(`${ENTRY}\n<link rel="icon" type="image/svg+xml" href="/assets/logo-EEEEEEEE.svg">\n<link rel='modulepreload' href='/assets/a-FFFFFFFF.js?v=1'>\n<link href="/assets/b.css" rel="stylesheet">`)),
    ["index-AAAAAAAA.js", "index-BBBBBBBB.css", "a-FFFFFFFF.js", "b.css"]);
});

test("a file index.html names that the build doesn't have is an error, not a smaller number", () => {
  assert.throws(() => bundleSizes(build(page(ENTRY), { "index-AAAAAAAA.js": 1 })), /index\.html loads index-BBBBBBBB\.css, which isn't in/);
});

test("there is no allowance: the first files' line is decision 0048's 104.0 kB, in bundle-sizes.ts", () => {
  const source = readFileSync(new URL("check-bundle.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /ALLOWANCE/);
  assert.equal(FIRST_LOAD_LINE_KB, 104.0);
});
