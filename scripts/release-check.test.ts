import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseCheck } from "./release-check.ts";

// The release workflow's checks before anything is staged (decision 0033): the tag names the
// package's version, its commit is on main's history, and the dist-tag follows from the version.
// Git is replaced by a fake: the workflow runs the real one.

const onMain = () => true;

test("a prerelease tag that equals the version is staged under beta", () => {
  assert.deepEqual(releaseCheck({ tag: "v0.2.0-beta.3", version: "0.2.0-beta.3", isOnMain: onMain }), { ok: true, distTag: "beta" });
});

test("a final version is staged under latest", () => {
  assert.deepEqual(releaseCheck({ tag: "v1.0.0", version: "1.0.0", isOnMain: onMain }), { ok: true, distTag: "latest" });
});

test("a tag that doesn't equal v plus the version is refused, with both named", () => {
  for (const tag of ["v0.2.0", "0.2.0-beta.3", "v0.2.0-beta.3x", "release-0.2.0-beta.3", ""]) {
    const r = releaseCheck({ tag, version: "0.2.0-beta.3", isOnMain: onMain });
    assert.equal(r.ok, false, tag);
    if (!r.ok) assert.match(r.error, /doesn't match the version in package\.json \(0\.2\.0-beta\.3\)/);
  }
});

test("a tag whose commit isn't on main's history is refused", () => {
  const r = releaseCheck({ tag: "v0.2.0-beta.3", version: "0.2.0-beta.3", isOnMain: () => false });
  assert.deepEqual(r, { ok: false, error: "The tag v0.2.0-beta.3 points to a commit that isn't on main's history. Release tags are created on main only (decision 0012)." });
});

test("a shallow clone is refused before the history check, which would give a wrong answer", () => {
  const r = releaseCheck({ tag: "v0.2.0-beta.3", version: "0.2.0-beta.3", isOnMain: onMain, isShallow: () => true });
  assert.deepEqual(r, { ok: false, error: "The checkout is shallow, so main's history can't be checked. Check out with fetch-depth: 0." });
});

test("a version that isn't semver is refused", () => {
  const r = releaseCheck({ tag: "vlatest", version: "latest", isOnMain: onMain });
  assert.equal(r.ok, false);
});
