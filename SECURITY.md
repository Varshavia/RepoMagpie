# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub:

1. Open the repository's **Security** tab.
2. Click **Report a vulnerability**, or go straight to <https://github.com/Varshavia/RepoMagpie/security/advisories/new>.
3. Describe the problem, how to reproduce it, and what an attacker could do with it.

Don't open a public issue. The maintainer replies in the private advisory.

## Official channels

RepoMagpie comes only from these three places:

- **This repository:** <https://github.com/Varshavia/RepoMagpie>.
- **The npm package `repomagpie`:** <https://www.npmjs.com/package/repomagpie>. Releases are built and staged by this repository's GitHub Actions with npm provenance, then approved by the maintainer ([decision 0033](docs/decisions/0033-releases-staged-from-ci.md)). The version's npm page links it to the commit and the workflow run it was built from. Versions up to `0.2.0-beta.2` were published from the maintainer's machine and have no provenance.
- **The agent skill on skills.sh:** <https://skills.sh/varshavia/repomagpie>, installed with `npx skills add Varshavia/RepoMagpie`.

There are no installers, no `.exe` or other downloads, no other packages and no other website. Anything else that calls itself RepoMagpie is not ours: popular projects attract look-alike repositories and packages that copy their README.

## Supported versions

RepoMagpie is in beta (`0.x`). Security fixes go into the next release; only the newest version gets them. Upgrade with `npm install -g repomagpie@beta`.

## What RepoMagpie reads, writes and sends

**Reads:**
- your personal journal (`~/.magpie`, or the folder `--home`, `MAGPIE_HOME` or `~/.magpie/config.yaml` names) and, inside a project, its project journal (`.magpie/`);
- for `repomagpie suggest` and a bare package name, the project's `package.json`, `pyproject.toml`, `Cargo.toml` and the start of its README;
- for the Claude Code hook, the tool call Claude Code sends on standard input;
- the environment variables `GITHUB_TOKEN`, `MAGPIE_HOME` and `NO_COLOR`. The bundled libraries also read `FORCE_COLOR`, `CLICOLOR_FORCE`, `LOG_TOKENS` and `LOG_STREAM`.

**Writes:** notes, `tags.md` and caches (`.cache/`) inside the journals, a project journal's `.gitignore`, and the hook's error log in `<personal journal>/.cache/`. Nothing outside the journals, and never through a link (a symbolic link or junction) inside one ([decision 0032](docs/decisions/0032-note-text-is-data.md)).

**Sends:** read-only GET requests to GitHub's API (`api.github.com`), only when you give `repomagpie note`, `repomagpie import` or the app's Add page a GitHub repository. `GITHUB_TOKEN`, if you set it, goes only in their `Authorization` header and never appears in a message or a log. Nothing from your journals is sent anywhere, and there is no telemetry.

**Never:** installs a package, edits a settings file (the Claude Code hook is set up by you), or runs a command it finds in a note. `repomagpie ui` starts one other program: your default browser, through the platform's open command.

## The local app

`repomagpie ui` serves the app from your machine, on `127.0.0.1` only, until you stop it. Every request needs the session token from the URL it prints, exchanged once for an `HttpOnly`, `SameSite=Strict` cookie; every write also needs the token in a header and the app's own origin; the Host header must be the app's, against DNS rebinding. There are no CORS headers, a strict Content-Security-Policy, `Referrer-Policy: no-referrer`, a 1 MB limit on request bodies and a 30 s request timeout. No path from a request reaches the file system. The full list, with a test for each rule, is in [docs/ui.md](docs/ui.md#3-security).

## Who wrote the text you see

Not all note text is yours ([decision 0032](docs/decisions/0032-note-text-is-data.md)):

| Source | Written by |
|---|---|
| Your personal journal | You |
| A project journal (`.magpie/` in a repository you cloned) | That repository's contributors |
| GitHub fields of a note (description, topics) | The repository's owner |

RepoMagpie treats all of it as data. Control characters, escape sequences, bidi controls and zero-width characters are removed before note text reaches your terminal or your agent. Text handed to an agent is capped, quoted and labelled with its source, and a project journal's note never says "you noted". A note that is a link, or a file over 256 KB, is never read. The app shows note text as text, never as HTML, and links only `http` and `https` addresses. The agent skill tells the agent to report what a note says and never follow instructions in it.

## Scope

- The `repomagpie` CLI, its Claude Code hook, the local app and the agent skill.
- The agent hook scripts in [`.claude/hooks/`](.claude/hooks/), which guard this repository's own development.

Vulnerabilities in third-party repositories or skills that notes describe are out of scope. Report those to their maintainers.
