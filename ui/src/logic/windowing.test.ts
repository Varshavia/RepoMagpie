import { test } from "node:test";
import assert from "node:assert/strict";
import { scrollToShow, visibleRange } from "./windowing.ts";

// List windowing (decision 0022, docs/ui.md §10): only the rows in view, plus a few above and below,
// are in the DOM. Fixed row heights.

test("the first screen: rows 0 to what fits, plus the overscan", () => {
  assert.deepEqual(visibleRange({ scrollTop: 0, viewportHeight: 320, rowHeight: 32, count: 2000, overscan: 4 }), { start: 0, end: 14, offsetTop: 0, totalHeight: 64000 });
});

test("scrolled into the middle: the overscan is on both sides, and the offset places the first row", () => {
  assert.deepEqual(visibleRange({ scrollTop: 3200, viewportHeight: 320, rowHeight: 32, count: 2000, overscan: 4 }), { start: 96, end: 114, offsetTop: 3072, totalHeight: 64000 });
});

test("a partly visible row counts, and the range never passes the end", () => {
  assert.deepEqual(visibleRange({ scrollTop: 16, viewportHeight: 100, rowHeight: 32, count: 5, overscan: 4 }), { start: 0, end: 5, offsetTop: 0, totalHeight: 160 });
  assert.deepEqual(visibleRange({ scrollTop: 63_900, viewportHeight: 320, rowHeight: 32, count: 2000, overscan: 2 }), { start: 1994, end: 2000, offsetTop: 63_808, totalHeight: 64000 });
});

test("an empty list, and a viewport not measured yet, render nothing", () => {
  assert.deepEqual(visibleRange({ scrollTop: 0, viewportHeight: 320, rowHeight: 32, count: 0, overscan: 4 }), { start: 0, end: 0, offsetTop: 0, totalHeight: 0 });
  assert.deepEqual(visibleRange({ scrollTop: 0, viewportHeight: 0, rowHeight: 32, count: 10, overscan: 4 }), { start: 0, end: 4, offsetTop: 0, totalHeight: 320 });
});

test("2,000 rows keep the DOM small: at most the visible rows plus twice the overscan", () => {
  const { start, end } = visibleRange({ scrollTop: 20_000, viewportHeight: 800, rowHeight: 32, count: 2000, overscan: 6 });
  assert.ok(end - start <= Math.ceil(800 / 32) + 1 + 12, `${end - start} rows`);
});

test("scrollToShow: null when the row is in view; otherwise the smallest scroll that shows it", () => {
  const view = { scrollTop: 320, viewportHeight: 320, rowHeight: 32 };
  assert.equal(scrollToShow({ ...view, index: 12 }), null);
  assert.equal(scrollToShow({ ...view, index: 9 }), 288); // above: align its top
  assert.equal(scrollToShow({ ...view, index: 20 }), 352); // below: align its bottom
  assert.equal(scrollToShow({ ...view, index: 19 }), null);
});
