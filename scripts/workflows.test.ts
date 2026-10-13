import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

// The GitHub Actions workflows stay least-privilege and pinned (feat/hardening, §4.6 and §4.7;
// decision 0033): read-only by default, id-token only on the release's stage job, every action
// pinned to a commit SHA, no persisted credentials, no pull_request_target, no event data in a
// shell, and no dependency cache in the release.

const folder = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
interface Step { uses?: string; run?: string; with?: Record<string, unknown> }
interface Job { permissions?: Record<string, string>; steps: Step[] }
interface Workflow { on: Record<string, unknown>; permissions?: Record<string, string>; jobs: Record<string, Job> }
const workflows = readdirSync(folder).filter((f) => f.endsWith(".yml")).map((file) => ({ file, flow: parse(readFileSync(folder + file, "utf8")) as Workflow }));

test("every workflow is read-only by default and never runs on pull_request_target", () => {
  assert.ok(workflows.length >= 2);
  for (const { file, flow } of workflows) {
    assert.deepEqual(flow.permissions, { contents: "read" }, file);
    assert.ok(!("pull_request_target" in flow.on), file);
  }
});

test("only the release's stage job widens permissions, and only by id-token: write", () => {
  for (const { file, flow } of workflows) {
    for (const [name, job] of Object.entries(flow.jobs)) {
      if (file === "release.yml" && name === "stage") assert.deepEqual(job.permissions, { contents: "read", "id-token": "write" });
      else assert.equal(job.permissions, undefined, `${file} ${name}`);
    }
  }
});

test("every action is pinned to a full commit SHA with its version in a comment; checkouts keep no credentials", () => {
  for (const { file } of workflows) {
    for (const line of readFileSync(folder + file, "utf8").split("\n").filter((l) => /^\s*-?\s*uses:/.test(l))) {
      assert.match(line, /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `${file}: ${line.trim()}`);
    }
  }
  for (const { file, flow } of workflows) {
    for (const job of Object.values(flow.jobs)) {
      for (const step of job.steps.filter((s) => s.uses?.startsWith("actions/checkout@"))) assert.equal(step.with?.["persist-credentials"], false, file);
    }
  }
});

test("no event data reaches a shell, and the release uses no dependency cache", () => {
  for (const { file, flow } of workflows) {
    for (const job of Object.values(flow.jobs)) {
      for (const step of job.steps) {
        assert.doesNotMatch(step.run ?? "", /\$\{\{\s*github\.event/, file);
        if (file === "release.yml") {
          assert.ok(!step.with || !("cache" in step.with), "release: no setup-node cache");
          assert.doesNotMatch(step.run ?? "", /\$\{\{/, "release: values reach a shell through env only");
        }
      }
    }
  }
});

test("the release runs on v* tags, one run per tag at a time, never cancelled halfway", () => {
  const release = workflows.find((w) => w.file === "release.yml")?.flow as Workflow & { concurrency: { group: string; "cancel-in-progress": boolean } };
  assert.deepEqual(release.on, { push: { tags: ["v*"] } });
  assert.deepEqual(release.concurrency, { group: "release-${{ github.ref }}", "cancel-in-progress": false });
  const runs = Object.values(release.jobs).flatMap((job) => job.steps.map((s) => s.run ?? ""));
  assert.ok(runs.some((r) => r.startsWith("node scripts/release-check.ts")), "the tag check");
  assert.ok(runs.some((r) => r.startsWith('npm stage publish --tag "$DIST_TAG"')), "stage, not publish");
  assert.ok(!runs.some((r) => /npm publish/.test(r)), "never npm publish");
});
