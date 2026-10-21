import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { codexHookHash, codexHooksOff, codexTrust } from "./codex-hooks.ts";

// What Codex CLI keeps about hooks in config.toml, read as its source does (docs/agents.md, "Codex
// CLI"): the hooks switch, the trust of one hook by its position, and the hash that trust holds.

const sha = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

test("the hash is Codex's: the event, the group's matcher and the normalised handler, as sorted compact JSON", () => {
  // Codex's own test vector for version_for_toml (codex-rs/config/src/fingerprint_tests.rs) is the
  // sha256 of {"nested":{"a":true,"z":"text"},"rows":[{"a":1,"z":2},{"a":3,"z":4}]}: keys sorted,
  // no spaces. The identity of a PreToolUse handler, in that form:
  assert.equal(codexHookHash("Bash", { type: "command", command: "x", timeout: 10 }, false), sha('{"event_name":"pre_tool_use","hooks":[{"async":false,"command":"x","timeout":10,"type":"command"}],"matcher":"Bash"}'));
  // No timeout is 600; a status message is part of it; no matcher is left out.
  assert.equal(codexHookHash(null, { command: "x", statusMessage: "RepoMagpie" }, false), sha('{"event_name":"pre_tool_use","hooks":[{"async":false,"command":"x","statusMessage":"RepoMagpie","timeout":600,"type":"command"}]}'));
  // On Windows the command Codex runs is commandWindows when there is one.
  const both = { command: "posix", commandWindows: "windows", timeout: 10 };
  assert.equal(codexHookHash("Bash", both, true), codexHookHash("Bash", { command: "windows", timeout: 10 }, true));
  assert.equal(codexHookHash("Bash", both, false), codexHookHash("Bash", { command: "posix", timeout: 10 }, false));
  assert.notEqual(codexHookHash("Bash", { command: "x", timeout: 10 }, false), codexHookHash("Bash", { command: "x", timeout: 11 }, false));
});

test("hooks turned off: [features] hooks = false, the older codex_hooks, or features.hooks at the top", () => {
  for (const text of ["[features]\nhooks = false\n", "[features]\r\ncodex_hooks = false # old\r\n", "features.hooks = false\n", 'model = "x"\n[ features ]\n  hooks   =   false\n']) assert.equal(codexHooksOff(text), true, text);
  for (const text of ["", "[features]\nhooks = true\n", "[other]\nhooks = false\n", "[features]\n# hooks = false\n", "[mcp_servers.x]\nhooks = false\n"]) assert.equal(codexHooksOff(text), false, text);
});

test("the trust of one hook: its file, event, group and handler; the hash; turned off; Windows paths in any case", () => {
  const file = "C:\\Users\\me\\.codex\\hooks.json";
  const text = [
    "[hooks.state.'C:\\Users\\me\\.codex\\hooks.json:pre_tool_use:0:0']",
    'trusted_hash = "sha256:aaa"',
    "",
    '[hooks.state."c:\\\\users\\\\me\\\\.codex\\\\hooks.json:pre_tool_use:2:0"]',
    'trusted_hash = "sha256:bbb"',
    "enabled = false",
    "[hooks.state.'C:\\Users\\me\\.codex\\other.json:pre_tool_use:1:0']",
    'trusted_hash = "sha256:ccc"',
  ].join("\n");
  assert.deepEqual(codexTrust(text, file, 0, 0, true), { trusted_hash: "sha256:aaa", enabled: true });
  assert.deepEqual(codexTrust(text, file, 2, 0, true), { trusted_hash: "sha256:bbb", enabled: false });
  assert.equal(codexTrust(text, file, 1, 0, true), null, "another file's state");
  assert.equal(codexTrust(text, file, 0, 1, true), null);
  assert.equal(codexTrust(text, file, 2, 0, false), null, "outside Windows, case counts");
});
