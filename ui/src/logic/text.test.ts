import { test } from "node:test";
import assert from "node:assert/strict";
import { editableBody, firstEntries, homePath, isBlank, obsidianUri, parseBody, parseInline } from "./text.ts";

// How the app shows a section's Markdown body: bullets, lines, code spans and links. No HTML is
// ever built from note text; these are plain data for React to render.

test("bullets become a list, other lines stay lines; comments and the draft marker are dropped", () => {
  const body = "<!-- magpie:draft -->\n- quick one-page PDFs\n* from a script\n\nAsked twice.\nStill true. <!-- why -->\n";
  assert.deepEqual(parseBody(body), [
    { kind: "list", items: [[{ kind: "text", text: "quick one-page PDFs" }], [{ kind: "text", text: "from a script" }]] },
    { kind: "lines", lines: [[{ kind: "text", text: "Asked twice." }], [{ kind: "text", text: "Still true." }]] },
  ]);
});

test("a comment over several lines is dropped whole", () => {
  assert.deepEqual(parseBody("<!-- one line:\n what it does -->\nA PDF library.\n"), [{ kind: "lines", lines: [[{ kind: "text", text: "A PDF library." }]] }]);
});

test("code spans, Markdown links and bare links; only http and https become links", () => {
  assert.deepEqual(parseInline("use `pdf-lib` or [puppeteer](https://pptr.dev) see https://x.dev/a."), [
    { kind: "text", text: "use " },
    { kind: "code", text: "pdf-lib" },
    { kind: "text", text: " or " },
    { kind: "link", text: "puppeteer", href: "https://pptr.dev" },
    { kind: "text", text: " see " },
    { kind: "link", text: "https://x.dev/a", href: "https://x.dev/a" },
    { kind: "text", text: "." },
  ]);
  assert.deepEqual(parseInline("[x](javascript:alert(1))"), [{ kind: "text", text: "[x](javascript:alert(1))" }]);
});

test("firstEntries: the first n bullets or lines across blocks, and how many are left out", () => {
  const blocks = parseBody("A line.\n\n- one\n- two\n- three\n\nLast.\n");
  assert.deepEqual(firstEntries(blocks, 3), {
    blocks: [
      { kind: "lines", lines: [[{ kind: "text", text: "A line." }]] },
      { kind: "list", items: [[{ kind: "text", text: "one" }], [{ kind: "text", text: "two" }]] },
    ],
    more: 2,
  });
  assert.deepEqual(firstEntries(blocks, 10), { blocks, more: 0 });
});

test("isBlank: only comments and whitespace", () => {
  assert.equal(isBlank("<!-- e.g. a CLI tool -->\n\n"), true);
  assert.equal(isBlank("<!-- magpie:draft -->\n"), true);
  assert.equal(isBlank("- x\n"), false);
});

test("editableBody: the body without the draft marker and the blank lines around it; other comments stay", () => {
  assert.equal(editableBody("<!-- magpie:draft -->\n- quick PDFs\n<!-- keep -->\n\n"), "- quick PDFs\n<!-- keep -->");
  assert.equal(editableBody("\nA PDF library.\n"), "A PDF library.");
});

test("obsidianUri: open?path= with the URI-encoded absolute path", () => {
  assert.equal(obsidianUri("/home/ana/.magpie/notes/npm--pdfkit.md"), "obsidian://open?path=%2Fhome%2Fana%2F.magpie%2Fnotes%2Fnpm--pdfkit.md");
  assert.equal(obsidianUri("C:\\Users\\Ana Lee\\.magpie\\notes\\a.md"), "obsidian://open?path=C%3A%5CUsers%5CAna%20Lee%5C.magpie%5Cnotes%5Ca.md");
});

// Paths for people, as magpie recall and the hook print them: under the home directory with ~.
test("homePath: a path under the home directory starts with ~; others, and the home itself, stay as they are", () => {
  assert.equal(homePath("/home/ana/.magpie/notes/npm--pdfkit.md", "/home/ana"), "~/.magpie/notes/npm--pdfkit.md");
  assert.equal(homePath("C:\\Users\\Ana Lee\\code\\app\\.magpie", "C:\\Users\\Ana Lee"), "~\\code\\app\\.magpie");
  assert.equal(homePath("/home/anabel/notes/a.md", "/home/ana"), "/home/anabel/notes/a.md");
  assert.equal(homePath("/srv/journal/notes/a.md", "/home/ana"), "/srv/journal/notes/a.md");
  assert.equal(homePath("/home/ana", "/home/ana"), "/home/ana");
  assert.equal(homePath("/home/ana/a.md", null), "/home/ana/a.md");
});
