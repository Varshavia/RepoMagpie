# 0030 — GitHub topics become tags

**Status:** accepted (2026-10-09). Changes note-schema rules 2 and 5. Builds on [0018](0018-ai-drafts-humans-decide.md) (the tool drafts at creation, the user decides); changes no other record.

## Context
On the first day of real use, ten GitHub repositories (coolify, OpenHands, maxun, open-webui, browser-use, langflow, supabase, Stirling-PDF, crawl4ai and dify) produced 4 tags in total, and the graph showed 20 notes with 6 connections. Every one of the ten has many GitHub topics.

Two causes:
- **Tags.** A topic became a tag at creation only if `tags.md` already listed it. Every other topic was a "From GitHub topics" chip the user had to click, note by note. With hundreds of repositories that never happens, and the graph, suggest and the sidebar all depend on tags.
- **Kinds.** The kind guess knew four outcomes (`cli`, `skill-pack`, `plugin`, `awesome-list`), so 9 of 20 notes were `other`. Any repository with a `SKILL.md` was a skill pack. Most apps now keep agent skills for their own development in `.agents/skills/`, `.claude/skills/` or `.cursor/skills/`: coolify has 31 such folders, supabase 23, langflow 11.

The kind says what a thing is (an app, a platform, a library). Tags say what it is about (`llm`, `web-scraping`, `pdf`). dify's kind is `platform`; its tags include `llm` and `workflow`.

## Decision

### Topics become tags at creation
- When `magpie note`, `magpie import` or Add in the local app creates a note for a GitHub repository, its topics become its tags:
  - only topics that are valid tags (lowercase kebab-case, which almost every topic is);
  - not the repository's own name, ignoring case (`supabase` on supabase/supabase);
  - not a topic on the stop list;
  - ranked, then cut at 8.
- **The ranking** prefers tags that connect notes:
  1. topics already in `tags.md`;
  2. then topics that another note in the same journal also carries, in its `topics` or its `tags`;
  3. then the rest.

  Within each group, GitHub's order, which is alphabetical (the API returns topics sorted by name). The ranking reads the journal as it is at the save, so in `magpie import` the notes saved earlier in the same run count.
- **The stop list:** `hacktoberfest`, `hacktoberfest` followed by a year (`hacktoberfest2023`), `open-source`, `opensource` and `good-first-issue`. These say how a repository is run, not what it is about. They fit most repositories, so as tags they would join unrelated notes in the graph.
- One rule, in one place in core, used by all three ways of creating a note and by the "From GitHub topics" chips. The chips offer the topics that pass the rule but aren't tags yet, in the same ranking, at most 8, so the topics past the first 8 stay a click away.
- **The tag list** changes in the same save. Each new tag not yet in `tags.md` is appended to the end as ``- `<tag>` ``, with the file's own line endings; nothing else in the file changes (the same append as "From GitHub topics"). A journal without `tags.md` gets one holding a `# Tags` heading and just those tags. A journal that this save creates still gets the starter list first ([spec](../spec.md), section 3), then the new tags. `magpie import` of several repositories appends each tag once.
- Add's preview shows the tags the save will write; the user can remove one before saving. A removed tag is neither written nor appended.
- Registry packages (npm, PyPI, Cargo) have no topics: nothing changes for them.

### Tags stay human-owned
- After creation the tool never changes `tags` on its own. The user removes the tags they don't want.
- **Existing notes** get a one-time action that the user runs on purpose: "Add GitHub topics as tags" (`magpie tags --from-topics` and a button in the local app). For each note in one journal, it adds the topics that pass the rule above and aren't tags yet, in the same ranking, after the existing tags, until the note has 8 tags. The ranking reads the journal as it was before the run (`tags.md`, and every other note's `topics` and `tags`), so the result doesn't depend on the order the notes are visited. A note that already has 8 or more gets none. It never removes or reorders a tag, and appends the new tags to `tags.md` like creation does. It shows what it will do before it writes. A second run adds nothing. A note whose frontmatter can't be read is skipped and reported, never written.
- Because the user asks for it, the action is a human edit, like an edit in the app (schema rule 2).

### A better kind guess
The kind is still a draft at creation only. Existing notes are not guessed again.

The guess takes the first kind whose signals match, in this order:

| # | Kind | Signals | Why here |
|---|---|---|---|
| 1 | `awesome-list` | the topic `awesome-list` | A list carries the topics of what it lists (a list of self-hosted apps has `self-hosted`); it is still a list. |
| 2 | `template` | the topic `template`, `starter` or `boilerplate`, or GitHub's template flag | A starter carries its stack's topics (`nextjs`, `docker`); it is still a starting point. |
| 3 | `skill-pack` | the repository's name contains `skill` | The owner named it for its skills (mattpocock/skills, vercel-labs/agent-skills, Leonxlnx/taste-skill). |
| 4 | `platform` | a topic such as `paas`, `baas`, `backend-as-a-service`, `low-code`, `lowcode`, `no-code`, `nocode`, `platform` or `llmops` | More specific than the app signals: platforms are usually self-hosted and shipped in Docker too. |
| 5 | `app` | a topic such as `self-hosted`, `webapp`, `web-app`, `desktop-app`, `docker` or `nextjs-app` | Before the topic `skills` and before a command: apps that run skills tag themselves `skills` (dify), and apps often ship a launcher. |
| 6 | `skill-pack` | the topic `agent-skills`, `claude-skills` or `skills` | After app and platform, for the reason above. |
| 7 | `framework` | the topic `framework` | A framework often ships a command and a package; the topic says more than either. |
| 8 | `cli` | the root `package.json` has `bin` (unchanged) | A command is what a user runs; a package alone says less. |
| 9 | `library` | it publishes a registry package (`packages` isn't empty) | Rules 4 and 5 come first, so it never applies to an app or a platform. Before rule 10: a library may ship skills for its users (browser-use has 7). |
| 10 | `skill-pack` | 3 or more `SKILL.md` folders, not counting folders inside a hidden folder (a path part that starts with `.`) | Skills in `.agents/`, `.claude/` or `.cursor/` help develop the repository itself; they aren't what it offers. Only when nothing above matched. |
| 11 | `plugin` | the root has `.claude-plugin/plugin.json` or `marketplace.json` (unchanged) | After rule 10: a skill pack often ships a plugin manifest too. |
| 12 | `other` | nothing above | |

A single `SKILL.md` inside an app no longer makes it a skill pack.

## Consequences
- Note-schema rules 2 and 5 change: tags are drafted from topics at creation, `tags.md` grows without a click, and "Add GitHub topics as tags" is a human edit. The glossary's `tag` and `topic` follow.
- A new command, `magpie tags --from-topics [--journal personal|project] [--dry-run] [--json]`, and a new write, `POST /api/tags/from-topics`, with the same security rules as the other writes ([decision 0023](0023-api-is-the-json-contract.md): the API answers with the command's JSON). The spec describes both.
- Journals get many more tags. The sidebar shows the 15 tags with the most notes and a "Show all N tags" toggle.
- Similar topics become separate tags: `llm` and `llms`, `no-code` and `nocode`, `web-scraping` and `webscraping`. Synonyms are out of scope; the user removes the spelling they don't want.
- Within a ranking group, GitHub's order is alphabetical, so the 8 are not always the most telling. In a journal where nothing else carries its topics, coolify gets `databases` to `mysql`, and `self-hosted` is a chip. The more notes a journal has, the more the shared topics win.
- The kind guess reads GitHub's template flag (`is_template`), which the repository response already has: no new request. The skill folders for "Notable skills" are unchanged; only the count for rule 10 skips hidden folders.
- On the ten repositories, the guesses are `app` for coolify, open-webui and Stirling-PDF; `platform` for dify and maxun; `library` for browser-use, langflow and crawl4ai; `cli` for OpenHands; and `other` for supabase. None of them is a skill pack, and mattpocock/skills, vercel-labs/agent-skills and Leonxlnx/taste-skill stay skill packs. Some guesses stay debatable, and they are accepted as they are rather than fixed with more signals: a platform without a platform topic is an `app` (coolify) or `other` (supabase), and an app without an app topic is a `cli` when its root `package.json` has `bin` (OpenHands), or a `library` when it publishes a package (langflow). The user corrects the kind.
