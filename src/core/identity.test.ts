import { test } from "node:test";
import assert from "node:assert/strict";
import { fileNameClash, fileNameFor, normalizePackage, readablePurl, resolveTarget, type Manifest, type PackageType } from "./identity.ts";

// Spec section 4: every input row, with the examples from the spec and the note schema.
const RESOLVES: [string, { manifests?: Manifest[]; type?: PackageType }, string, string?][] = [
  // GitHub repository (lowercase)
  ["https://github.com/microsoft/playwright-cli", {}, "pkg:github/microsoft/playwright-cli"],
  ["https://github.com/Microsoft/Playwright-CLI", {}, "pkg:github/microsoft/playwright-cli"],
  ["https://github.com/microsoft/playwright-cli/", {}, "pkg:github/microsoft/playwright-cli"],
  ["https://github.com/microsoft/playwright-cli.git", {}, "pkg:github/microsoft/playwright-cli"],
  ["https://www.github.com/microsoft/playwright-cli", {}, "pkg:github/microsoft/playwright-cli"],
  // Skill URL: the parent repository, plus the skill's folder (decision 0006)
  ["https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines", {}, "pkg:github/vercel-labs/agent-skills", "skills/web-design-guidelines"],
  ["https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines/SKILL.md", {}, "pkg:github/vercel-labs/agent-skills", "skills/web-design-guidelines"],
  ["https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md", {}, "pkg:github/vercel-labs/agent-skills", "skills/web-design-guidelines"],
  // npm (scope encoded as %40)
  ["https://www.npmjs.com/package/pdfkit", {}, "pkg:npm/pdfkit"],
  ["https://www.npmjs.com/package/pdfkit/v/0.15.0", {}, "pkg:npm/pdfkit"],
  ["https://www.npmjs.com/package/@playwright/cli", {}, "pkg:npm/%40playwright/cli"],
  // PyPI (lowercase, "_" → "-")
  ["https://pypi.org/project/requests", {}, "pkg:pypi/requests"],
  ["https://pypi.org/project/requests/2.32.3/", {}, "pkg:pypi/requests"],
  ["https://pypi.org/project/Foo_Bar/", {}, "pkg:pypi/foo-bar"],
  // crates.io
  ["https://crates.io/crates/serde", {}, "pkg:cargo/serde"],
  ["https://crates.io/crates/serde/1.0.210", {}, "pkg:cargo/serde"],
  // A PURL: itself, without its version
  ["pkg:npm/pdfkit", {}, "pkg:npm/pdfkit"],
  ["pkg:npm/pdfkit@0.15.0", {}, "pkg:npm/pdfkit"],
  ["pkg:npm/%40playwright/cli@1.2.0", {}, "pkg:npm/%40playwright/cli"],
  ["pkg:pypi/requests", {}, "pkg:pypi/requests"],
  ["pkg:github/microsoft/playwright-cli", {}, "pkg:github/microsoft/playwright-cli"],
  // A bare name, typed by the nearest manifest or by --type
  ["pdfkit", { manifests: ["package.json"] }, "pkg:npm/pdfkit"],
  ["requests", { manifests: ["pyproject.toml"] }, "pkg:pypi/requests"],
  ["serde", { manifests: ["Cargo.toml"] }, "pkg:cargo/serde"],
  ["pdfkit", { manifests: ["package.json", "pyproject.toml"], type: "npm" }, "pkg:npm/pdfkit"],
  ["pdfkit", { type: "npm" }, "pkg:npm/pdfkit"],
  ["pdfkit@1.2.0", { manifests: ["package.json"] }, "pkg:npm/pdfkit"],
  ["@scope/name@^3", { manifests: ["package.json"] }, "pkg:npm/%40scope/name"],
  ["requests[socks]>=2", { manifests: ["pyproject.toml"] }, "pkg:pypi/requests"],
];

for (const [input, options, purl, skillPath] of RESOLVES) {
  test(`resolves ${input} ${JSON.stringify(options)} → ${purl}`, () => {
    const r = resolveTarget(input, options);
    assert.deepEqual(r, skillPath ? { kind: "ok", purl, skillPath } : { kind: "ok", purl });
  });
}

test("a bare name with more than one manifest type is ambiguous", () => {
  assert.deepEqual(resolveTarget("pdfkit", { manifests: ["package.json", "pyproject.toml"] }), { kind: "ambiguous", candidates: ["npm", "pypi"] });
});

test("a bare name with no manifest is ambiguous", () => {
  assert.deepEqual(resolveTarget("pdfkit", { manifests: [] }), { kind: "ambiguous", candidates: [] });
});

// Spec section 4: any other input is rejected.
const REJECTED = [
  "https://example.com/an-article",
  "https://gist.github.com/someone/abc123",
  "https://github.com/microsoft",
  "https://github.com/microsoft/playwright-cli/issues/3",
  "pkg:maven/org.apache/commons",
  "notes/loose-file.md",
  "",
  // Paths and encoded paths are never package names: no v0.1 registry allows \, : or %, or a
  // leading dot.
  "..\\secret.md",
  "C:\\Windows\\win.ini",
  "C:secret.md",
  "%2e%2e%2fsecret.md",
  "..",
  ".hidden",
];

for (const input of REJECTED) {
  test(`rejects ${JSON.stringify(input)}`, () => {
    assert.equal(resolveTarget(input, { manifests: ["package.json"] }).kind, "rejected");
  });
}

// Spec section 5: drop the version and extras.
const NORMALIZES: [string, PackageType, string][] = [
  ["pdfkit@1.2.0", "npm", "pdfkit"],
  ["@scope/name@^3", "npm", "@scope/name"],
  ["@scope/name", "npm", "@scope/name"],
  ["pdfkit", "npm", "pdfkit"],
  ["requests[socks]>=2", "pypi", "requests"],
  ["requests==2.32.3", "pypi", "requests"],
  ["requests~=2.0", "pypi", "requests"],
  ["requests", "pypi", "requests"],
  ["serde@1.0", "cargo", "serde"],
  ["serde", "cargo", "serde"],
];

for (const [spec, type, name] of NORMALIZES) {
  test(`normalizes ${spec} (${type}) → ${name}`, () => {
    assert.equal(normalizePackage(spec, type), name);
  });
}

// Note schema: file names derive from the PURL.
const FILE_NAMES: [string, string][] = [
  ["pkg:github/microsoft/playwright-cli", "github--microsoft--playwright-cli.md"],
  ["pkg:npm/pdfkit", "npm--pdfkit.md"],
  ["pkg:npm/%40playwright/cli", "npm--playwright--cli.md"],
  ["pkg:pypi/requests", "pypi--requests.md"],
  ["pkg:cargo/serde", "cargo--serde.md"],
  ["pkg:npm/JSONStream", "npm--jsonstream.md"],
];

for (const [purl, file] of FILE_NAMES) {
  test(`file name for ${purl} is ${file}`, () => {
    assert.equal(fileNameFor(purl), file);
  });
}

// Names that differ only in case map to the same file; v0.1 rejects the second one.
test("a case-only clash with the note already at that file is an error naming both", () => {
  const error = fileNameClash("pkg:npm/jsonstream", "pkg:npm/JSONStream");
  assert.ok(error);
  assert.match(error, /pkg:npm\/jsonstream/);
  assert.match(error, /pkg:npm\/JSONStream/);
  assert.match(error, /npm--jsonstream\.md/);
});

test("no clash when the file holds the same subject or nothing", () => {
  assert.equal(fileNameClash("pkg:npm/JSONStream", "pkg:npm/JSONStream"), null);
  assert.equal(fileNameClash("pkg:npm/JSONStream", undefined), null);
});

// For people only: the id stays encoded where it is stored, copied or sent.
test("readablePurl decodes a PURL for display; anything it can't decode is shown as it is", () => {
  assert.equal(readablePurl("pkg:npm/%40playwright/cli"), "pkg:npm/@playwright/cli");
  assert.equal(readablePurl("pkg:npm/pdfkit"), "pkg:npm/pdfkit");
  assert.equal(readablePurl("pkg:github/microsoft/playwright-cli"), "pkg:github/microsoft/playwright-cli");
  assert.equal(readablePurl("pkg:npm/%E0%A4%A"), "pkg:npm/%E0%A4%A");
});
