import { test } from "node:test";
import assert from "node:assert/strict";
import { ageText, compactCount, journalSummary, licenceText, oneLine } from "./discover-format.ts";

test("compactCount writes counts as GitHub does", () => {
  const cases: [number, string][] = [[0, "0"], [7, "7"], [999, "999"], [1000, "1k"], [1234, "1.2k"], [1299, "1.2k"], [98_100, "98.1k"], [100_400, "100k"], [999_999, "999k"], [1_000_000, "1M"], [1_250_000, "1.2M"], [-5, "0"], [Number.NaN, "0"]];
  for (const [n, text] of cases) assert.equal(compactCount(n), text, String(n));
});

test("ageText says how long ago a day was, from today", () => {
  const today = "2026-10-26";
  const cases: [string, string | null][] = [
    ["2026-10-26T08:00:00Z", "today"],
    ["2026-10-27", "today"], // after today
    ["2026-10-25", "yesterday"],
    ["2026-10-21", "5 days ago"],
    ["2026-10-13", "13 days ago"],
    ["2026-10-12", "2 weeks ago"],
    ["2026-08-28", "8 weeks ago"],
    ["2026-08-27", "1 month ago"],
    ["2026-07-26", "3 months ago"],
    ["2024-10-27", "23 months ago"],
    ["2024-10-26", "2 years ago"],
    ["2016-01-01", "10 years ago"],
    ["not a date", null],
  ];
  for (const [date, text] of cases) assert.equal(ageText(date, today), text, date);
});

test("licenceText names a missing and an unnamed licence in words", () => {
  assert.equal(licenceText("MIT"), "MIT");
  assert.equal(licenceText("none"), "no licence");
  assert.equal(licenceText("unknown"), "licence unknown");
});

test("oneLine: one line of at most max characters, cut at a word with an ellipsis, or mid-word when no space is near", () => {
  assert.equal(oneLine("  short\n\ttext  "), "short text");
  assert.equal(oneLine("x".repeat(100)), "x".repeat(100));
  const long = `${"word ".repeat(30)}end`;
  const cut = oneLine(long);
  assert.ok(cut.length <= 100, String(cut.length));
  assert.ok(cut.endsWith("word…"));
  assert.equal(oneLine("x".repeat(150)), `${"x".repeat(99)}…`);
  assert.equal(oneLine("use it for the invoice export at work, never for anything that streams", 40), "use it for the invoice export at work,…");
});

test("journalSummary names what it shows: the Verdict, else What it does, else the inbox", () => {
  assert.equal(journalSummary({ verdict: "our default UI kit", what_it_does: "Renders things." }), "Verdict: our default UI kit");
  assert.equal(journalSummary({ verdict: null, what_it_does: "Renders PDF invoices\nfrom HTML." }), "What it does: Renders PDF invoices from HTML.");
  assert.equal(journalSummary({ verdict: null, what_it_does: null }), "in the inbox, no Verdict yet");
  assert.equal(journalSummary({ verdict: "a ".repeat(80), what_it_does: null }, 20), "Verdict: a a a a a a a a a a…");
});
