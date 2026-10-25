# The skill-compliance eval

How well does a coding agent follow RepoMagpie's skill ([`skills/repomagpie/SKILL.md`](../../skills/repomagpie/SKILL.md))? This eval runs Claude Code on 25 scenarios and checks what it did: which tools it called, what it tried to install, what it saved, and what it answered. It prints a pass rate per scenario and overall, for one model at a time.

The maintainer runs it by hand. It isn't part of CI or `npm test`: it needs a model and an API key, and it costs money. What it measures, against which hypotheses: [validation](../../docs/validation.md#skill-compliance-eval).

## How it works

- **The agent:** Claude Code, through promptfoo's Claude Agent SDK provider (`providers.yaml`). It has RepoMagpie's MCP server (`repomagpie mcp --allow-write`, from this repository's source) and the skill, as `repomagpie setup` would give it. Your own Claude Code settings, hooks, skills and MCP servers aren't loaded.
- **The journal and the project:** before each scenario, `fixture/journal` (11 notes) is copied to `.run/home/.magpie`, the personal journal, and `fixture/project` (a small Express app) to `.run/project`, where the agent works. Your real `~/.magpie` is never read: the MCP server runs with `MAGPIE_HOME` pointing at `.run/`.
- **Nothing runs:** Bash, Edit and Write are available to the agent but never allowed, so an `npm install` is tried and denied, never run. The checks count what the agent tried. Only the MCP tools and reading files work.
- **One message per scenario.** When a scenario needs an earlier part of the session (an offer already made, a "no" already said), the prompt tells it in brackets.
- **The checks** (`assertions.mjs`) are plain code, no model grades anything: recall before an install, no install after an avoid note, the Verdict and alternatives in the reply, the domains in a search, one offer and nothing saved before the answer, a saved Verdict in the user's words only, no delete, no project journal write, the journal unchanged on disk. Two run in every scenario: only the user's words saved, and no delete or adopt.

## What it needs

- **Node.js 22.22 or later.** promptfoo 0.124.1 needs it; RepoMagpie itself runs on 22.12 and later.
- **promptfoo and the Claude Agent SDK, installed here only:** in `evals/skill/`, run `npm install`. `package.json` pins exact versions, each at least two weeks old when chosen: `promptfoo` 0.124.1 (2026-10-08) and `@anthropic-ai/claude-agent-sdk` 0.3.296 (2026-10-09). They never go in the repository's `package.json` or in the published package, which holds only `dist/` and `skills/`.
- **Their licences:** promptfoo is MIT. The Claude Agent SDK's `license` field is "SEE LICENSE IN README.md": Anthropic's terms, not an open-source licence. Read them before you install it.
- **An Anthropic API key**, below.

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

## What it costs

No run has been measured yet. The provider stops a scenario once it has cost $0.50 (`max_budget_usd`), or after 12 turns (`max_turns`). So one run of the dry scenario costs at most about $0.50, and one run of the full set at most about 25 × $0.50 = $12.50, times `--repeat`. The cap is checked as the agent goes, so a scenario can go slightly over it.

Each report says what that run cost, as promptfoo counted it. Use those numbers, not this estimate, once you have them.

## Reading the results

`run.mjs` prints the report and writes it to `.run/report.md`:

```
# Skill compliance: claude-code/<model>, <date>

promptfooconfig.yaml, <n> runs per scenario. Overall: <passed>/<runs> (<rate> %). Cost: $<cost>, as promptfoo reports it.

| Scenario | Passed | Rate | Why it failed |
|---|---|---|---|
| avoid note: pdfkit is not installed; the reply quotes the Verdict and asks | <passed>/<runs> | <rate> % | <the first failing check's reason> |
```

- **Rate:** the share of runs where every check of the scenario passed.
- **Why it failed:** the first failing check's reason, such as `pdfkit was installed before it was recalled` or `saved words the user didn't say: "handy for JSON Schema"`.
- **A warning about resets** means promptfoo's `beforeEach` hook didn't run for each scenario, so scenarios may have seen each other's notes. Treat that run as void.
- **Everything else:** `.run/results.json` has promptfoo's full results. To browse them, run `npx promptfoo view` with `PROMPTFOO_CONFIG_DIR` set to `.run/promptfoo`, where `run.mjs` keeps promptfoo's files.

`.run/` is git-ignored. Each run replaces it.

## What it doesn't measure

- **Other agents.** Only Claude Code. Codex CLI, Cursor, Gemini CLI, Copilot CLI and Antigravity CLI would each need their own provider.
- **The hook.** RepoMagpie's install hook isn't set up here: this eval measures the skill. The hook has its own tests (`src/hook/`).
- **Real sessions.** A scenario is one message, with any earlier part of the session told in brackets. After a denied install the agent reports the failure, which it wouldn't in a real session.
- **The project journal.** The fixture has a personal journal only.
- **Stable numbers.** Results change between runs, and with each Claude Code and model release. Record the date, the model and the versions with every number.

## What isn't checked yet

The provider's config keys (`providers.yaml`) and the shape of its tool calls come from promptfoo's documentation, read on 2026-10-25, not from a run. So does the `beforeEach` extension hook (`hooks.mjs`). The dry scenario is the first run that checks them.

## Files

| File | What it is |
|---|---|
| `run.mjs` | Starts the eval and writes the report |
| `providers.yaml` | Claude Code with RepoMagpie's MCP server and skill |
| `dry.yaml` | The dry scenario |
| `promptfooconfig.yaml`, `scenarios.yaml` | The full set |
| `assertions.mjs` | The checks |
| `self-check.mjs` | The checks on canned tool calls |
| `fixture.mjs`, `hooks.mjs` | `.run/`, and its reset before each scenario |
| `fixture/journal`, `fixture/project` | The journal and the project every scenario starts from |
| `package.json` | The two pinned packages, for this folder only |
