import { test } from "node:test";
import assert from "node:assert/strict";
import { iterateUntilSettled, meanStep, positionsOf, STOP, stopsAt } from "./layout-stop.ts";

// When the layout stops (decision 0049): settled, never before the minimum, never after the maximum.

// A node matrix as ForceAtlas2 keeps it: 10 numbers a node, x and y first.
function matrix(points: [number, number][]): Float32Array {
  const m = new Float32Array(points.length * 10);
  points.forEach(([x, y], i) => m.set([x, y], i * 10));
  return m;
}

test("positionsOf and meanStep: the mean move per iteration ÷ the box's larger side", () => {
  const m = matrix([[0, 0], [100, 0], [0, 50]]);
  assert.deepEqual([...positionsOf(m)], [0, 0, 100, 0, 0, 50]);
  const before = positionsOf(m);
  m[0] = 10; // the first node moves 10 (the box is 100 wide either way)
  assert.ok(Math.abs(meanStep(before, m, 10) - 10 / 3 / 10 / 100) < 1e-12);
  assert.equal(meanStep(positionsOf(matrix([[5, 5]])), matrix([[5, 5]]), 10), 0); // one node: no box
});

test("stopsAt: under the threshold after the minimum; at the maximum always; Re-layout (full) only at the maximum", () => {
  assert.equal(stopsAt(STOP.min - STOP.chunk, 0), false);
  assert.equal(stopsAt(STOP.min, 0), true);
  assert.equal(stopsAt(STOP.min, STOP.settle), false);
  assert.equal(stopsAt(STOP.max, 1), true);
  assert.equal(stopsAt(STOP.min, 0, true), false);
  assert.equal(stopsAt(STOP.max, 0, true), true);
});

test("iterateUntilSettled: a settled graph stops at the minimum, a moving one runs to the maximum, Re-layout runs to the maximum", () => {
  const still = matrix([[0, 0], [100, 100]]);
  assert.equal(iterateUntilSettled(still, () => {}, false), STOP.min);
  assert.equal(iterateUntilSettled(still, () => {}, true), STOP.max);
  let seed = 3;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const chaos = matrix(Array.from({ length: 50 }, () => [rand() * 100, rand() * 100] as [number, number]));
  const shake = () => {
    for (let n = 0; n < chaos.length; n += 10) [chaos[n], chaos[n + 1]] = [rand() * 100, rand() * 100];
  };
  assert.equal(iterateUntilSettled(chaos, shake, false), STOP.max);
});

test("iterateUntilSettled: a layout that slows down stops once a chunk's move is under the threshold; every iteration is reported", () => {
  const m = matrix([[0, 0], [100, 0]]);
  let speed = 4; // the second node's move per iteration, 0.8 of it every chunk
  const seen: number[] = [];
  const ran = iterateUntilSettled(m, () => {
    m[10] += speed;
  }, false, (i) => {
    seen.push(i);
    if (i % STOP.chunk === 0) speed *= 0.8;
  });
  // A chunk's mean move per iteration is speed / 2 nodes / the box's side (100 and growing): under
  // the threshold after about 12 chunks.
  assert.ok(ran > STOP.min && ran < STOP.max, String(ran));
  assert.equal(ran % STOP.chunk, 0);
  assert.deepEqual(seen, Array.from({ length: ran }, (_, i) => i + 1));
});
