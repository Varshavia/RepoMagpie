import { test } from "node:test";
import assert from "node:assert/strict";
import { appendItem, removeAt, replaceAt, setMember } from "./json-edit.ts";

// One member of one object in a plain JSON file, changed and nothing else (decision 0035, "How it
// writes"): key order, indentation, line endings and the final newline stay as they were.

const ENTRY = { command: "/n/node", args: ["a", "mcp"] };

test("a new member goes last in its object, indented as the file is; the rest stays byte for byte", () => {
  const text = '{\n  "theme": "dark",\n  "mcpServers": {\n    "other": { "command": "x" }\n  }\n}\n';
  assert.equal(setMember(text, ["mcpServers", "repomagpie"], ENTRY),
    '{\n  "theme": "dark",\n  "mcpServers": {\n    "other": { "command": "x" },\n    "repomagpie": {\n      "command": "/n/node",\n      "args": [\n        "a",\n        "mcp"\n      ]\n    }\n  }\n}\n');
});

test("tabs and CRLF are kept; a missing container is added at the end of the root", () => {
  const text = '{\r\n\t"inputs": [],\r\n\t"x": 1\r\n}';
  assert.equal(setMember(text, ["servers", "repomagpie"], { command: "n" }), '{\r\n\t"inputs": [],\r\n\t"x": 1,\r\n\t"servers": {\r\n\t\t"repomagpie": {\r\n\t\t\t"command": "n"\r\n\t\t}\r\n\t}\r\n}');
});

test("an existing member's value is replaced in place", () => {
  const text = '{"mcpServers":{"a":1,"repomagpie":{"command":"old"},"b":2},"z":true}';
  assert.equal(setMember(text, ["mcpServers", "repomagpie"], { command: "new" }), '{"mcpServers":{"a":1,"repomagpie":{\n      "command": "new"\n    },"b":2},"z":true}');
});

test("an empty object, an empty file and no file get the member", () => {
  assert.equal(setMember('{\n  "mcpServers": {}\n}\n', ["mcpServers", "repomagpie"], { c: 1 }), '{\n  "mcpServers": {\n    "repomagpie": {\n      "c": 1\n    }\n  }\n}\n');
  assert.equal(setMember(null, ["mcpServers", "repomagpie"], { c: 1 }), '{\n  "mcpServers": {\n    "repomagpie": {\n      "c": 1\n    }\n  }\n}\n');
  assert.equal(setMember("{}", ["mcpServers", "repomagpie"], { c: 1 }), '{\n  "mcpServers": {\n    "repomagpie": {\n      "c": 1\n    }\n  }\n}');
});

test("removing: the only, the first and the last member; the commas stay right", () => {
  const only = '{\n  "mcpServers": {\n    "repomagpie": { "c": 1 }\n  }\n}\n';
  assert.equal(setMember(only, ["mcpServers", "repomagpie"], undefined), '{\n  "mcpServers": {}\n}\n');
  const first = '{"mcpServers": {"repomagpie": 1, "a": 2}}';
  assert.equal(setMember(first, ["mcpServers", "repomagpie"], undefined), '{"mcpServers": {"a": 2}}');
  const last = '{\n  "mcpServers": {\n    "a": 2,\n    "repomagpie": 1\n  }\n}';
  assert.equal(setMember(last, ["mcpServers", "repomagpie"], undefined), '{\n  "mcpServers": {\n    "a": 2\n  }\n}');
  const none = '{"mcpServers": {"a": 2}}';
  assert.equal(setMember(none, ["mcpServers", "repomagpie"], undefined), none);
  assert.equal(setMember('{"x": 1}', ["mcpServers", "repomagpie"], undefined), '{"x": 1}');
});

test("strings with braces, quotes and escapes don't confuse it; a key is matched after unescaping", () => {
  const text = '{"note": "a } { \\" , ]", "mcpServers": {"repo\\u006dagpie": 1}}';
  assert.equal(setMember(text, ["mcpServers", "repomagpie"], 2), '{"note": "a } { \\" , ]", "mcpServers": {"repo\\u006dagpie": 2}}');
});

// Claude Code's settings.json, with a hook group of its own already in PreToolUse.
const SETTINGS = '{\n  "permissions": { "allow": ["Bash(npm test)"] },\n  "hooks": {\n    "PreToolUse": [\n      {\n        "matcher": "Bash",\n        "hooks": [{ "type": "command", "command": "node git-guard.mjs" }]\n      }\n    ]\n  }\n}\n';
const GROUP = { matcher: "Bash|PowerShell", hooks: [{ type: "command", command: "repomagpie hook claude-code" }] };

test("appendItem: a new item goes last in an array, indented for its depth; an empty array is filled", () => {
  const added = appendItem(SETTINGS, ["hooks", "PreToolUse"], GROUP);
  assert.equal(added, SETTINGS.replace('\n      }\n    ]', '\n      },\n      {\n        "matcher": "Bash|PowerShell",\n        "hooks": [\n          {\n            "type": "command",\n            "command": "repomagpie hook claude-code"\n          }\n        ]\n      }\n    ]'));
  assert.deepEqual(JSON.parse(added).hooks.PreToolUse[1], GROUP);
  assert.equal(appendItem('{"a": []}', ["a"], 1), '{"a": [\n    1\n  ]}');
});

test("removeAt: an array item or an object member, the commas staying right; replaceAt: one value in place", () => {
  const added = appendItem(SETTINGS, ["hooks", "PreToolUse"], GROUP);
  assert.equal(removeAt(added, ["hooks", "PreToolUse", 1]), SETTINGS);
  assert.equal(removeAt('{"a": [1, 2, 3]}', ["a", 0]), '{"a": [2, 3]}');
  assert.equal(removeAt('{"a": [1]}', ["a", 0]), '{"a": []}');
  assert.equal(removeAt('{"x": 1, "y": 2}', ["y"]), '{"x": 1}');
  const old = SETTINGS.replace("node git-guard.mjs", "magpie hook claude-code");
  assert.equal(replaceAt(old, ["hooks", "PreToolUse", 0, "hooks", 0, "command"], "repomagpie hook claude-code"), SETTINGS.replace("node git-guard.mjs", "repomagpie hook claude-code"));
  assert.throws(() => replaceAt(SETTINGS, ["hooks", "PreToolUse", 5], 1), /no item 5/);
  assert.throws(() => appendItem(SETTINGS, ["permissions"], 1), /not an array/);
});

test("refused: a root or a container that isn't an object, and text that isn't JSON", () => {
  assert.throws(() => setMember("[]", ["mcpServers", "repomagpie"], 1), /not an object/);
  assert.throws(() => setMember('{"mcpServers": []}', ["mcpServers", "repomagpie"], 1), /not an object/);
  assert.throws(() => setMember('{"a": }', ["mcpServers", "repomagpie"], 1), /not valid JSON/);
});
