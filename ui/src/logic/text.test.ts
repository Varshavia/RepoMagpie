import { test } from "node:test";
import assert from "node:assert/strict";
import { findLinks } from "../../../src/core/links.ts";
import { clean } from "../../../src/core/text.ts";
import { editableBody, externalHref, firstEntries, hasHidden, homePath, isBlank, parseBody, parseInline, visible } from "./text.ts";

// Decision 0032, rule 7: a URL from a note is a link only for http and https.
test("externalHref: http and https only; javascript:, data:, vbscript:, file: and the unparsable give none", () => {
  assert.equal(externalHref("https://github.com/microsoft/playwright-cli"), "https://github.com/microsoft/playwright-cli");
  assert.equal(externalHref("http://example.invalid/x"), "http://example.invalid/x");
  assert.equal(externalHref("  https://example.invalid/  "), "https://example.invalid/");
  for (const url of ["javascript:void(0)", "JavaScript:void(0)", " javascript:void(0)", "data:text/html,<b>x</b>", "vbscript:msgbox", "file:///etc/passwd", "//example.invalid/x", "example.invalid", ""]) {
    assert.equal(externalHref(url), null, url);
  }
});

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

test("wikilinks: target, label and the text as written; the #heading is dropped; an empty target is text", () => {
  assert.deepEqual(parseInline("use [[puppeteer]] or [[npm--pdfkit#Verdict| pdfkit ]], not [[#x]] or [[]]"), [
    { kind: "text", text: "use " },
    { kind: "wikilink", target: "puppeteer", label: null, text: "[[puppeteer]]" },
    { kind: "text", text: " or " },
    { kind: "wikilink", target: "npm--pdfkit", label: "pdfkit", text: "[[npm--pdfkit#Verdict| pdfkit ]]" },
    { kind: "text", text: ", not [[#x]] or [[]]" },
  ]);
});

test("code spans of any number of backticks; links inside them stay code", () => {
  assert.deepEqual(parseInline("``a ` [[b]]`` and `[[c]]`"), [
    { kind: "code", text: "a ` [[b]]" },
    { kind: "text", text: " and " },
    { kind: "code", text: "[[c]]" },
  ]);
});

test("lines in a fenced code block are plain text: no links, no code spans", () => {
  assert.deepEqual(parseBody("```\n[[a]] `b`\n```\n[[c]]"), [
    { kind: "lines", lines: [[{ kind: "text", text: "```" }], [{ kind: "text", text: "[[a]] `b`" }], [{ kind: "text", text: "```" }], [{ kind: "wikilink", target: "c", label: null, text: "[[c]]" }]] },
  ]);
});

// The app finds the links core counts (src/core/links.ts), so each one it shows has core's resolution.
test("the wikilinks the app shows are the ones core finds", () => {
  const samples = [
    "use [[puppeteer]], [[npm--pdfkit|pdfkit]], [[zod#Verdict]] or [[a#b|the label]]",
    "[[ pdfkit | the lib ]] [[]] [[ ]] [[|x]] [[#Verdict]] [[zod|]] [[a|b|c]]",
    "[[a[[b]] [x] [[c]",
    "`[[a]]` and ``x [[b]] ` y`` and ```[[c]]``` but `[[d]]",
    "[`x`[e]] [[f]]",
    "- [[one]]\n- [[two]]\n\n```js\n[[in-code]]\n~~~\n```\n[[after]]\n  ~~~\n[[tilde]]\n  ~~~\n```\n[[unclosed]]",
  ];
  for (const sample of samples) {
    const shown = parseBody(sample).flatMap((b) => (b.kind === "list" ? b.items : b.lines)).flat().flatMap((p) => (p.kind === "wikilink" ? [{ target: p.target, label: p.label }] : []));
    assert.deepEqual(shown, findLinks(sample), sample);
  }
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

// Paths for people, as magpie recall and the hook print them: under the home directory with ~.
test("homePath: a path under the home directory starts with ~; others, and the home itself, stay as they are", () => {
  assert.equal(homePath("/home/ana/.magpie/notes/npm--pdfkit.md", "/home/ana"), "~/.magpie/notes/npm--pdfkit.md");
  assert.equal(homePath("C:\\Users\\Ana Lee\\code\\app\\.magpie", "C:\\Users\\Ana Lee"), "~\\code\\app\\.magpie");
  assert.equal(homePath("/home/anabel/notes/a.md", "/home/ana"), "/home/anabel/notes/a.md");
  assert.equal(homePath("/srv/journal/notes/a.md", "/home/ana"), "/srv/journal/notes/a.md");
  assert.equal(homePath("/home/ana", "/home/ana"), "/home/ana");
  assert.equal(homePath("/home/ana/a.md", null), "/home/ana/a.md");
});

// Decision 0032, rule 1, in the app: read views show each hidden character as a visible marker.
const ch = (code: number) => String.fromCharCode(code);
const marker = (hex: string) => `<U+${hex}>`;

test("visible: control, bidi and zero-width characters become markers in place; text, tabs and line breaks stay", () => {
  assert.equal(visible(`see ${ch(0x202e)}txt.exe${ch(0x202c)}`), `see ${marker("202E")}txt.exe${marker("202C")}`);
  assert.equal(visible(`${ch(0x1b)}[2J and ${ch(0x07)}`), `${marker("001B")}[2J and ${marker("0007")}`);
  assert.equal(visible(`a${ch(0x200b)}b${ch(0xfeff)}`), `a${marker("200B")}b${marker("FEFF")}`);
  const plain = `a\tb\nc\r\nd caf${ch(0xe9)} ${ch(0x0440)}ad`;
  assert.equal(visible(plain), plain);
});

test("visible marks exactly the characters core's clean marks, with the same markers (decision 0032, rule 1)", () => {
  const whitespace = [0x09, 0x0a, 0x0d, 0x2028, 0x2029]; // core turns these into spaces or line breaks
  for (let code = 0; code <= 0xffff; code++) {
    if (code >= 0xd800 && code <= 0xdfff) continue; // lone surrogates aren't characters
    const c = ch(code);
    assert.equal(visible(c), whitespace.includes(code) ? c : clean(c), `U+${code.toString(16)}`);
  }
});

test("hasHidden: any string in a value, however deep", () => {
  assert.equal(hasHidden({ verdict: "fine", sections: [{ body: "plain" }], tags: ["a"] }), false);
  assert.equal(hasHidden({ verdict: "fine", sections: [{ body: `x${ch(0x2066)}y` }] }), true);
  assert.equal(hasHidden(["a", ["b", `c${ch(0x00)}`]]), true);
  assert.equal(hasHidden({ n: 1, b: true, z: null }), false);
});
