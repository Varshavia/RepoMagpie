import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { linkTargets, markdownFiles } from "./check-links.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

test("the link check sees Markdown files in subfolders, not only at the root", () => {
  const files = markdownFiles(root).map((file) => file.slice(root.length).replace(/\\/g, "/"));
  assert.ok(files.includes("README.md"));
  assert.ok(files.includes("docs/roadmap.md"));
  assert.ok(files.includes("docs/decisions/0012-branch-workflow.md"));
});

test("the link check reads Markdown links and HTML src and href, not code", () => {
  const text = [
    "[Spec](docs/spec.md#2-commands) and ![Logo](docs/assets/logo.svg \"title\")",
    "<img src=\"../assets/logo.svg\" width=\"96\" alt=\"a magpie\">",
    "<a href=\"#faq\"><img alt=\"badge\" src=\"https://img.shields.io/x\"></a>",
    "`<img src=\"in-a-span.svg\">` and `[span](span.md)`",
    "```html",
    "<img src=\"in-a-block.svg\"> [block](block.md)",
    "```",
  ].join("\n");
  assert.deepEqual(linkTargets(text).sort(), ["#faq", "../assets/logo.svg", "docs/assets/logo.svg", "docs/spec.md#2-commands", "https://img.shields.io/x"]);
});
