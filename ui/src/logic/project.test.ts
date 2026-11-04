import { test } from "node:test";
import assert from "node:assert/strict";
import { hostLabel, turnOnLabel } from "./project.ts";

// The Project view's button and identity line (docs/ui.md §7).

test("turnOnLabel: owner/repo with a remote; this repository without one, or before git answers", () => {
  assert.equal(turnOnLabel({ name: "acme/widget", host: "github.com", url: "https://github.com/acme/widget" }), "Turn on shared notes for acme/widget");
  assert.equal(turnOnLabel({ name: "app", host: null, url: null }), "Turn on shared notes for this repository");
  assert.equal(turnOnLabel(null), "Turn on shared notes for this repository");
});

test("hostLabel: the host, or no remote", () => {
  assert.equal(hostLabel({ name: "acme/widget", host: "gitlab.com", url: null }), "gitlab.com");
  assert.equal(hostLabel({ name: "app", host: null, url: null }), "no remote");
});
