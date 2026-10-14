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

const release = () => workflows.find((w) => w.file === "release.yml")?.flow as Workflow & { jobs: Record<string, Job & { outputs?: Record<string, string>; needs?: string }> };

test("the job with id-token runs no third-party code: it stages the tarball the first job packed, after checking its SHA-256", () => {
  const { stage, verify } = release().jobs;
  const runs = stage.steps.map((s) => s.run ?? "");
  const uses = stage.steps.map((s) => s.uses ?? "").filter(Boolean);
  assert.ok(!uses.some((u) => u.startsWith("actions/checkout@")), "no checkout: no repository code");
  assert.deepEqual(uses.map((u) => u.split("@")[0]).sort(), ["actions/download-artifact", "actions/setup-node"]);
  for (const run of runs) {
    assert.doesNotMatch(run, /npm (ci|run|test|pack|exec)\b|npx /, run);
    if (/npm (install|i)\b/.test(run)) assert.match(run, /--ignore-scripts/, run);
  }
  assert.ok(runs.some((r) => /sha256sum --check/.test(r)), "the tarball's SHA-256 is checked");
  assert.ok(runs.some((r) => /^npm stage publish "\.\/\$TARBALL" --tag "\$DIST_TAG" --ignore-scripts$/m.test(r)), "stages that tarball");
  assert.equal(stage.needs, "verify");
  assert.deepEqual(Object.keys(verify.outputs ?? {}).sort(), ["dist-tag", "sha256", "tarball"]);
  const verifyRuns = verify.steps.map((s) => s.run ?? "").join("\n");
  assert.match(verifyRuns, /npm pack/);
  assert.match(verifyRuns, /sha256sum/);
  assert.ok(verify.steps.some((s) => s.uses?.startsWith("actions/upload-artifact@")), "the tarball is uploaded");
});

test("the tag check has main's history: the first job's checkout isn't shallow", () => {
  const { verify } = release().jobs;
  const checkout = verify.steps.findIndex((s) => s.uses?.startsWith("actions/checkout@"));
  const check = verify.steps.findIndex((s) => s.run?.startsWith("node scripts/release-check.ts"));
  assert.ok(checkout !== -1 && checkout < check);
  assert.equal(verify.steps[checkout].with?.["fetch-depth"], 0, "fetch-depth: 0 fetches every branch's history, main's included");
});

test("the release runs on v* tags, one run per tag at a time, never cancelled halfway", () => {
  const release = workflows.find((w) => w.file === "release.yml")?.flow as Workflow & { concurrency: { group: string; "cancel-in-progress": boolean } };
  assert.deepEqual(release.on, { push: { tags: ["v*"] } });
  assert.deepEqual(release.concurrency, { group: "release-${{ github.ref }}", "cancel-in-progress": false });
  const runs = Object.values(release.jobs).flatMap((job) => job.steps.map((s) => s.run ?? ""));
  assert.ok(runs.some((r) => r.startsWith("node scripts/release-check.ts")), "the tag check");
  assert.ok(runs.some((r) => r.includes("npm stage publish")), "stage, not publish");
  assert.ok(!runs.some((r) => /npm publish/.test(r)), "never npm publish");
});
