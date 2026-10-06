import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, parse } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import { parseCargoToml, parsePackageJson, parsePyproject, readmeIntro, readProject } from "./manifests.ts";

// What a project's manifests and README say, for suggest (spec §2, §5): dependencies, keywords,
// descriptions, the README's first heading and paragraph. No TOML library: a line reader.

test("package.json: every dependency field, keywords and description", () => {
  const text = JSON.stringify({
    name: "app",
    description: "Render invoices as PDF",
    keywords: ["pdf", "invoices", 3],
    dependencies: { pdfkit: "^0.15.0", "@playwright/cli": "1.0.0" },
    devDependencies: { vitest: "^3" },
    peerDependencies: { react: "*" },
    optionalDependencies: { fsevents: "*" },
  });
  assert.deepEqual(parsePackageJson(text), {
    dependencies: ["pdfkit", "@playwright/cli", "vitest", "react", "fsevents"],
    keywords: ["pdf", "invoices"],
    description: "Render invoices as PDF",
  });
  assert.deepEqual(parsePackageJson("{ not json"), { dependencies: [], keywords: [], description: "" });
});

test("pyproject.toml: [project] and optional dependencies, dependency groups, Poetry tables, keywords, description", () => {
  const text = `[build-system]
requires = ["hatchling"]

[project]
name = "app"
description = "Scrape pages # with a hash"
keywords = ["scraping", 'http']
dependencies = [
  "requests[socks]>=2.31",  # a comment
  "beautifulsoup4 ; python_version > '3.8'",
  "Pillow",
]

[project.optional-dependencies]
dev = ["pytest>=8", "ruff"]

[dependency-groups]
test = ["coverage", {include-group = "lint"}]

[tool.poetry.dependencies]
python = "^3.11"
httpx = { version = "^0.27", extras = ["http2"] }

[tool.poetry.group.docs.dependencies]
mkdocs = "*"
`;
  assert.deepEqual(parsePyproject(text), {
    dependencies: ["requests", "beautifulsoup4", "Pillow", "pytest", "ruff", "coverage", "httpx", "mkdocs"],
    keywords: ["scraping", "http"],
    description: "Scrape pages # with a hash",
  });
});

test("Cargo.toml: every dependency table, dotted keys, sub-tables, targets and the workspace; keywords, description", () => {
  const text = `[package]
name = "app"
description = "A fast CLI"
keywords = ["cli", "terminal"]

[dependencies]
clap = { version = "4", features = ["derive"] }
serde.workspace = true
anyhow = "1"

[dev-dependencies]
insta = "1"

[build-dependencies.cc]
version = "1"

[target.'cfg(windows)'.dependencies]
winapi = "0.3"

[workspace.dependencies]
tokio = "1"
`;
  assert.deepEqual(parseCargoToml(text), {
    dependencies: ["clap", "serde", "anyhow", "insta", "cc", "winapi", "tokio"],
    keywords: ["cli", "terminal"],
    description: "A fast CLI",
  });
});

test("the README's first heading and paragraph; badges, HTML and code are skipped, link text is kept", () => {
  const text = `<p align="center"><img src="logo.png"></p>

# Invoice renderer

[![CI](https://x/badge.svg)](https://x) ![npm](https://y.svg)

Turns **orders** into [PDF invoices](https://example.com) with \`pdfkit\`
and mails them.

## Install
npm install
`;
  assert.equal(readmeIntro(text), "Invoice renderer\nTurns orders into PDF invoices with pdfkit and mails them.");
  assert.equal(readmeIntro("Just a line of text.\n\nMore."), "Just a line of text.");
  assert.equal(readmeIntro(""), "");
});

function folder(files: Record<string, string | null>) {
  const root = scratchBase("manifests");
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    if (content === null) mkdirSync(full, { recursive: true });
    else {
      mkdirSync(parse(full).dir, { recursive: true });
      writeFileSync(full, content);
    }
  }
  return root;
}

test("readProject: the nearest folder with a manifest, as note finds it; its README; each dependency typed by its manifest", () => {
  const root = folder({
    "package.json": JSON.stringify({ dependencies: { express: "*" } }),
    "README.md": "# Monorepo\n\nThe whole thing.\n",
    "packages/web/package.json": JSON.stringify({ description: "The web app", dependencies: { react: "*" } }),
    "packages/web/pyproject.toml": "[project]\ndependencies = [\"requests\"]\n",
    "packages/web/readme.md": "# Web\n\nThe front end.\n",
    "packages/web/src/": null,
  });
  const project = readProject(join(root, "packages", "web", "src"), join(root, "home"));
  assert.equal(project.folder, join(root, "packages", "web"));
  assert.deepEqual(project.manifests, ["package.json", "pyproject.toml"]);
  assert.deepEqual(project.dependencies, [{ type: "npm", name: "react" }, { type: "pypi", name: "requests" }]);
  assert.deepEqual(project.texts, ["The web app", "Web\nThe front end."]);
});

test("readProject without a manifest: the README of the project root, no dependencies", () => {
  const root = folder({ "README": "# Notes\n\nA plain folder.\n", "docs/": null });
  const project = readProject(join(root, "docs"), join(root, "home"));
  assert.equal(project.folder, root);
  assert.deepEqual(project.manifests, []);
  assert.deepEqual(project.dependencies, []);
  assert.deepEqual(project.keywords, []);
  assert.deepEqual(project.texts, ["Notes\nA plain folder."]);
});

test("readProject: keywords from the manifests, each dependency once", () => {
  const root = folder({
    "package.json": JSON.stringify({ keywords: ["pdf"], dependencies: { pdfkit: "*" }, devDependencies: { pdfkit: "*" } }),
  });
  const project = readProject(root, join(root, "home"));
  assert.deepEqual(project.dependencies, [{ type: "npm", name: "pdfkit" }]);
  assert.deepEqual(project.keywords, ["pdf"]);
});
