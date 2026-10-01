# 0003 — Personal vault lives outside the repo

**Status:** accepted (2026-10-01)

## Context
The project is open source; the maintainer's own notes are personal.

## Decision
- The tool points to a vault directory configured by the user (mechanism decided in step 2).
- This repository contains only `examples/vault/` with sample notes.
- `vault/` is in `.gitignore` as a safety net.

## Consequences
- Other users can use the tool with their own vaults from day one.
- The example vault doubles as test fixtures and as a public demo.
