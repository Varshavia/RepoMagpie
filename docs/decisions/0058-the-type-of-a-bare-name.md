# 0058 — The type of a bare name

**Status:** accepted (2026-11-04, from the maintainer's brief for `feat/project-journal`). Adds to the bare-name rule in [spec](../spec.md) §4: the type given and the project's manifests come first, as before.

## Context
A bare name such as `moment` can be a package of more than one type (npm, PyPI, crates.io). Before this record, each surface settled it on its own:

- **The CLI** took `--type`, then the nearest manifests. Outside a project, or with manifests of several types, it failed with `Add --type npm|pypi|cargo`, even in a terminal where it could ask.
- **The MCP server** returned the CLI's message, so an agent read about a flag it can't pass. In the owner's test on 0.2.0-beta.19, the agent's "note it for the team" ended there, and no note was written.
- **The app** showed the CLI's message too, `Add --type`, under a form that has its own type field.

A name the user already noted is a strong hint: they mean that package again.

## Decision
1. **The order, on every surface:**
   1. the type given (`--type`, the MCP `type` field, the app's type field);
   2. the project's manifests, when they name exactly one type;
   3. the type of an existing note on that name, in either journal, when there is exactly one such type. Matching is by the note's id and its `packages`, as recall matches, never by a title. Step 3 applies only when the manifests give no candidate at all. Manifests of two types stay ambiguous, so a project's own files are never overruled by an old note.
2. **When it's still ambiguous:**
   - **The CLI, in a terminal,** asks: `Which package type is moment? npm, pypi, cargo [npm]: `. Enter takes npm. Only the first line of an answer counts, so a pasted block can't answer twice. After three answers that aren't a type, it fails: `No package type chosen for moment. Add --type npm|pypi|cargo.`
   - **The CLI without a terminal** fails as before: `… Add --type npm|pypi|cargo.`
   - **The MCP server** names its own field: `… Pass type (npm, pypi, cargo), or a PURL such as pkg:npm/moment.`
   - **The app** names its own control: `… Choose its type above.` No message in `ui/` mentions a CLI flag (a test checks this).
3. **The app preselects npm** in Add's type field when the project has no manifests: npm is the common case, and an empty field only produced an error. With manifests, the field starts empty, and step 2 applies.
4. **`import`** applies step 3 to each bare name too.

## Consequences
- An agent's request "note moment for the team" with no manifest now writes a note, as the type defaults to npm in a terminal and the MCP message tells the agent which field to fill.
- In the app, the npm preselect counts as "the type given" (step 1), so step 3 doesn't apply there when the project has no manifests: a user whose only note on `requests` is a PyPI one must choose PyPI. The preselect is visible, so the user sees the type before saving. To review if users trip on it.
- A note's existence changes how a later bare name resolves. Deleting the only note on a name removes the hint.

## Alternatives considered
- **Always ask, even with one manifest type.** More questions for the common case, and the manifests are the best evidence.
- **Let an existing note win over the manifests.** An old note shouldn't overrule a project's own files.
- **No default in the prompt.** Every bare name outside a project would need a typed answer. npm is the most common type in the journals measured so far.
