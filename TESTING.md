# Testing the beta

**English** · [Türkçe](docs/testing/TESTING_tr.md)

Thank you for testing RepoMagpie for a week. Day 1 takes about 20 minutes. After that, you use your coding agent as usual and write a line when you pick or drop a package. On day 7 you answer a short form.

## Before you start

- **Node.js 22.12 or later.** Check with `node --version`.
  - Windows: install the LTS version from [nodejs.org](https://nodejs.org/).
  - macOS: install it with [Homebrew](https://brew.sh/): `brew install node`. The installer from nodejs.org works too, but then `npm install -g` can fail (see "Known traps" below).
- **A coding agent.** Any of the seven in the README's [table](README.md#what-each-agent-gets): Claude Code, Codex CLI, Cursor, Gemini CLI, VS Code (GitHub Copilot), Antigravity CLI or Copilot CLI. VS Code has no hook: there, the check before an install depends on the agent following the skill.

## Day 1 (about 20 minutes)

### 1. Install, set up and check

```bash
npm install -g repomagpie@beta
repomagpie setup
repomagpie doctor
```

- `setup` lists the agents it found, shows what it will change in which file, and asks first. It backs up every file before it changes it. To see the plan without changing anything, run `repomagpie setup --dry-run`.
- When `setup` says so, restart your agents.
- `doctor` shows what is wired in each agent and ends with a "To do" list. **Take a screenshot of its output.**

### 2. Known traps

- **Windows PowerShell says "running scripts is disabled on this system".** PowerShell's default execution policy blocks npm's `.ps1` scripts. Use `repomagpie.cmd` instead of `repomagpie` (and `npm.cmd` instead of `npm`), or run the commands in Command Prompt.
- **macOS: `npm install -g` fails with `EACCES`.** Node from the nodejs.org installer puts global packages in a folder your user can't write to. Don't use `sudo`. Install Node with Homebrew instead (`brew install node`), then run `npm install -g repomagpie@beta` again. npm's page on [EACCES errors](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally) has other ways.
- **Codex CLI runs a new hook only after you trust it.** Open `/hooks` in Codex and trust RepoMagpie's hook. Run `repomagpie doctor` again: the Codex line says `trusted`.
- **You switch Node.js versions** (nvm, fnm, Volta). `setup` writes the path of the Node.js it ran with. After a switch, run `repomagpie doctor`, then `repomagpie setup` again.
- **GitHub's limit.** Without a token, GitHub allows 60 requests an hour, and a note from a GitHub URL makes a few. If you hit the limit, wait an hour, or give RepoMagpie your GitHub CLI's token for the current shell: `export GITHUB_TOKEN=$(gh auth token)`, or in PowerShell `$env:GITHUB_TOKEN = gh auth token`.

### 3. Write three notes from your own experience

Use packages you really used. The text in quotes is your Verdict: one line, in your words.

`--type npm` says the name is an npm package. Inside a project, RepoMagpie reads that from its `package.json`, `pyproject.toml` or `Cargo.toml`; elsewhere it can't tell npm, PyPI and crates.io apart, and asks. For the others, write `--type pypi` or `--type cargo`.

1. A package you dropped. Start the Verdict with `avoid:`, and name what you use instead with `--alternative`: your agent sees it with the note.

   ```bash
   repomagpie note pdfkit "avoid: async streams painful; use puppeteer" --type npm --alternative puppeteer
   ```

2. A package you like.

   ```bash
   repomagpie note zod "default for validating input" --type npm
   ```

3. A GitHub repository, without text. RepoMagpie fetches its description, licence and topics, and the note goes to your inbox for review in step 6.

   ```bash
   repomagpie note https://github.com/microsoft/playwright
   ```

Replace `pdfkit`, `puppeteer`, `zod` and the URL with your own.

### 4. Ask your agent to install the package you noted to avoid

Open your agent in a test folder, not in a real project, and ask: "Install pdfkit" (your package from note 1). When RepoMagpie stops it or asks, answer No.

Write down what happened:
- Did the agent ask you before installing?
- Did you see a line starting with `RepoMagpie:`?
- What exactly did you see? A screenshot helps.

What to expect: in Claude Code, Gemini CLI and Antigravity CLI the hook asks you. In Codex CLI, Cursor and Copilot CLI it stops the first try, and your agent should ask you. In VS Code, the agent should check your notes and ask.

### 5. Ask your agent about your notes

Ask: "What do I have for …?", with words about one of your notes ("What do I have for validation?"). Write down whether it found the note.

### 6. Open the app

```bash
repomagpie ui
```

It opens your journals in the browser.

1. **Review the inbox note** from step 3: write a Verdict, set kind, tags and rating, and press Ctrl+Enter (Cmd+Enter on macOS).
2. **Delete a test note and undo it.** Write a note to throw away first:

   ```bash
   repomagpie note left-pad "test: delete me" --type npm
   ```

   In the app, open it, press **Delete note**, confirm, then press **Undo** in the message that appears. You have 10 seconds. The note should be back.

Stop the app with Ctrl+C in its terminal.

## Days 2 to 7

- Work as usual.
- When you pick or drop a package, write one line (`repomagpie note <name> "<why>" --type npm`), or ask your agent to save it to RepoMagpie.
- Nothing else is required.

## Day 7: send your feedback

Open a [Beta feedback issue](https://github.com/Varshavia/RepoMagpie/issues/new?template=beta-feedback.yml). It asks nine short questions. To answer privately instead, send the same answers to the maintainer.

`repomagpie doctor` shows how many notes each journal has.

## When something breaks

Send:
- the output of `repomagpie doctor --json`;
- the command you ran, and what you saw;
- your OS, your Node.js version (`node --version`) and the agent.

`doctor --json` replaces secret-looking values in the config files it reads (tokens, API keys, passwords) with `<redacted>`, and shows environment variables by name only. It does **not** hide paths: they include your home folder, so your user name. Replace it before you paste, if you want.

## Removing it

```bash
repomagpie setup --remove
npm uninstall -g repomagpie
```

`setup --remove` takes out only RepoMagpie's own MCP entries, hooks and skill folders, and never restores a backup over your later changes. Run it before `npm uninstall`.

It leaves:
- your notes, in `~/.magpie` and any project's `.magpie/`;
- `setup`'s backups. Run `repomagpie doctor` before the uninstall to list them, and delete the ones you no longer need. Copies of `~/.claude.json` can hold sign-in tokens.

Antigravity CLI can keep listing a removed entry until you clear `~/.gemini/antigravity-cli/mcp/`.
