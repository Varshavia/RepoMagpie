# The skill-compliance eval

How well does a coding agent follow RepoMagpie's skill ([`skills/repomagpie/SKILL.md`](../../skills/repomagpie/SKILL.md))? This eval runs Claude Code, or Gemini CLI ([below](#gemini-cli)), on 25 scenarios and checks what it did: which tools it called, what it tried to install, what it saved, and what it answered. It prints a pass rate per scenario and overall, for one agent and one model at a time.

The maintainer runs it by hand. It isn't part of CI or `npm test`: it needs a model and an API key. With Claude Code it costs money; with Gemini CLI it runs on the Gemini API's free tier. What it measures, against which hypotheses: [validation](../../docs/validation.md#skill-compliance-eval).

## How it works

- **The agent:** Claude Code by default, through promptfoo's Claude Agent SDK provider (`providers.yaml`). For Gemini CLI, see [below](#gemini-cli). It has RepoMagpie's MCP server (`repomagpie mcp --allow-write`, from this repository's source) and the skill, as `repomagpie setup` would give it. Your own Claude Code settings, hooks, skills and MCP servers aren't loaded.
- **The journal and the project:** before each scenario, `fixture/journal` (11 notes) is copied to `.run/home/.magpie`, the personal journal, and `fixture/project` (a small Express app) to `.run/project`, where the agent works. Your real `~/.magpie` is never read: the MCP server runs with `MAGPIE_HOME` pointing at `.run/`.
- **Nothing runs:** Bash, Edit and Write are available to the agent but never allowed, so an `npm install` is tried and denied, never run. The checks count what the agent tried. Only the MCP tools and reading files work.
- **One message per scenario.** When a scenario needs an earlier part of the session (an offer already made, a "no" already said), the prompt tells it in brackets.
- **The checks** (`assertions.mjs`) are plain code, no model grades anything: recall before an install, no install after an avoid note, the Verdict and alternatives in the reply, the domains in a search, one offer and nothing saved before the answer, a saved Verdict in the user's words only, no delete, no project journal write, the journal unchanged on disk. Two run in every scenario: only the user's words saved, and no delete or adopt.

## What it needs

- **Node.js 22.22 or later.** promptfoo 0.124.1 needs it; RepoMagpie itself runs on 22.12 and later.
- **promptfoo and the Claude Agent SDK, installed here only:** in `evals/skill/`, run `npm install`. `package.json` pins exact versions, each at least two weeks old when chosen: `promptfoo` 0.124.1 (2026-10-08) and `@anthropic-ai/claude-agent-sdk` 0.3.296 (2026-10-09). They never go in the repository's `package.json` or in the published package, which holds only `dist/` and `skills/`.
- **Their licences:** promptfoo is MIT. The Claude Agent SDK's `license` field is "SEE LICENSE IN README.md": Anthropic's terms, not an open-source licence. Read them before you install it.
- **An Anthropic API key**, below. For Gemini CLI, a Gemini API key instead, and Gemini CLI itself ([below](#gemini-cli)); the Claude Agent SDK isn't needed then.

## The key

The SDK reads `ANTHROPIC_API_KEY` from your environment. Set it in the shell you run the eval from, so it stays out of your shell history and out of every file:

```sh
read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY   # macOS, Linux
```

```powershell
$env:ANTHROPIC_API_KEY = [Net.NetworkCredential]::new("", (Read-Host -AsSecureString "Key")).Password   # Windows PowerShell
```

Never put it in a file. promptfoo also loads a `.env` file from the folder it runs in: don't create one here. `run.mjs` stops when the variable isn't set, and never prints it.

## Running it

From `evals/skill/`:

1. **`node run.mjs --self-check`** runs every check on canned tool calls, with no model and no key, so you know the checks themselves work.
2. **`node run.mjs --dry`** runs one scenario (`dry.yaml`): the agent is asked to add left-pad with npm. It answers one question: when an install is denied, does promptfoo still list that call in the tool calls? Every install check depends on it.
   - **It passes:** go on to step 3.
   - **"no tool calls in metadata.toolCalls":** the provider doesn't give the checks what the agent did. Don't run the full set.
   - **"tool calls are there, but no install of left-pad":** denied calls are dropped. The install checks would pass for the wrong reason, so don't run the full set either.
   - In every case, `.run/dry-tool-calls.json` shows what the provider returned: its metadata's keys, each tool call and the reply.
3. **`node run.mjs`** runs the 25 scenarios (`promptfooconfig.yaml`, `scenarios.yaml`), one at a time.

**Per model:** `--model claude-opus-5-5`, `--model claude-sonnet-5-5` (the default) or `--model claude-haiku-5-5`. Run each one separately; the report names the model.

**More than one run:** `--repeat 3` runs each scenario three times. An agent doesn't do the same thing every time, so a rate over several runs says more than one pass or fail.

**Some scenarios:** `--only 3,5,7` or `--only 3-7` (or both: `--only 1-3,9`) runs only those, by their number: the report's `#` column, their order in `scenarios.yaml`.

**Over several runs:** `--resume` runs only the scenarios the saved report hasn't finished (one the agent couldn't finish, such as skipped, stopped by a limit or timed out; one never run), and merges them into it: one report for the same agent, model, config and `--repeat`. It refuses another model; a run without `--resume` starts a new report. The saved report is `.run/saved/report.json`, which a new run and `--self-check` keep. With `--only`, `--resume` runs the unfinished ones among those.

## What it costs

No run has been measured yet. The provider stops a scenario once it has cost $0.50 (`max_budget_usd`), or after 12 turns (`max_turns`). So one run of the dry scenario costs at most about $0.50, and one run of the full set at most about 25 × $0.50 = $12.50, times `--repeat`. The cap is checked as the agent goes, so a scenario can go slightly over it.

Each report says what that run cost, as promptfoo counted it. Use those numbers, not this estimate, once you have them.

## Reading the results

`run.mjs` prints the report and writes it to `.run/report.md`:

```
# Skill compliance: claude-code/<model>, <date>

promptfooconfig.yaml, <n> runs per scenario. Overall: <passed>/<runs> (<rate> %). Cost: $<cost>, as promptfoo reports it.

| # | Scenario | Passed | Rate | Why it failed |
|---|---|---|---|---|
| 5 | avoid note: pdfkit is not installed; the reply quotes the Verdict and asks | <passed>/<runs> | <rate> % | <the first failing check's reason> |
```

With `--resume`, the report covers the saved report's scenarios, from every run that went into it; the cost line is this run's.

- **Rate:** the share of runs where every check of the scenario passed.
- **Why it failed:** the first failing check's reason, such as `pdfkit was installed before it was recalled` or `saved words the user didn't say: "handy for JSON Schema"`.
- **A warning about resets** means promptfoo's `beforeEach` hook didn't run for each scenario, so scenarios may have seen each other's notes. Treat that run as void.
- **Everything else:** `.run/results.json` has promptfoo's full results. To browse them, run `npx promptfoo view` with `PROMPTFOO_CONFIG_DIR` set to `.run/promptfoo`, where `run.mjs` keeps promptfoo's files.

`.run/` is git-ignored. Each run replaces it, all but `.run/saved/`.

## Gemini CLI

`node run.mjs --agent gemini-cli` runs the same 25 scenarios on Gemini CLI, with the same checks. It runs on the Gemini API's free tier: no charge. Facts below were checked on 2026-10-30 against Gemini CLI 0.65.0, from the docs it ships (`bundle/docs` in its npm package) and, where those were silent or wrong, from its code. Gemini CLI changes fast: check again after an update.

**Status (2026-10-30):** the dry scenario passed on `gemini-3.6-flash`: 6 model turns, and the denied install was among the tool calls. A full run stopped after 2 scenarios at the free tier's daily quota (20 requests a day for that model). The full set is paused: it needs several days with `--resume` ([Limits](#limits)).

### What it needs

- **Gemini CLI** on `PATH`: `npm install -g @google/gemini-cli`. The report names its version. Your own Gemini CLI setup isn't touched or used ([isolation](#isolation)).
- **promptfoo**, installed here as above (`npm install` in `evals/skill/`).
- **A Gemini API key from Google AI Studio, in a project with no billing account.** Create it at https://aistudio.google.com/app/apikey. Linking billing moves the project to a paid tier. Signing in with a Google account doesn't work here: Gemini CLI refused a Google AI Pro account ([agents](../../docs/agents.md#gemini-cli)), and the isolated home has no sign-in anyway.

Set the key in the shell you run the eval from, never in a file:

```sh
read -rs GEMINI_API_KEY && export GEMINI_API_KEY   # macOS, Linux
```

```powershell
$env:GEMINI_API_KEY = [Net.NetworkCredential]::new("", (Read-Host -AsSecureString "Key")).Password   # Windows PowerShell
```

`run.mjs` stops when it isn't set, and never prints it. Gemini CLI keeps it from the MCP server: it removes variables named like `*KEY*` from its child processes.

### Running it

From `evals/skill/`:

1. `node run.mjs --self-check`: the checks, and Gemini CLI's output parser on canned output. No key, no model.
2. `node run.mjs --agent gemini-cli --dry`: the dry scenario. What its result means is in [Running it](#running-it), above. On Gemini CLI, "no install of left-pad among them" also means the shell tool wasn't offered to the model: see `gemini_name` in `.run/dry-tool-calls.json`.
3. `node run.mjs --agent gemini-cli`: the 25 scenarios. On the free tier, that takes several days: see [Limits](#limits).
4. `node run.mjs --agent gemini-cli --resume`, each day after the quota resets: the scenarios not finished yet, merged into the same report. Give the same `--model` each day.

**Options:**
- `--model <id>`: the default is `gemini-3.6-flash`, the model the dry scenario passed on (2026-10-30). On the same key that day, `gemini-3.8-flash` and `gemini-3.7-flash` returned 503 or ran into the 5-minute limit with no model turn, and `gemini-2.5-flash` returned 404 ("no longer available to new users"). The free tier serves Flash models only. Gemini CLI has no command that lists models, and it doesn't check the name: it sends any id to the API, which answers 404 for one your key can't use. [Listing your key's models](#listing-your-keys-models) asks the API directly.
- `--pause <seconds>`: the pause between scenarios, 15 by default, for the free tier's per-minute limit.
- `--repeat <n>`: as for Claude Code, if the daily limit allows.
- `--only <ids>` and `--resume`: as for Claude Code ([Running it](#running-it)).
- `--debug`: prints what Gemini CLI does while it runs ([Seeing what it did](#seeing-what-it-did)).

#### Listing your key's models

The Gemini API's `models` list, with the key in a header, so it isn't in the URL or your history. It generates nothing. In Windows PowerShell, with `GEMINI_API_KEY` set:

```powershell
(Invoke-RestMethod "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000" -Headers @{ "x-goog-api-key" = $env:GEMINI_API_KEY }).models | Where-Object { $_.supportedGenerationMethods -contains "generateContent" } | ForEach-Object { $_.name -replace "^models/" }
```

The list can still hold a model a new project can't call. AI Studio's rate-limit page shows which ones your key's project can use, and their limits.

### Isolation

The run never uses your `~/.gemini` (your settings, its `repomagpie` entry pointing at your real journal, your hook, your skills, your sign-in):

- **Its own home.** `GEMINI_CLI_HOME`, `USERPROFILE` and `HOME` point at `.run/gemini-home`. `GEMINI_CLI_HOME` moves every user-level file Gemini CLI has: settings, skills (`.gemini/skills`, `.agents/skills`), policies, history. `USERPROFILE` and `HOME` cover the few places it reads the home folder directly.
- **Set up by `repomagpie setup`'s own code** (`gemini.mjs`), once per run: `gemini mcp add --scope user` adds `repomagpie mcp --allow-write` from this repository's source, with `--home` at `.run/`, and the skill is copied to `.agents/skills/repomagpie`. The eval adds its own settings (no usage statistics, no auto-update, no hooks, no auto-memory, the 12-turn limit) and its policy, `gemini-policy.toml`. A copy of this home starts each scenario.
- **Workspace settings wouldn't be enough.** Gemini CLI merges user and project settings: MCP servers by name, and hooks by adding the user's to the project's. With your home, your `repomagpie` hook would run on every shell command.
- **None of your Gemini or Google variables** reach it, except `GEMINI_API_KEY`: those can choose another sign-in, settings file or model.
- **`.env` files.** Gemini CLI loads the first `.env` it finds going up from the project, and in 0.65.0 the search goes past the git root, through your home folder (its docs say it stops at the git root). An empty `.run/project/.gemini/.env` ends the search at the start.
- **The project is trusted** (`GEMINI_CLI_TRUST_WORKSPACE`): in an untrusted folder, Gemini CLI starts no MCP server.

To see what it loads, after a run (`.run/gemini-home` exists then), with no key and no model call, from `evals/skill/` in Windows PowerShell. It runs in a child PowerShell, so your shell's variables don't change:

```powershell
powershell -NoProfile -Command { $h = (Resolve-Path .run\gemini-home).Path; $env:GEMINI_CLI_HOME = $h; $env:USERPROFILE = $h; $env:HOME = $h; $env:GEMINI_CLI_TRUST_WORKSPACE = "true"; Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue; Set-Location .run\project; gemini mcp list; gemini skills list 2>$null }
```

It lists one MCP server, `repomagpie`, Connected, with `--home` in `.run/`, and one skill, `repomagpie`, in `.run\gemini-home\.agents\skills\`. Your own entry and skill don't appear.

### Nothing runs

The same tool set as Claude Code's (`providers.yaml`), set in `gemini-policy.toml`:

- **Allowed:** RepoMagpie's MCP tools, the skill (`activate_skill`), and reading the project (`read_file`, `read_many_files`, `list_directory`, `glob`, `grep_search`).
- **Tried, never run:** the shell (`run_shell_command`), `write_file` and `replace`. Every call is denied, and the agent gets "Tool execution denied by policy." Headless, Gemini CLI would otherwise take these tools, and the skill's, out of the model's list: the agent couldn't try an install, and couldn't activate the skill.
- **Off:** everything else (web search, web fetch, subagents, memory).

### Seeing what it did

Each scenario runs `gemini -p "<prompt>" -m <model> -o stream-json --approval-mode default --allowed-mcp-server-names repomagpie` in `.run/project` (`gemini-provider.mjs`, which starts Gemini CLI's own `gemini.js` with node, so the prompt never goes through a shell). The stream gives a `tool_use` event for each call the model asks for, before the policy decides, so a denied call is there too, then its `tool_result` (`status: "error"`, `policy_violation`, when denied). `gemini.mjs` turns them into the tool calls the checks read, in Claude Code's names (`run_shell_command` is `Bash`, `mcp_repomagpie_recall` is `mcp__repomagpie__recall`, `write_file` is `Write`, `replace` is `Edit`), so the checks are the same. The reply is the last model turn's text.

A scenario stops after 12 model turns (`model.maxSessionTurns`; its checks still judge what the agent did until then) or after 5 minutes.

**`--debug`** runs Gemini CLI with its own `--debug` and prints, as they come, each line of its stderr and each stream-json event (its type, tool and status, not its text), each line marked `[gemini <seconds> s]`. Headless, Gemini CLI writes all of this to stderr, so the stream-json stays as it is. A scenario that waits shows what it waits on: `Attempt 3 failed with status 429. Retrying with backoff...` is Gemini CLI retrying the API itself; nothing at all after the start is a request with no answer. It can't wait on input: its stdin is closed. Gemini CLI also writes a full report of an API error to your temp folder, and stderr names it: `Full report available at: …\gemini-client-error-….json`.

The key's value is masked (`<GEMINI_API_KEY>`) in both streams before anything is printed or kept.

### The hook is left out

RepoMagpie's Gemini CLI hook isn't set up, as in the Claude Code run: this eval measures the skill. There is a second reason. Gemini CLI runs the hook before its policy, and the hook asks before an install with an avoid note. An `ask` overrides the policy's deny and waits for a confirmation, and headless, nothing answers it. The scenario would wait until its time limit.

### Limits

- **The free tier's daily limit is per model, and small.** Gemini CLI's `quota-and-pricing.md` says 250 requests a day, but each model has its own limit, and `gemini-3.6-flash`'s was 20 on 2026-10-30, as the API's refusal gave it. Lite models usually have higher limits. Google's rate-limits page doesn't publish the numbers: check AI Studio's (https://aistudio.google.com/rate-limit) for your key, then pick a model with `--model`. Limits are per project and reset at midnight Pacific time.
- **One request per model turn**, at least. The first two scenarios took 8 and 4 requests, so the 25 need roughly 75 to 200: with a limit of 20, run the set over several days, `--resume` each day. Not `--repeat 3`.
- **Gemini CLI retries on its own.** On a 429 or a 5xx it tries again, up to 10 times, 5 to 30 seconds apart, or after the delay the API asks for. Each attempt is a request to the API. A scenario can spend its 5 minutes this way: "Why it failed" then counts the failed attempts.
- **The daily quota stops the run at once.** At the first stderr line about it, Gemini CLI is stopped (two seconds later, so the API's limit and wait are in), and the rest of the run is skipped in a moment, with "skipped: the free tier's daily quota ran out earlier in this run". The scenario it stopped fails too, even with a reply: the agent was cut off, so `--resume` runs it again. A per-minute 429 doesn't stop the run; Gemini CLI retries it.
- **promptfoo doesn't retry either.** Its scheduler retried each refusal with a "429" in it, with a wait: in a stand-in run, two refused scenarios took 507 seconds with it and 2 without. `run.mjs` turns it off for Gemini CLI (`PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER`).

### Reading the report

As above, with Gemini CLI's name and model: `# Skill compliance: gemini-cli/<model>, <date>`. The cost line says "free tier / subscription, no charge counted", with Gemini CLI's version and the model turns the run took. Then two lines of its own:

- **Requests:** `Requests: about 12 in this run, for 2 scenarios that reached the API (about 6 each)`. One per model turn, per failed attempt and per refused request: Gemini CLI's output counts no requests, and in 0.65.0 it makes none of its own here. Divide the model's daily limit by the number each to plan a day.
- **After a daily-quota stop:** the limit and the wait the API gave, how many scenarios are left, and the command that goes on after the reset: `node run.mjs --agent gemini-cli --model gemini-3.6-flash --resume`.

A scenario Gemini CLI couldn't finish (no key, a model your key can't use, the quota, the time limit) fails, and its checks don't run. "Why it failed" gives Gemini CLI's message without its stack trace:

- `Gemini CLI exited 1: API status 404: This model models/gemini-2.5-flash is no longer available to new users. …`
- `stopped after 5 minutes, 0 model turns, 9 failed attempts; Gemini CLI's last word: API status 429: You exceeded your current quota, …`
- `stopped at the free tier's daily quota after 3 model turns: API status 429: You have exhausted your daily quota on this model. …`

`.run/results.json` has each scenario's tool calls, every model turn's text (`texts`), the exit code, the requests, that message in parts (`problem`: `status`, `message`, `retries`, `daily`), and the end of Gemini CLI's stderr.

### What differs from Claude Code

- **The scenarios are the same 25.** None depends on something only Claude Code has: they check MCP calls, shell commands, edits and the reply, which both agents have.
- **The skill is found differently.** Claude Code reads it from the project's `.claude/skills`; Gemini CLI from its home's `.agents/skills`, as `setup` installs it for a user. Gemini CLI activates it with `activate_skill`.
- **The shell is PowerShell on Windows,** not bash. The checks read the command the same way.
- **The MCP server starts as `setup` writes it** (`--disallow-code-generation-from-strings`, `--home`); the Claude Code run starts it from `providers.yaml` with `MAGPIE_HOME`.

## What it doesn't measure

- **Other agents.** Claude Code and Gemini CLI only. Codex CLI, Cursor, Copilot CLI and Antigravity CLI would each need their own provider.
- **The hook.** RepoMagpie's install hook isn't set up here, for either agent: this eval measures the skill ([why not on Gemini CLI](#the-hook-is-left-out)). The hook has its own tests (`src/hook/`).
- **Real sessions.** A scenario is one message, with any earlier part of the session told in brackets. After a denied install the agent reports the failure, which it wouldn't in a real session.
- **The project journal.** The fixture has a personal journal only.
- **Stable numbers.** Results change between runs, and with each Claude Code, Gemini CLI and model release. Record the date, the agent, the model and the versions with every number.

## What isn't checked yet

The provider's config keys (`providers.yaml`) and the shape of its tool calls come from promptfoo's documentation, read on 2026-10-25, not from a run. So does the `beforeEach` extension hook (`hooks.mjs`). The dry scenario is the first run that checks them.

For Gemini CLI, these were checked without a model: Gemini CLI loads only the isolated home's `repomagpie` server and skill, the policy loads, promptfoo runs `gemini-provider.mjs` in place of `providers.yaml`, and the reset runs before each scenario. The canned output in `self-check.mjs` is written from Gemini CLI 0.65.0's code, not from a run, and so is the claim that the policy keeps the shell on offer. The dry scenario is the first run that checks them.

## Files

| File | What it is |
|---|---|
| `run.mjs` | Starts the eval and writes the report |
| `report.mjs` | The report's parts: the scenarios' numbers, `--only`, each scenario's outcome, the saved report `--resume` merges into |
| `providers.yaml` | Claude Code with RepoMagpie's MCP server and skill |
| `gemini-provider.mjs` | Gemini CLI, one headless run per scenario |
| `gemini.mjs` | Gemini CLI's isolated home, set up by `repomagpie setup`'s code; its environment and command line; its output read into tool calls |
| `gemini-policy.toml` | Gemini CLI's tool set: what is allowed, tried but denied, and off |
| `dry.yaml` | The dry scenario |
| `promptfooconfig.yaml`, `scenarios.yaml` | The full set |
| `assertions.mjs` | The checks |
| `self-check.mjs` | The checks on canned tool calls, and Gemini CLI's parser on canned output |
| `fixture.mjs`, `hooks.mjs` | `.run/`, and its reset before each scenario |
| `fixture/journal`, `fixture/project` | The journal and the project every scenario starts from |
| `package.json` | The two pinned packages, for this folder only |
