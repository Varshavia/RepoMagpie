import { test } from "node:test";
import assert from "node:assert/strict";
import { setMember } from "./json-edit.ts";

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

test("refused: a root or a container that isn't an object, and text that isn't JSON", () => {
  assert.throws(() => setMember("[]", ["mcpServers", "repomagpie"], 1), /not an object/);
  assert.throws(() => setMember('{"mcpServers": []}', ["mcpServers", "repomagpie"], 1), /not an object/);
  assert.throws(() => setMember('{"a": }', ["mcpServers", "repomagpie"], 1), /not valid JSON/);
});
