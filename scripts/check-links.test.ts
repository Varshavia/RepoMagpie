import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { markdownFiles } from "./check-links.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

test("the link check sees Markdown files in subfolders, not only at the root", () => {
  const files = markdownFiles(root).map((file) => file.slice(root.length).replace(/\\/g, "/"));
  assert.ok(files.includes("README.md"));
  assert.ok(files.includes("docs/roadmap.md"));
  assert.ok(files.includes("docs/decisions/0012-branch-workflow.md"));
});
