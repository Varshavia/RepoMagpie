import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInput } from "../../../src/core/save.ts";
import { scratchBase } from "../../../src/core/fixtures/scratch.ts";

// Decision 0058: the app never tells a person to add a command-line flag. Its "Type of a bare name"
// field is what settles a bare name there, so an ambiguous one points at it.

const UI = fileURLToPath(new URL("../", import.meta.url)); // ui/src: what ships; ui/e2e may check for the flag's absence

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : files(path);
    return /\.(tsx?|css|html)$/.test(entry.name) ? [path] : [];
  });
}

test("no file in ui/src says --type", () => {
  const found = files(UI).filter((path) => !path.endsWith("no-cli-flags.test.ts") && readFileSync(path, "utf8").includes("--type"));
  assert.deepEqual(found, []);
});

test("an ambiguous bare name, as the app is told: choose its type above, no flag", async () => {
  const root = scratchBase("ui-type");
  const place = { home: join(root, "home"), env: { MAGPIE_HOME: join(root, "journal") }, cwd: root };
  const resolved = await resolveInput("lodash", undefined, place, { surface: "app" });
  assert.deepEqual(resolved, { ok: false, error: "lodash could be npm, pypi, cargo. Choose its type above." });
  // The field is for bare names: a type chosen there doesn't stop a PURL or a URL.
  assert.deepEqual(await resolveInput("pkg:npm/lodash", "npm", place, { surface: "app" }), { ok: true, purl: "pkg:npm/lodash", skillPath: undefined });
});
