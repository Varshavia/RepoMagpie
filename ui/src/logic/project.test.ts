import { test } from "node:test";
import assert from "node:assert/strict";
import { hostLabel, pullFirstLine, turnOnLabel } from "./project.ts";

// The Project view's button and identity line (docs/ui.md §7).

test("turnOnLabel: owner/repo with a remote; this repository without one, or before git answers", () => {
  assert.equal(turnOnLabel({ name: "acme/widget", host: "github.com", url: "https://github.com/acme/widget" }), "Turn on shared notes for acme/widget");
  assert.equal(turnOnLabel({ name: "app", host: null, url: null }), "Turn on shared notes for this repository");
  assert.equal(turnOnLabel(null), "Turn on shared notes for this repository");
});

// Two machines that both turn shared notes on collide on the second pull (docs/teams.md).
test("pullFirstLine: only when the branch tracks a remote branch; never before git answers", () => {
  const repository = { name: "acme/widget", host: "github.com", url: "https://github.com/acme/widget" };
  assert.equal(pullFirstLine({ repository, sharing: null, upstream: true }), "If a teammate may have turned them on already, pull first.");
  assert.equal(pullFirstLine({ repository, sharing: null, upstream: false }), null, "a remote without an upstream branch");
  assert.equal(pullFirstLine({ repository: null, sharing: null, upstream: false }), null);
  assert.equal(pullFirstLine(null), null);
});

test("hostLabel: the host, or no remote", () => {
  assert.equal(hostLabel({ name: "acme/widget", host: "gitlab.com", url: null }), "gitlab.com");
  assert.equal(hostLabel({ name: "app", host: null, url: null }), "no remote");
});
