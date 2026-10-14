// Test helper: the CPU time this process spends on `work`, in milliseconds. For tests that check
// work is bounded (no quadratic parse, no whole-file read): CPU time doesn't grow while the process
// waits for the CPU, as it does on a busy CI runner where node --test runs files in parallel, nor
// while it waits for the disk. Wall-clock time does, and made such tests fail at random.
// Not part of the build.
export function cpuTime<T>(work: () => T): { value: T; ms: number } {
  const start = process.cpuUsage();
  const value = work();
  const used = process.cpuUsage(start);
  return { value, ms: (used.user + used.system) / 1000 };
}
