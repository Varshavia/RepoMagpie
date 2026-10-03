# 0017 — Package identity with Package URL (PURL)

**Status:** accepted (2026-10-03)

## Context
Recall must map an install command (`npm install pdfkit`) to a note, and notes need a stable identity. The planned `packages` field used an invented `ecosystem:name` format.

## Decision
- Use **Package URL (PURL)** for identities:
  - packages: `pkg:npm/pdfkit`, `pkg:pypi/requests`, `pkg:cargo/serde`;
  - repositories: `pkg:github/<owner>/<repo>`.
  - Example field: `packages: ["pkg:npm/pdfkit", "pkg:pypi/requests"]`.
- **Bare names** (`magpie note pdfkit "..."`) take their type from the nearest manifest: `package.json` → npm, `pyproject.toml` → pypi, `Cargo.toml` → cargo. If that is ambiguous, `magpie` asks when it runs in a terminal, and fails with a clear message under `--json` or when it isn't interactive.
- **Recall matching:** an exact type and name match first, ignoring versions; then a name-only match across types, marked as lower confidence in the output.
- Library: `packageurl-js`, the reference implementation, approved by the maintainer on 2026-10-03 under the dependency policy.

Facts this rests on (checked 2026-10-03):
- PURL is standardised as [ECMA-427, 1st edition](https://www.ecma-international.org/publications-and-standards/standards/ecma-427/), approved by the Ecma General Assembly on 10 December 2025. It "is in process to also become an ISO standard" ([purl-spec README](https://github.com/package-url/purl-spec#readme)).
- [CVE Record Format 5.2.0](https://github.com/CVEProject/cve-schema/releases/tag/v5.2.0) (2025-10-29) adds an optional `packageURL` field for affected products.
- The PURL type registry defines `github`, `npm`, `pypi` and `cargo` ([purl-spec types](https://github.com/package-url/purl-spec/tree/main/types)).
- [`packageurl-js`](https://github.com/package-url/packageurl-js) 2.0.1: MIT, no runtime dependencies, about 57 kB unpacked, active (last push 2026-08-24).

## Consequences
- The planned `packages` field uses PURLs instead of `ecosystem:name`.
- File names derive from the PURL (for example `npm--pdfkit.md`); the exact rule is in the [note schema](../note-schema.md).
