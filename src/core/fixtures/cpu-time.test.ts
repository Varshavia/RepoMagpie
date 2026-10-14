import { test } from "node:test";
import assert from "node:assert/strict";
import { cpuTime } from "./cpu-time.ts";

// The helper the "bounded time" tests use: it counts work, not waiting.

test("busy work is counted", () => {
  const { ms } = cpuTime(() => {
    const until = performance.now() + 60;
    while (performance.now() < until);
  });
  assert.ok(ms >= 30, `${ms} ms`);
});

test("waiting is not: 300 ms asleep costs almost no CPU time", () => {
  const { value, ms } = cpuTime(() => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
    return "slept";
  });
  assert.equal(value, "slept");
  assert.ok(ms < 100, `${ms} ms`);
});
