import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { packageVersion } from "./version.ts";

test("packageVersion returns the version from package.json", () => {
  const expected = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
  assert.equal(packageVersion(), expected);
});
