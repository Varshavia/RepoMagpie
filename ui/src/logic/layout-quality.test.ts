import { test } from "node:test";
import assert from "node:assert/strict";
import { CANVAS, crowding, edgeLengths, layoutQuality, separation, withinTolerance, type Placed } from "./layout-quality.ts";

// The layout's quality numbers (decision 0049): what a faster layout must keep.

const node = (key: string, x: number, y: number, extra: Partial<Placed> = {}): Placed => ({ key, x, y, size: 8, tag: false, ...extra });

test("edgeLengths: the median edge ÷ the diagonal, and the lengths' spread; edges to missing nodes don't count", () => {
  const nodes = [node("a", 0, 0), node("b", 3, 0), node("c", 3, 4)];
  const q = edgeLengths(nodes, [["a", "b"], ["b", "c"], ["a", "c"], ["a", "gone"]]);
  // Lengths 3, 4, 5; the diagonal of a 3 × 4 box is 5.
  assert.equal(q.edgeLength, 4 / 5);
  const mean = 4;
  assert.ok(Math.abs(q.edgeSpread - Math.sqrt(((3 - mean) ** 2 + 0 + (5 - mean) ** 2) / 3) / mean) < 1e-12);
  assert.deepEqual(edgeLengths(nodes, []), { edgeLength: 0, edgeSpread: 0 });
  assert.deepEqual(edgeLengths([node("a", 1, 1)], [["a", "a"]]), { edgeLength: 0, edgeSpread: 0 });
});

test("crowding: pairs closer than their two sizes on the fitted canvas; every pair up to 1,000 nodes", () => {
  // A 100-wide box fills the canvas: 1 unit is CANVAS / 100 px.
  const unit = CANVAS / 100;
  const nodes = [node("a", 0, 0), node("b", 100, 0), node("c", 100 - 15 / unit, 0)]; // b and c 15 px apart, under 16
  assert.equal(crowding(nodes), 1 / 3);
  assert.equal(crowding([node("a", 0, 0)]), 0);
  assert.equal(crowding([node("a", 0, 0), node("b", 100, 0), node("c", 100 - 17 / unit, 0)]), 0); // 17 px: not crowded
});

test("crowding: above 1,000 nodes it samples, the same way every run", () => {
  const nodes = Array.from({ length: 1500 }, (_, i) => node(`n${i}`, (i * 37) % 1000, (i * 91) % 700));
  const first = crowding(nodes);
  assert.equal(crowding(nodes), first);
  assert.ok(first > 0 && first < 0.05, String(first));
});

test("separation: notes near their own tags score low, notes spread evenly score about 1", () => {
  const tags = [node("tag:a", 0, 0, { tag: true }), node("tag:b", 100, 0, { tag: true })];
  const near = [...tags, node("n1", 1, 0), node("n2", 99, 0)];
  const edges: [string, string][] = [["n1", "tag:a"], ["n2", "tag:b"]];
  assert.ok(Math.abs(separation(near, edges) - 1 / 50) < 1e-12); // own tag at 1, both tags at 50 on average
  const far = [...tags, node("n1", 99, 0), node("n2", 1, 0)];
  assert.ok(separation(far, edges) > 1.9);
  assert.equal(separation([node("n1", 0, 0)], []), 0); // no tags
});

test("layoutQuality: all four numbers; withinTolerance allows 10% either way on the edges, and only 10% worse on the rest", () => {
  const nodes = [node("tag:a", 0, 0, { tag: true }), node("n1", 10, 0), node("n2", 0, 10)];
  const q = layoutQuality(nodes, [["n1", "tag:a"], ["n2", "tag:a"]]);
  assert.deepEqual(Object.keys(q), ["edgeLength", "edgeSpread", "crowding", "separation"]);
  const base = { edgeLength: 0.1, edgeSpread: 0.5, crowding: 0.005, separation: 0.5 };
  assert.ok(withinTolerance(base, base));
  assert.ok(withinTolerance(base, { ...base, edgeLength: 0.109, separation: 0.3, crowding: 0.001 }));
  assert.ok(!withinTolerance(base, { ...base, edgeLength: 0.089 }));
  assert.ok(!withinTolerance(base, { ...base, edgeSpread: 0.56 }));
  assert.ok(!withinTolerance(base, { ...base, crowding: 0.0056 }));
  assert.ok(!withinTolerance(base, { ...base, separation: 0.56 }));
});
