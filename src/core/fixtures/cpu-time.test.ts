import { test } from "node:test";
import assert from "node:assert/strict";
import { cpuTime } from "./cpu-time.ts";

// The helper the "bounded time" tests use: it counts work, not waiting.

// Spins until this thread has used 60 ms of CPU, not 60 ms of the clock: on a loaded machine the
// thread may get far less CPU than the clock shows. The 5 s guard ends it if CPU time never moves.
test("busy work is counted", () => {
  const { ms } = cpuTime(() => {
    const start = process.cpuUsage();
    const guard = performance.now() + 5000;
    while (process.cpuUsage(start).user < 60_000 && performance.now() < guard);
  });
  assert.ok(ms >= 50, `${ms} ms`);
});

test("waiting is not: 300 ms asleep costs almost no CPU time", () => {
  const { value, ms } = cpuTime(() => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
    return "slept";
  });
  assert.equal(value, "slept");
  assert.ok(ms < 100, `${ms} ms`);
});
