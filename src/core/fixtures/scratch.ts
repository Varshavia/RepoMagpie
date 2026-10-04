// Test helper: a temporary folder under <repo>/.scratch/tests/, never the OS temp folder. Its base
// holds a .git folder, so walking up to find a git root or a .magpie folder stops inside it and can
// never reach the real home directory or its ~/.magpie. Removed when the test file ends.
// Not part of the build (tsconfig.build.json excludes fixtures/).
import { after } from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRATCH_TESTS = fileURLToPath(new URL("../../../.scratch/tests/", import.meta.url));

const bases: string[] = [];
after(() => { for (const base of bases) rmSync(base, { recursive: true, force: true }); });

// A new folder <repo>/.scratch/tests/<prefix>-XXXXXX/ with .git/ in it; returns its path.
export function scratchBase(prefix: string): string {
  mkdirSync(SCRATCH_TESTS, { recursive: true });
  const base = mkdtempSync(join(SCRATCH_TESTS, `${prefix}-`));
  bases.push(base);
  mkdirSync(join(base, ".git"));
  return base;
}
