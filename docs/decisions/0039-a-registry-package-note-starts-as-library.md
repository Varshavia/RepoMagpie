# 0039 — A note on a registry package starts as `library`

**Status:** accepted (2026-10-24, from the maintainer's macOS test brief). Adds to [0030](0030-github-topics-become-tags.md)'s kind guess, which stays as written; changes no other record.

## Context
In the macOS test (2026-10-24), `repomagpie note moment --type npm "…"` made a note of kind `other`.

0030's kind table is about GitHub repositories: it reads topics, the template flag, the file list and the root manifests, and its rule 9 says `library` when "it publishes a registry package". For registry packages 0030 says only "Registry packages (npm, PyPI, Cargo) have no topics: nothing changes for them", about tags. Note-schema says the tool drafts `kind` at creation and lists the values; neither says which kind a note made from a registry name starts with. So `other` came from the code's fallback, not from a decision.

An editorial addition to 0030 was not enough: 0030 decides nothing for a note without GitHub data, and adding a rule changes what the tool does.

## Decision
- A note created from a registry package name (`pkg:npm`, `pkg:pypi`, `pkg:cargo`) without GitHub data starts as `library`. Such a name is a published package, which is rule 9's signal.
- A GitHub repository whose metadata couldn't be fetched still starts as `other`: nothing is known about it.
- It applies wherever a note is created: `repomagpie note`, `repomagpie import`, the app's Add and the MCP `note` tool.
- The kind stays a draft at creation only. An existing note never changes.

## Consequences
- A CLI or a framework published on npm starts as `library` too; the user corrects the kind, as for 0030's debatable guesses.
- The graph groups these notes as `tool` instead of `other`.
