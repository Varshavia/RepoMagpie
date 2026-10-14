import { test } from "node:test";
import assert from "node:assert/strict";
import { REDACTED, redactArgs, redactText } from "./redact.ts";

// Secrets out of other tools' config text (decision 0035), and nothing else changed.

test("named values, token formats and URL passwords are redacted", () => {
  for (const [text, expected] of [
    ["GITHUB_TOKEN=ghx-anything repomagpie hook claude-code", `GITHUB_TOKEN=${REDACTED} repomagpie hook claude-code`],
    ["--api-key=abc123", `--api-key=${REDACTED}`],
    ['{"password": "p@ss"}', `{"password": ${REDACTED}}`],
    ["https://me:hunter2@example.com/x", `https://me:${REDACTED}@example.com/x`],
    ["see ghp_0123456789abcdefghijABCDEFGHIJ0123 here", `see ${REDACTED} here`],
    ["AKIAIOSFODNN7EXAMPLE", REDACTED],
    ["?session=abc&x=1", `?session=${REDACTED}&x=1`],
  ]) assert.equal(redactText(text), expected, text);
  assert.deepEqual(redactArgs(["main.js", "mcp", "--token", "s3cret", "-x", "1"]), ["main.js", "mcp", "--token", REDACTED, "-x", "1"]);
});

test("ordinary paths and flags stay as written", () => {
  for (const text of [
    "C:\\Users\\me\\oauth-tools\\node_modules\\repomagpie\\dist\\cli\\main.js",
    "/home/auth/.nvm/versions/node/v24.13.0/bin/node",
    "--disallow-code-generation-from-strings",
    "--allow-write",
    "repomagpie hook claude-code --inform-only",
    "D:\\tokens\\main.js",
  ]) assert.equal(redactText(text), text);
  assert.deepEqual(redactArgs(["--home", "C:\\Users\\me\\journal"]), ["--home", "C:\\Users\\me\\journal"]);
});
