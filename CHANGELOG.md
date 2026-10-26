# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). See the [release process](docs/release.md).

## [Unreleased]

## [0.2.0-beta.12] - 2026-10-26

The thirteenth pre-release: domains. Say what a package is for (security, database, testing, …) and your agent finds it by the concern you ask about, in any language. Also: tag spellings and `repomagpie tags --merge`; graph labels that never overlap, and colour by domain; `repomagpie init --auto`, which lists a project's dependencies by what your notes say; the opt-in Stop reminder (`repomagpie setup --capture-reminder`); and the project journal made visible. Run `repomagpie setup` after the upgrade so your agents get the new skill, and `repomagpie domains --suggest` once to suggest domains for the notes you have.

### Added

- Domains: the concern a package addresses, from a fixed list of 12 (security, database, testing, auth, …), so a question such as "how should database security work?" finds your notes on supabase or prisma without sharing a word with them. A new note gets suggested domains from its GitHub topics and tags; you confirm them: `repomagpie note prisma --domain database`, or a click in `repomagpie ui`. `repomagpie domains --suggest` suggests them for the notes you already have, after showing the plan. `repomagpie doctor` names a domain it doesn't know.
- Search by domain and tag: `repomagpie search "row level security" --domain security --domain database --tag postgres`. Each result says why it matched (`why` in `--json`). The same in your agent, which maps your question onto domains in whatever language you ask (MCP `search`: `domains`, `tags`, `match`, `max_chars`), and in the app's search, whose results say "Matched: domain security · tag postgresql".
- Tag spellings: `tags.md` can list other spellings of a tag, `` - `postgresql` (postgres, psql) ``, and common ones ship built in (`next.js`, `k8s`, `tailwindcss`, …). A topic, a `--tag` or a search word in another spelling finds the tag. `repomagpie tags --merge postgres postgresql` rewrites a tag in every note and adds the spelling to `tags.md`.
- A new read-only MCP tool, `vocabulary`: the 12 domains with their definitions, and the tags your journals use with their counts and spellings. Run `repomagpie setup` after the upgrade so your agents get the new skill.
- In `repomagpie ui`: a Domains section in the sidebar with counts; domain chips on a note, suggested ones outlined with a button to confirm; domain picks in the inbox review, saved with Ctrl/Cmd+Enter; a domain filter in Search.
- `repomagpie init --auto`: a project's dependencies in three groups, avoid notes first, then those you have a note on (with the Verdict's first words), then those without one. In a terminal it then asks for your Verdict on each one without a note: Enter skips, `q` stops, and it never writes a Verdict for you. `--json`, or no terminal, only lists. Your agent may run it when you start in a project and sum it up: "this project uses 40 packages; you have notes on 3, one says avoid". Plain `repomagpie init` now says what `--auto` does.
- An opt-in reminder for Claude Code: `repomagpie setup --capture-reminder`. When a session installed or removed a package you have no note on, and the agent didn't offer to save it, Claude Code reminds the agent once in that session to make the offer. It isn't on by default; `repomagpie setup --remove` takes it out, and `repomagpie doctor` says whether it's on.
- Sharing notes with your team is easier to find. The README has a "Share notes with your team" section. In `repomagpie ui`, the Project switch in a repository without `.magpie/` says what a project journal is and how to start one, and a project note says it's shared with the repository's contributors. In a git repository without one, `repomagpie doctor` adds under Journals: `none here; repomagpie note <x> --to project starts one, shared through git` (`git_repository` in `--json`).
- "Colour by domain" in the graph's Draw options: each note takes its domain's colour, dimmer when the domain is only suggested, grey with none. The legend lists the domains drawn, and the neighbours list and the search box name each note's domain.
- "Tags on one note" in the graph's Draw options, off by default. Most tags from GitHub topics are on one note and connect nothing, so they're now left out until you turn it on. The status line says how many: "Showing 39 notes, 22 tags (45 on one note hidden) and 98 connections". A tag you pick in the filter, or find with the search box, is always drawn.

### Fixed

- Graph labels no longer sit on top of each other. At any size and zoom, a label that would overlap another waits until you zoom in. The hovered and selected nodes and the selected node's neighbours come first. Tag labels are smaller and quieter than note names.

### Changed

- The graph opens faster the first time: it fetches its data while its code loads. On 2,000 notes the cold first open went from about 2.2 s to about 2.1 s, labels included. The graph cache rebuilds once after the upgrade.
- `repomagpie search --tag` now raises the notes with that tag instead of keeping only them. `--match filter` keeps only notes with at least one of the tags or domains given; before, several `--tag` flags kept only notes with every one. The search cache rebuilds once after the upgrade.

## [0.2.0-beta.11] - 2026-10-25

The twelfth pre-release: say when you'd use a package, or avoid it, when you write the note (`repomagpie note --use-when` / `--avoid-when`, the app's review and Add, the MCP `note` tool), so notes are found later by what you need. Nested and unclosed HTML comments in a note no longer leak into search, recall or the Verdict. Run `repomagpie setup` after the upgrade so your agents get the new skill.

### Added

- Say when you'd use or avoid a package, in your words, when you save it: `repomagpie note zod "default for validating input" --use-when "checking API input" --avoid-when "a tiny script"`. Each flag adds one item and can be repeated. Your items are kept as you wrote them and new ones go after them; an item already there isn't added twice; items replace a draft "Use when" written from GitHub's description. An "Avoid when" item makes RepoMagpie ask before the package is installed, and the command says so. Notes are then found by what you need, not only by name.
- The same in your agent, which may ask when you'd use or avoid it in the same question as your reason, and never fills these in for you (MCP `note` tool: `use_when` and `avoid_when`). Run `repomagpie setup` after the upgrade so your agents get the new skill.
- The same in `repomagpie ui`: "Use when" and "Avoid when" fields under the Verdict in the inbox review and on the Add page. Enter adds an item; Ctrl/Cmd+Enter saves everything at once.

### Fixed

- Text inside an HTML comment no longer reaches search, recall or a note's Verdict when the comment is nested (`<!-<!---->- … -->`) or never closes: an unclosed `<!--` now hides the rest of its line. The caches rebuild once after the upgrade.

## [0.2.0-beta.10] - 2026-10-24

The eleventh pre-release: your agent offers once, at the end of a task, to save a dependency decision made in it, with your reason as the Verdict. Run `repomagpie setup` after the upgrade so your agents get the new skill; the offer works as well as your agent follows it.

### Changed

- Your agent offers once, at the end of a task, to save a dependency decision made in it (zod over valibot, moment replaced by date-fns, lodash dropped), with your reason, in your words, as the Verdict and the package you chose as its alternative. It never writes the Verdict for you, never asks mid-task, and never asks again after a no. A yes without a reason saves the note to the inbox. "avoid" goes in only when you say it, or say yes to "Should RepoMagpie ask before installing it again?". The agent skill does this; there is no new model or hook.

### Fixed

- `repomagpie doctor`'s to-do for a hook or MCP entry left in an agent found only by its folder (such as `~/.codex`, written by an earlier beta) now names both ways out: "If you use Codex CLI: run repomagpie setup --agents codex, then trust the hook in /hooks. If you don't: run repomagpie setup --remove --agents codex." Where `setup` can't edit the file, it says to edit it by hand. A to-do for an agent that isn't installed names the file to edit.

## [0.2.0-beta.9] - 2026-10-24

The tenth pre-release, with the fixes from a macOS test: `repomagpie setup` now chooses only the agents it finds by their command or app, and `repomagpie setup --delete-backups` deletes the backups `setup` made. If you ran `setup` with an earlier beta, run `repomagpie setup --delete-backups` once: copies of `~/.claude.json` can hold sign-in tokens.

### Added

- `repomagpie setup --delete-backups` deletes `setup`'s backups. It lists them with their dates, asks "Delete these 3 backups? (y/N)", and prints each one it deleted; without a terminal it needs `--yes`. `--keep-latest` keeps the newest backup of each file. It deletes only the backups `repomagpie doctor` lists, never through a link. `setup`'s summary and `doctor` name the command.

### Changed

- `repomagpie setup` chooses only the agents it finds by their command, or on macOS by their app (`/Applications/Cursor.app`, `/Applications/Visual Studio Code.app`). An agent whose folder is all it finds, such as `~/.codex` left by an old install, is listed as `not chosen: found ~/.codex only (--agents codex sets it up)`; `--agents` still sets it up, and `--remove` still takes RepoMagpie's entries out of it. The multi-select says how it found each agent. `doctor` says `found ~/.codex only` for such an agent, with no to-do.
- `repomagpie setup` without `--allow-write` says once that the note tool stays off in new entries: "Note tool: off (repomagpie setup --allow-write turns it on)."
- A note on a registry package without GitHub data (`repomagpie note left-pad`) starts as kind `library` instead of `other`. Existing notes keep their kind.

### Fixed

- `repomagpie doctor`'s to-dos now name an action that works. Codex CLI without the `codex` command got "Run repomagpie setup", which can only print Codex's entry; now it says to paste the entry into `~/.codex/config.toml` by hand, and that `repomagpie setup --dry-run --agents codex` prints it. The same goes for files `setup` doesn't edit (with comments, or `.claude/settings.local.json`), the project's settings (`--project .`), skill copies in folders `setup` doesn't manage, and entries left in an agent that isn't installed.
- `repomagpie setup --remove` says "nothing to remove" instead of "already set up" where an agent has no RepoMagpie entry.
- The app now follows a change of the system's dark or light setting while it is open, when its theme is the system's, in Safari too. Settings says which one the system uses now.

## [0.2.0-beta.8] - 2026-10-23

The ninth pre-release, the build for the tester round: `repomagpie setup --remove` now works on Windows when your home folder's name has letters outside ASCII, and `repomagpie suggest` no longer matches notes on single letters such as the `t` of "doesn't".

### Fixed

- On Windows, when your home folder's name has letters outside ASCII (`C:\Users\Şuat`), `repomagpie setup --remove` now removes the skill folder, Copilot CLI's hook file and Antigravity CLI's launcher, instead of failing with "The skill's files aren't as expected after the change". Node's `fs.rmSync` caused it on Node 23, Node 24.0 to 24.13.0 and Node 25.0: it removed nothing on such paths and reported no error. RepoMagpie now removes files without it, and checks each one is gone.
- `repomagpie suggest` no longer takes single letters and word fragments as keywords. "it doesn't render, e.g. invoices" gave `doesn`, `t`, `e` and `g`, and a note could rank for matching `t, e, g`; now its keywords are `render` and `invoices`. Words under 3 letters, contractions (`doesn't`, `I'm`) and abbreviations (`e.g.`, `etc.`) are left out; a possessive keeps its word (`user's` → `user`). Six two-letter words that name a field stay keywords: `ai`, `ui`, `ux`, `db`, `ml` and `ci`.

## [0.2.0-beta.7] - 2026-10-23

The eighth pre-release: you can delete a note. `repomagpie delete` and the app's Delete note move a note to its journal's trash, `.trash/`, after your OK, and the app offers Undo; nothing is removed for good, and no agent tool deletes.

### Added

- `repomagpie delete <name>` moves a note to its journal's trash, `.trash/`, as `npm--pdfkit.20261023-093900Z.md`. In a terminal it shows the note, the notes that link to it and where it goes, then asks "Move it to the trash? [y/N]"; without a terminal it needs `--yes`. `--journal` picks the journal when both have the note, and `--json` prints what moved. Nothing reads `.trash/` as notes, and nothing empties it: delete a file there to remove it for good. A project journal's `.gitignore` gets `.trash/`, also one written by an earlier version.
- "Delete note" in the app's note view. A dialog says where the note goes and lists the notes that link to it; after the move, the next note opens and a toast offers Undo for 10 seconds. A note that changed on disk since you opened it isn't moved.
- The agent skill says never to run `repomagpie delete` unless you asked to delete that note, by name. The MCP server has no tool that deletes, and hooks never delete.

## [0.2.0-beta.6] - 2026-10-21

The seventh pre-release, with the fixes testers hit first: `repomagpie setup` now works on Windows when your home folder's name has letters outside ASCII, and `repomagpie doctor` no longer crashes on a Claude Code settings file without hooks; the app's Check a package page also says what the hook does in each agent.

### Changed

- The app's Check a package page says what the hook does in each agent, not only in Claude Code: on an avoid note it asks you first in Claude Code, Gemini CLI and Antigravity CLI, and stops the first try in Codex CLI, Cursor and Copilot CLI, where your agent asks you.

### Fixed

- On Windows, when your home folder's name has letters outside ASCII (`C:\Users\Şuat`), `repomagpie setup` no longer crashes during the skill install, or leaves a folder with a mangled name (`Åuat`) beside your home folder with the skill missing. Node's `fs.cpSync` caused it on Node 22 and older Node 24 releases; `setup` now copies the skill without it.
- `repomagpie doctor` no longer crashes with "Cannot read properties of undefined (reading 'PreToolUse')" when a Claude Code settings file it reads has no hook list, for example `~/.claude/settings.local.json` when you run it in your home folder. Run there, it also lists `~/.claude/settings.json` once instead of twice.

## [0.2.0-beta.5] - 2026-10-21

The sixth pre-release: the hook now checks your notes before an install in Codex CLI, Gemini CLI, Antigravity CLI, Copilot CLI and Cursor too, asking you where the agent can and stopping the first try where it can't; `repomagpie setup` writes each hook and `repomagpie doctor` checks it, and both now know Antigravity CLI and Copilot CLI.

### Added

- `repomagpie hook codex`, the hook for Codex CLI. Codex can't ask you before a command, so when a note says to avoid a package, the hook stops the install's first try: your agent gets the note and is told to ask you, and you see `RepoMagpie: stopped installing pdfkit: you noted to avoid pdfkit. Your agent should ask you; the same install goes through for the next 10 minutes.` If you say to go ahead, the same install goes through, also as `npm.cmd install pdfkit` or `pnpm add pdfkit`, until 10 minutes after the stop, and you see `RepoMagpie: let this install of pdfkit through: it is the retry within 10 minutes of the stop, taken as your go-ahead.` To remember this, the hook keeps `.cache/hook-retry.json` in your journal: a hash and a time for each stopped install, no package names. Other notes only inform, and `--inform-only` never stops an install. `repomagpie setup` writes the entry in `~/.codex/hooks.json`; `repomagpie hook codex --help` shows it.
- `repomagpie hook gemini-cli`, the hook for Gemini CLI. When a note says to avoid a package, Gemini CLI asks you before the install, with the note in its prompt, even for a command you allowed before; other notes show you a line. `repomagpie setup` writes the entry in `~/.gemini/settings.json`; `repomagpie hook gemini-cli --help` shows it.
- `repomagpie hook antigravity`, the hook for Antigravity CLI. When a note says to avoid a package, Antigravity asks you before the install, with the note in its prompt, even after you chose to always allow the command. Other notes add nothing there, since Antigravity shows them to nobody. `repomagpie setup` writes the entry in `~/.gemini/config/hooks.json`; `repomagpie hook antigravity --help` shows it.
- `repomagpie hook copilot`, the hook for Copilot CLI. Copilot CLI 1.0.98 runs a command without asking when a hook asks, so when a note says to avoid a package, the hook stops the install's first try instead, as for Codex: you see the note in "Denied by preToolUse hook: …", your agent is told to ask you, and the same install goes through until 10 minutes after the stop. Other notes add nothing. Copilot CLI denies every tool call when a hook fails to start, so the hook always exits 0. `repomagpie setup` writes its own file, `~/.copilot/hooks/repomagpie.json`; `repomagpie hook copilot --help` shows it.
- `repomagpie hook cursor`, the hook for Cursor. Cursor's "ask" isn't reliable, and its default Run Mode runs installs without asking, so when a note says to avoid a package, the hook stops the install's first try, as for Codex: your agent gets the note and is told to ask you, you see a line, and the same install goes through until 10 minutes after the stop. Other notes add nothing. `repomagpie setup` writes the entry in `~/.cursor/hooks.json`; `repomagpie hook cursor --help` shows it.
- `repomagpie setup` writes the hook for Codex CLI, Cursor, Gemini CLI, Antigravity CLI and Copilot CLI too, beside each one's MCP entry, and `repomagpie doctor` reports each, under "Hooks in other agents". Each entry is RepoMagpie's own, with a 10-second timeout, added after your other hooks; it starts Node directly, and only when Node and RepoMagpie are still where `setup` found them, so after you move or reinstall either, the hook does nothing (Copilot CLI would otherwise deny every tool call) and `doctor` tells you to run `setup` again. An older entry of RepoMagpie's, such as `repomagpie hook codex --inform-only`, becomes the new one and keeps its flags. Where an agent's hooks are turned off (Codex's `[features] hooks = false`, Gemini CLI's `hooksConfig.enabled`), `setup` leaves them off and says so. Codex runs a new hook only once you trust it in `/hooks`: `setup` says so, and `doctor` says whether you have. On Windows each entry adds the start of Windows PowerShell, about 255 ms, to every shell command in Codex CLI, Copilot CLI, Gemini CLI and Cursor; the agents run hooks that way. On Windows, Antigravity CLI's entry runs `~/.gemini/config/repomagpie-hook.cmd`, a file `setup` writes beside `hooks.json` (and `--remove` deletes): Antigravity CLI can't pass a quoted path to `cmd`.
- `repomagpie setup` and `repomagpie doctor` know Antigravity CLI (found by its `agy` command or `~/.gemini/antigravity-cli/`) and Copilot CLI (by its `copilot` command or `~/.copilot/config.json`). Antigravity CLI gets its MCP entry in `~/.gemini/config/mcp_config.json`, and the skill as a link in `~/.gemini/skills/`, which it reads in every folder; Copilot CLI gets its MCP entry through `copilot mcp add` and reads the skill from `~/.agents/skills/`. Antigravity may still list a removed server until its cache, `~/.gemini/antigravity-cli/mcp/`, is cleared: `setup --remove` and `doctor` say so.

### Changed

- Cursor also runs the Claude Code hooks in `~/.claude/settings.json` (its "Include Third-Party Plugins, Skills, and Other Configs" setting, on by default). `repomagpie hook claude-code` now stays silent there, so Cursor gets one answer, from its own hook. Claude Code's answers are unchanged.
- The agent skill says what to do when a hook stops an install in Codex CLI, Cursor or Copilot CLI: show you the note and ask, and if you say to go ahead, install the same package again. It also says to run `repomagpie.cmd` when Windows PowerShell blocks `repomagpie` ("running scripts is disabled"), or to use the MCP tools.
- The hooks find installs in more of the ways agents write them on Windows: `powershell -EncodedCommand …` (decoded; one that can't be decoded gets a line saying its installs weren't checked), `call npm install …`, `start`, `wsl`, `npx` or `corepack` before the command, `iex '…'`, `Invoke-Expression "…"` and `Start-Process npm -ArgumentList …`.

### Fixed

- `repomagpie setup` no longer edits a JSON file that has a key written twice: the agent reads the last copy, and `setup` changed the first, which left Cursor's `mcp.json` with an entry nobody read. It prints the snippet to paste instead, as for a file with comments.
- `repomagpie setup` and `repomagpie doctor` read an empty or whitespace-only JSON file as an empty object, as Antigravity CLI creates its `mcp_config.json`: `setup` writes the entry there, after a backup, instead of calling the file "not valid JSON" and printing a snippet.
- `repomagpie setup` now adds the Claude Code hook to a `settings.json` that starts with a byte-order mark (Notepad writes one), and keeps the mark; it failed before.
- `repomagpie setup` no longer fails to set up Gemini CLI through `gemini mcp add`: it put the `--` before Node's path, so Gemini CLI found no command and exited with an error. When an agent's command fails, `setup` now shows the first lines of what it printed, where the error is, instead of the end of its help.
- On Windows, `repomagpie setup` waits a moment when another program, such as a virus scan, holds a file it is replacing, instead of failing.
- `repomagpie setup --help` names every agent `--agents` takes: `antigravity` and `copilot` were missing.

### Security

- The hooks ignore a folder in the agent's input that can't be a real one (over 4,096 characters): one of 60,000 parts kept the hook busy for minutes. On Windows they no longer look for a project journal in a folder on another machine (`\\server\share`) that the input names, unless the hook already runs there: looking would connect to that machine and send it your Windows sign-in hash, and in Antigravity CLI and Gemini CLI the model chooses that folder.
- On macOS and Linux, the hooks ignore a retry record that isn't yours or that others could write, and replace it.

## [0.2.0-beta.4] - 2026-10-15

The fifth pre-release: any coding agent with MCP can check your notes before an install and ask what you have, through `repomagpie mcp`; `repomagpie setup` wires that server, the agent skill and the Claude Code hook into your agents; `repomagpie doctor` shows what is wired; and `repomagpie catalog` lists your whole journal.

### Added

- `repomagpie mcp`, an MCP server for coding agents, started by the agent over stdio. Its tools `recall`, `search`, `suggest` and `catalog` answer exactly as the commands' `--json` does, so any agent with MCP can check a package before installing it, and ask what you have, without the skill or a shell. `--allow-write` adds a `note` tool that records your Verdict or an alternative, in your words; it is off by default. The server works with both MCP protocol revisions agents use today (2025-11-25 and 2026-07-28), never opens a network connection or a port, and generates no code at run time. It makes the package about 160 kB larger.
- `repomagpie setup` also installs the agent skill from the package, so its version always matches the CLI's: one folder in `~/.agents/skills/` that most agents read, and a link to it from Claude Code's skills folder, the same layout `npx skills add` makes. For Claude Code it adds the hook. In your own settings the hook now starts Node directly, without a shell: on Windows that is 86 ms per shell command instead of about 280 ms through Git Bash. `setup` changes an existing `magpie hook claude-code` or `repomagpie hook claude-code` entry to this form and keeps its flags. With `--project <dir>`, the skill and the hook (as `repomagpie hook claude-code`) go into that project, for your team to commit; MCP entries stay in your own settings, since they name your machine's paths. <!-- check:commands allow -->
- The npm package now includes the agent skill (`skills/repomagpie/`).
- `repomagpie setup` sets up the MCP server in Claude Code, Codex CLI, Cursor, Gemini CLI and VS Code (for GitHub Copilot, and named so). It finds the agents you have (Gemini CLI by its `settings.json` or its command, since Antigravity CLI also uses `~/.gemini`), lets you choose them, shows what it will change in which file, and asks before it changes anything. It uses each agent's own command where there is one, changes only RepoMagpie's entry in a file, backs the file up first (the backup's name ends in a UTC time, such as `20261015-010147Z`, and the summary says how many backups that file now has; `setup` never deletes one), and never turns on an agent's auto-approval. A file with comments gets a snippet to paste instead. Running it again changes nothing, and keeps the note tool on or off as you chose it; `--allow-write` and `--no-allow-write` turn it on or off, and in a terminal it asks, saying what it is now; `--remove` takes the entries out; `--dry-run` only shows the plan, whose first line is the entry with full paths, to copy when you set up an agent by hand; `--yes` doesn't ask. The entry starts Node with code generation turned off, so the server can't run generated code. Install with `npm install -g repomagpie` first: from npx's cache, `setup` explains why it can't write a lasting entry.
- `repomagpie doctor` shows what is wired: which programs `repomagpie` and `magpie` run on your `PATH` (and whether a `magpie` is another tool), where the skill is installed and its version, the Claude Code hook (including the old `magpie hook claude-code` form), the RepoMagpie MCP server in Claude Code, Codex CLI, Cursor, Gemini CLI and VS Code, and your journals with their note counts and skipped files. It ends with what to do. It also lists the backups `setup` made, with their dates, since copies of `~/.claude.json` can hold sign-in tokens: delete them when you no longer need them. It changes nothing, and `--json` gives the same report for a bug report. <!-- check:commands allow -->
- `repomagpie catalog` lists every note in one row: name, kind, journal and the Verdict. It reads 100 notes at a time; the next page's command is on stderr. `--tag`, `--kind` and `--journal` filter it. Its `--json` is made for your coding agent to read your whole journal and pick what fits: one short row per note (name, kind, journal, whether you noted to avoid it, a one-line summary and the start of the Verdict), about 20,000 characters for 100 notes, with `next_cursor` for the next page. `--full --json` gives every field: id, tags, status, a longer summary and Verdict, and the names of its alternatives.

### Changed

- The agent skill tells the agent to use RepoMagpie's MCP tools when they are there, and the commands otherwise; and to read `repomagpie catalog` when search finds little in a small journal, since search matches words and "scraping websites" won't find a note that only says "crawler".
- The README's install is now `npm install -g repomagpie`, then `repomagpie setup`. The hook and skill steps by hand moved to [setting up by hand](docs/setup-by-hand.md).

### Security

- On Windows, `repomagpie ui` started `cmd` by name to open your browser, so a `cmd.exe` in the folder you ran it from (a cloned repository, say) could run instead, unless your terminal turns that lookup off. It now starts `cmd.exe` by its full path, as do `open` on macOS (`/usr/bin/open`) and `xdg-open` on Linux (only from a folder named by its full path on `PATH`). "Open in editor" opens only a note's full path.

## [0.2.0-beta.3] - 2026-10-14

The fourth pre-release: the command is `repomagpie`, note text written by other people is handled as data, GitHub topics become tags, and the first version built and staged on npm by GitHub Actions, with provenance.

### Added

- `repomagpie tags --from-topics` adds GitHub topics as tags to the notes you already have, until each has 8 tags. It never removes or reorders a tag, keeps the rest of each file exactly as it was, and adds the new tags to `tags.md`. `--dry-run` shows what it would do; a second run adds nothing. A note that can't be read is skipped and named. `--journal project` tags the project journal; `--json` lists each note's added tags.
- `truncated` in the `--json` of `repomagpie recall`, `search`, `suggest` and `note`: on an object whose note text was cut, the names of the cut fields, such as `["verdict"]`. It is there only when something was cut.
- "Add GitHub topics as tags" in All notes in `repomagpie ui`: the first click says what will happen ("Adds up to 8 tags to 17 notes, and 41 new tags to your tag list."), a second applies it.

### Changed

- The command is now `repomagpie`. `magpie` still works as a short alias for the same program, so existing hook entries keep working. Other tools also install a `magpie` command, and then `PATH` decides which one runs; the hook entry, the agent skill and every hint now use `repomagpie`. Change your hook entry to `repomagpie hook claude-code`. Messages on stderr start with `repomagpie:`, and the hook's with `RepoMagpie:`. <!-- check:commands allow -->
- The Claude Code hook's texts say whose journal a note is in, and quote its text: "RepoMagpie: your personal journal has a note on pdfkit (…). Its Verdict, quoted: "…"." For a project journal it says the note was written by the repository's contributors, and the permission prompt says "this project's journal says to avoid pdfkit" instead of "you noted". For a project journal's alternatives, it tells the agent to show you the exact package name and install one only with your OK.
- A new note for a GitHub repository gets up to 8 tags from its GitHub topics, through `repomagpie note`, `repomagpie import` and Add in `repomagpie ui`. Topics already in `tags.md` come first, then topics your other notes carry, then the rest. The repository's own name and topics such as `hacktoberfest` and `open-source` are skipped. Before, a topic became a tag only if `tags.md` already listed it. Tags stay yours: remove the ones you don't want.
- A better kind guess for a new GitHub repository note. It now also guesses `app`, `platform`, `framework`, `library` and `template`, from the repository's topics, GitHub's template flag and the packages it publishes. A single `SKILL.md` no longer makes a repository a skill pack: that takes `skill` in its name, a topic such as `agent-skills`, or 3 or more skill folders outside hidden folders such as `.claude/`. Existing notes keep their kind.
- New tags are added to the end of `tags.md` when the note is saved; the rest of the file stays exactly as it was. A journal without `tags.md` gets one. `repomagpie note` and `repomagpie import` say which tags they added, and `--json` lists them in `tags_md_added`.
- The sidebar in `repomagpie ui` shows the 15 tags with the most notes, then "Show all N tags", which expands the list in place and collapses it again.
- Add's preview in `repomagpie ui` shows the tags the save will write, each with a remove button. A "From GitHub topics" chip adds a tag to the preview, and `tags.md` changes only when you save. The note view's chips skip the same topics as new notes do, such as `hacktoberfest`.

### Security

- The agent skill says where the `repomagpie` command comes from (the npm package, built from this repository, with no installers or downloads), and tells the agent never to run a remote script to get it. `SECURITY.md` names the official channels and what RepoMagpie reads, writes and sends.
- Releases are built and staged on npm by GitHub Actions through trusted publishing, with provenance: the version's npm page links it to this repository, the tagged commit and the workflow run. The maintainer still approves each version with 2FA before it can be installed.
- Note text can't control your terminal or hide text from you or your agent. Before a note's text, a name, a path or a warning is printed, handed to an agent or shown in `repomagpie ui`, each control character, bidi control and zero-width character becomes a visible marker in its place, such as `<U+202E>`. An escape sequence (such as one that sets your clipboard or hides a link) loses its control characters and does nothing; the rest shows as text. A bidi override can no longer make "txt.exe" read "exe.txt". Your notes on disk don't change.
- In `repomagpie ui`, a note that holds a hidden or control character says so above its sections, also while you edit it; the editor keeps the text as written.
- Note text handed to an agent is capped, so one note can't flood its context: in `--json`, a Verdict at 1,000 characters, a bullet at 500, at most 20 bullets and 20 alternatives; in the hook, a Verdict at 500. Every field of the hook stays under Claude Code's 10,000-character limit, whatever the notes hold. What you read in the terminal is never cut.
- A journal never follows a link. A note, `notes/`, `tags.md` or `.cache/` that is a symbolic link or a junction is skipped when reading, so a cloned repository can't make RepoMagpie read a file elsewhere (such as a key) into your agent's context, and every write that would go through a link fails with an error that names it, so nothing writes to a file outside the journal. A project's `.magpie` that is a link isn't used. Your personal journal's own folder may still be a link. What was skipped is named once on stderr.
- In `repomagpie ui`, links from notes open only for `http` and `https` addresses; a `javascript:`, `data:` or `vbscript:` link shows as text. HTML in a note always shows as text. All notes names the files the journal skipped ("Skipped 1 file in this journal"), and the Note list's API answer lists them in `skipped`.
- A control, bidi or zero-width character in a GitHub repository's name, description, language, licence, topics or skill names is written to a note as its marker, such as `<U+202E>`, never as the character itself, and a repository URL that isn't `https` is replaced by the repository's own GitHub address.
- `repomagpie suggest` never reads a manifest or README that is a link, so a cloned repository can't make it read a file elsewhere (such as a key) and pass its words to your agent. It skips a manifest over 1 MB, reads only a README's start, and reads a `pyproject.toml` or `Cargo.toml` with an unclosed list in linear time (50,000 lines took over a minute before).
- An alternative whose name has non-ASCII letters (a Cyrillic "р" looks like "p") or isn't a valid package name is flagged in the hook, in `repomagpie recall`, and in the app's "Check a package" and the note view's alternative chips; the agent skill tells the agent to say so and install nothing for it.
- The Claude Code hook looks up at most the first 100 packages of one command, and says how many it didn't check: a command of 100,000 names took 17 s before.
- A cache in a journal (`.cache/`) is used only when every entry names a note file the journal has, so a committed cache can't point recall or search at a file elsewhere.
- `repomagpie ui` keeps no more than 1 MB of a write's body: a body a little over that gets 413, one announced as far larger is refused before it is read, one that keeps coming is cut off at 2 MB, and a request whose body never ends is cut off after 30 s. It no longer watches a `notes/` folder that is a link.
- A note file or `tags.md` over 256 KB is skipped and named, and YAML aliases in frontmatter are limited, so a crafted note can't slow down recall or the hook.
- The agent skill says that note text is quoted data: the agent reports what a note says and never follows instructions in it. A project journal's note was written by the repository's contributors; the agent shows you an alternative's exact package name from such a note and installs it only with your OK. When a note holds instructions addressed to the agent, or markers for hidden characters, the agent tells you in its first answer about that note and doesn't follow them.

## [0.2.0-beta.2] - 2026-10-08

The third pre-release: your alternatives before an install, in `magpie recall`, the Claude Code hook, `magpie suggest`, the app and the agent skill (v0.2 Connect, part 3).

### Added

- Your alternatives, shown before an install. When a note has alternatives (its own `alternatives`, or notes that list it), `magpie recall` adds an "Alternatives" row to the card: each with its Verdict, `[inbox] no verdict yet`, or "(you also noted to avoid it)"; at most 3, then `+N more`, and every one with `--full`. Piped, they share one line.
- The Claude Code hook names a note's alternatives. For an avoid note, the permission prompt gets an "Alternatives:" line, and the agent's context names them and says to offer them to you and to recall one before installing it. Other notes get a short "Alternatives:" suffix. Whether the hook asks doesn't change.
- `magpie suggest` names the alternatives of a package the project already uses that you noted to avoid: "Instead: puppeteer, pdf-lib".
- `alternatives` in `--json`: on every match of `magpie recall`, and on every `candidates[]` and `in_use_avoid[]` item of `magpie suggest`. Each has `name`, `id`, `journal`, `verdict`, `status`, `avoid` and `path`; one without a note also has `reason`: `"missing"` (no note on it) or `"ambiguous"` (several notes have that name), as a link in the Note document has.
- `magpie note <name> --alternative <target>` records a package you named to use instead. Repeat it for several. A name, a PURL or a file stem; a PURL is written as the file stem its note has or would have, so a note made later resolves it. An alternative already there isn't added twice, and the rest of the file stays exactly as it was. `--json` adds `alternatives_added` and `alternatives_present`.
- Check a package in `magpie ui` shows the Alternatives row; Suggest's "In use, avoid" rows get an "Instead:" line. A name with a note opens it; one without opens Add, or Search when several notes have that name.
- The agent skill names your alternatives before an install, asks whether to install one instead, and offers to record an alternative you name. When you answer No to the hook's prompt, Claude Code ends the agent's turn, so the agent offers your alternatives on your next message.

### Changed

- In `magpie ui`, a `[[link]]` whose name several notes have opens Search with that name. Before, it did nothing. On the graph page, a missing note of that kind offers "Search notes" instead of "Add a note".

### Fixed

- In `magpie ui`, a missing link or alternative written as a file stem opens Add with what the stem stands for: `[[npm--pdfkit]]` with `pkg:npm/pdfkit` (`pypi--` and `cargo--` likewise), `[[github--owner--repo]]` with `https://github.com/owner/repo`. Before, Add got the stem, which isn't a package name. A scoped npm stem (`npm--babel--core`) stays as written, because the stem lost its `@`.
- The Claude Code hook ignores a UTF-8 byte-order mark at the start of its input. Before, such input, as a Windows PowerShell pipe sends it, made the hook stay silent.

## [0.2.0-beta.1] - 2026-10-08

The second pre-release: linked notes and a graph page in `magpie ui` (v0.2 Connect, parts 1 and 2).

### Added

- Links between notes in `magpie ui`. Write `[[pdfkit]]`, `[[npm--pdfkit|a label]]` or `[[pdfkit#Verdict]]` in any section, and the note view shows it as a link that opens that note; the browser's Back returns. Typing `[[` in an editor lists the journal's notes to link. A link to a subject without a note looks muted, with a dashed underline, and opens Add. "Linked from" at the end of a note lists the notes that link to it, and refreshes when another note changes.
- The Note document (`GET /api/note`) has `links` and `backlinks`.
- `alternatives` in the note schema: a human-owned list of wikilinks, such as `alternatives: ["[[npm--puppeteer]]"]`. In `magpie ui`, a note's alternatives show under the Verdict as chips you can open or remove, and "+ Add" picks a note or takes a name without one. One side is enough: the other note shows "Alternative to: …". Adding or removing one changes only that entry; the others stay exactly as you wrote them, labels included. `PATCH /api/note` takes `fields.alternatives`.
- "From GitHub topics" in `magpie ui`: in the inbox review, the note's tag editor and Add's preview, a repository's topics that aren't tags yet show as chips. A click adds the tag, and appends it to the journal's `tags.md` if the list doesn't have it; the rest of the file stays as it was. `POST /api/tags` takes `{"journal", "add": [...]}`.
- A graph page in `magpie ui` ("Graph" in the sidebar, "Open graph" in the palette, `g g`): a journal's notes, the tags they carry, their `[[links]]` and alternatives, and optionally notes with similar GitHub topics and links to subjects without a note. Colour shows the kind and fading the inbox, with a legend in words; size shows how connected a note is. A status line counts what is drawn ("Showing 214 notes, 31 tags and 486 connections"). Search for a note or `#tag`; click a note to read and edit it beside the graph; show 1 or 2 steps around a node; filter by kind, tags, status and tried; switch each kind of connection on or off. A list of the selected node's neighbours, grouped by connection, works by keyboard and without WebGL. "Show in graph" in the note view opens the graph on that note. The graph follows changes on disk without moving what is drawn, and opens in under 2 s at 2,000 notes. The same layout every time for the same journal; "Re-run layout" and "Fit to screen".
- `GET /api/graph?journal=personal|project` returns the Graph document (notes, tags, missing notes with `&ghosts=1`, and the connections between them, with counts).

### Changed

- The note view in `magpie ui` always shows "My notes" and "Related", like "Use when" and "Avoid when", so you can start them from the app. An empty one says "Nothing yet." and offers Edit. Saving a section the file doesn't have adds it at its place in the note and leaves the rest of the file as it was, including blank lines at the end.

### Removed

- The note view in `magpie ui` no longer has an "Open in Obsidian" button. Notes are still plain Markdown files that Obsidian or any other editor can open, and "Open in editor" stays.

### Fixed

- A damaged cache entry in `.cache/recall-index.json` (valid JSON, wrong shape) no longer makes `magpie recall` crash or the Claude Code hook stay silent on an install with an avoid note. The cache is rebuilt from the notes. The local app's caches (`links.json`, `note-list.json`) read such an entry again from its note.
- On Windows, a cache in `.cache/` is still updated when another program, such as antivirus, holds the old file for a moment: magpie tries again for up to about 50 ms. A cache that can't be written leaves no `.tmp` file behind.
- Opening or saving a note in `magpie ui` no longer reads every note in the journal: the link cache names the note's file. With 2,000 notes, opening one takes about 30 ms instead of about 430 ms.
- The local app now ships its licence notices: `dist/ui/THIRD-PARTY-LICENSES.md` for the libraries bundled into it, such as React, sigma, graphology and ForceAtlas2,, and `dist/ui/icons-LICENSE.txt` for its icons, copied from Phosphor Icons. 0.1.0-beta.1 shipped the app without them.

## [0.1.0-beta.1] - 2026-10-07

The first pre-release, for early testers.

### Added

- `magpie ui` starts a local server on `127.0.0.1` and opens your journals in the browser. The server reads and writes notes through the same code as the CLI, and its API returns the same JSON as `--json`. It answers only requests with the session token from the printed URL, refuses writes from other pages, never sends `GITHUB_TOKEN` to the browser, and reports notes changed in another editor. Flags: `--port`, `--no-open`, `--json`. Ctrl+C stops it.
- The local app in `magpie ui`, dark or light, keyboard first:
  - **Inbox review:** press Enter, write the Verdict, press Ctrl+Enter; the next inbox note opens. Kind, tags, tried and rating sit next to the Verdict, with "What it does" and "Use when" above it.
  - **Note view:** whether you tried it and your rating under the title, then the Verdict, Use when and Avoid when. Accept or edit drafts, edit sections, and open the note in your editor or Obsidian.
  - **Search:** with filters for journal, status, kind and tag. A command palette on Ctrl/Cmd+K shows what `magpie search` finds and runs every action. It says "Searching…" until the search answers.
  - **Add and Import:** preview a note before you save it; check import lines before you import them.
  - **Check a package:** shows what the Claude Code hook would say before an install.
  - **Settings:** the journals, whether `GITHUB_TOKEN` is set, the version and the theme.
  - **Safe edits:** a note changed in another editor shows a banner with "Reload", and your unsaved text stays; nothing is overwritten.
- "Edit tag list" opens the journal's `tags.md` in your editor. A journal without `tags.md` shows "Create tag list" instead, which writes the starter list when you click it. A `tags.md` without tags says so in the sidebar, with "Edit tag list".
- Package URLs are shown decoded, for example `pkg:npm/@playwright/cli` and the package `@playwright/cli`, in the app and in `magpie import` output. `--json`, the files and a copied PURL keep the encoded form.
- The app shows paths under your home directory with `~`, for example `~/.magpie/notes/npm--pdfkit.md`, as `magpie recall` and the hook print them.
- A third cache, `<journal>/.cache/note-list.json`, keeps the app's note list fast: 2,000 notes load in about 40 ms instead of 500 ms.

- `magpie suggest ["description"]` shows the notes from both journals that fit this project, Verdict first, from its manifests and README or from a description. Packages the project already uses are never suggested; those you noted to avoid are listed apart, under "Already in use, you noted to avoid". It narrows by keyword and tags, skips words almost every project has (`code`, `install`, `js`), leaves out notes that score under a fifth of the best one, and says why each note is a candidate: `Why: dependency @playwright/test; matched coding, agent` (`why` in `--json`, a third line in the app). Your coding agent picks the fit. Flags: `--limit`, `--journal`, `--json`.
- `magpie adopt <name-or-purl>` copies a note from your personal journal into the project journal, with the date as `adopted`, and prints the install command for the project's package manager (`npm`, `pnpm`, `yarn`, `bun`, `pip`, `uv`, `cargo`). For a repository that publishes several packages, it prints one command per package for you to choose from. It never installs anything, and never overwrites a note the project already has. For a note whose Verdict says to avoid the package, it still copies the note but names no install command, and says `Your note says to avoid pdfkit; no install command.` instead; `install` is `null` in `--json`. The app shows the same line. "Avoid when" text alone doesn't stop the command. Flags: `--type`, `--json`.
- In the local app: **Suggest for this project**, with the same candidates as `magpie suggest` and a box for a description; and **Adopt to project** on a personal note, which says who can read the project journal before it copies anything.
- An agent skill for any coding agent that supports Agent Skills, installed with `npx skills add Varshavia/RepoMagpie`. It teaches the agent to run `magpie recall` before it adds a dependency and to ask you first when your note says to avoid it (skill mode, for agents without the Claude Code hook); to answer "what do I have for X?" with `magpie search`; to pick what fits a project from `magpie suggest` and say why; and to offer `magpie note` when you form an opinion on a tool. It never writes a Verdict you didn't say, and runs `magpie adopt` or writes to a project journal only with your OK.
- `magpie --version` and `magpie --help`. Help lists the v0.1 commands (`note`, `import`, `search`, `recall`, `ui`, `suggest`, `adopt`, `init`); `init` is not implemented yet.
- `magpie search <query>` searches both journals, with prefix and fuzzy matching. Each completed skill line is its own result. Results lead with the Verdict, say which journal they came from, and put reviewed notes before inbox ones. In a terminal the Verdict gets its own wrapped lines and is never cut. Flags: `--tag` (repeatable), `--kind`, `--journal`, `--limit`, `--json`.
- `magpie recall <package...>` shows your notes on packages before an install, from both journals: Verdict, Avoid when and Use when first. It ignores versions and extras (`pdfkit@1.2.0`, `requests[socks]>=2`) and takes PURLs. A match under another package type is labelled "name match only". Flags: `--type`, `--full`, `--json`.
- `magpie hook claude-code`, for a Claude Code `PreToolUse` hook: before an install such as `npm install pdfkit`, a note that says to avoid the package makes Claude Code ask you first; any other note reaches the agent as context. magpie never denies an install, and the hook stays silent when nothing matches or anything fails. `--inform-only` never asks, for unattended `claude -p` runs. `--help` prints the settings snippet.
- The CLI ships bundled with its libraries, so installing it adds no other packages, and it starts faster: on a Windows machine with 2,000 notes, the hook takes about 65 ms on a command that installs nothing and 110 ms on an install with a note, and `magpie recall` about 115 ms. The libraries' licences are in `dist/cli/THIRD-PARTY-LICENSES.md`.
- The search index and a recall index are cached in `<journal>/.cache/`. They are rebuilt when notes change and are safe to delete.
- `~/.magpie` and the personal journal's own folder are never used as a project journal, and looking for a project journal stops at your home directory.
- A new journal starts with a starter `tags.md` of ten tags. An existing `tags.md` is never overwritten.
- `magpie note <name-or-url> ["text"]` captures a one-line Verdict for a package or repository, for example `magpie note pdfkit "avoid: async streams painful"`.
- `magpie note <github-url>` creates a note from the repository's GitHub metadata: licence, language, topics, packages from root manifests, a drafted kind and "What it does", and one skill line per `SKILL.md`. Run it again to refresh those fields and add new skills; your own text is never changed.
- `magpie import <file>` adds one note per `- <url-or-name> — verdict: ... | use: ... | avoid: ...` line, with `--dry-run` to preview. One bad line never stops the rest. A list copied out of a chat works too: items may also start with `* `, `+ ` or `\- `. A file without items gets a hint that says what its first line starts with.
- Global flags `--json`, `--home <dir>` and `--project <dir>`; `note` and `import` take `--to personal|project`. A project journal is created at the git root on first use.
- `GITHUB_TOKEN`, if set, is used for GitHub requests and never printed.
- A package name never holds `\`, `:` or `%`, or starts with a dot, so `magpie note` and `magpie import` refuse a file path given as a name.

[Unreleased]: https://github.com/Varshavia/RepoMagpie/compare/v0.2.0-beta.12...HEAD
[0.2.0-beta.12]: https://github.com/Varshavia/RepoMagpie/compare/v0.2.0-beta.11...v0.2.0-beta.12
[0.2.0-beta.11]: https://github.com/Varshavia/RepoMagpie/compare/v0.2.0-beta.10...v0.2.0-beta.11
[0.2.0-beta.10]: https://github.com/Varshavia/RepoMagpie/compare/v0.2.0-beta.9...v0.2.0-beta.10
[0.2.0-beta.9]: https://github.com/Varshavia/RepoMagpie/compare/v0.2.0-beta.8...v0.2.0-beta.9
[0.2.0-beta.8]: https://github.com/Varshavia/RepoMagpie/compare/v0.2.0-beta.7...v0.2.0-beta.8
[0.2.0-beta.7]: https://github.com/Varshavia/RepoMagpie/compare/v0.2.0-beta.6...v0.2.0-beta.7
[0.2.0-beta.6]: https://github.com/Varshavia/RepoMagpie/compare/v0.2.0-beta.5...v0.2.0-beta.6
[0.2.0-beta.5]: https://github.com/Varshavia/RepoMagpie/compare/v0.2.0-beta.4...v0.2.0-beta.5
[0.2.0-beta.4]: https://github.com/Varshavia/RepoMagpie/compare/v0.2.0-beta.3...v0.2.0-beta.4
[0.2.0-beta.3]: https://github.com/Varshavia/RepoMagpie/compare/v0.2.0-beta.2...v0.2.0-beta.3
[0.2.0-beta.2]: https://github.com/Varshavia/RepoMagpie/compare/v0.2.0-beta.1...v0.2.0-beta.2
[0.2.0-beta.1]: https://github.com/Varshavia/RepoMagpie/compare/v0.1.0-beta.1...v0.2.0-beta.1
[0.1.0-beta.1]: https://github.com/Varshavia/RepoMagpie/releases/tag/v0.1.0-beta.1
