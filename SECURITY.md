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

## URLs and addresses in the package

Socket's "URL strings" alert (low) on the npm package says it holds fragments of external URLs or IP addresses. Every one in the published files (`0.2.0-beta.2`, the same in this branch's build), and what it does:

| URL or address | Where | At runtime |
|---|---|---|
| `https://api.github.com` | the CLI (`note`, `import`) and the app's Add page | **Contacted:** read-only GET requests, only for a GitHub repository you name (see "Sends" above). The only host RepoMagpie connects to |
| `127.0.0.1` | `repomagpie ui` | **Listened on:** the app's server binds to this local address only; your browser opens `http://127.0.0.1:<port>/` through the platform's open command |
| `http://localhost:<port>` | `repomagpie ui` | Compared, never contacted: a write's `Origin` header must be the app's own, as `127.0.0.1` or `localhost` |
| `https://github.com/<owner>/<repo>`, `https://www.npmjs.com/package/<name>`, `https://pypi.org/project/<name>/`, `https://crates.io/crates/<name>` | `note`, `import`, `adopt`, the app's Add page | Written, never contacted: the `url` field of a new note, built from the package's name. The app opens it in your browser only when you click "Open repository" |
| `https://github.com/Varshavia/RepoMagpie` | the app's Settings page; `package.json`'s `homepage`, `repository` and `bugs` | A link you can click, and npm's metadata |
| `https://github.com/microsoft/playwright-cli` | the app's Add and Import pages | Placeholder and example text in a form |
| `127.0.0.1` in the bundled `commander` | its launcher for executable subcommands, which pass on Node's `--inspect` port | Never runs: RepoMagpie has no executable subcommands |
| `24.5.1.1` | a comment in the bundled `yaml` | Not an address: a section number of the ECMAScript specification |
| `http://www.w3.org/…` | the bundled React, and the logo's SVG | XML namespace names (SVG, MathML, XLink), never fetched |
| `https://react.dev/errors/` | the bundled React | Text in React's error messages, which link to an explanation of the error code |
| `developer.mozilla.org`, `tc39.es`, `caniuse.com`, `www.typescriptlang.org` | comments in the bundled `minisearch`, `yaml` and `commander` | Comments |
| `github.com/phosphor-icons/core`, `www.sigmajs.org` | the app's third-party licence files | Licence text |
| `agentskills.io`, `cli.github.com`, and GitHub repositories (`microsoft/playwright-cli`, `AmintaCCCP/GithubStarsManager`, `starcat-app/Starcat`, `SocketDev/sfw-free`) | `README.md` | Links for the reader |

The app's Content-Security-Policy allows connections to its own origin only ([docs/ui.md](docs/ui.md#3-security)), so the browser side can't reach any of these hosts either; GitHub's API is called by the server.

## The local app

`repomagpie ui` serves the app from your machine, on `127.0.0.1` only, until you stop it. Every request needs the session token from the URL it prints, exchanged once for an `HttpOnly`, `SameSite=Strict` cookie; every write also needs the token in a header and the app's own origin; the Host header must be the app's, against DNS rebinding. There are no CORS headers, a strict Content-Security-Policy, `Referrer-Policy: no-referrer`, a 1 MB limit on request bodies and a 30 s request timeout. No path from a request reaches the file system. The full list, with a test for each rule, is in [docs/ui.md](docs/ui.md#3-security).

## Who wrote the text you see

Not all note text is yours ([decision 0032](docs/decisions/0032-note-text-is-data.md)):

| Source | Written by |
|---|---|
| Your personal journal | You |
| A project journal (`.magpie/` in a repository you cloned) | That repository's contributors |
| GitHub fields of a note (description, topics) | The repository's owner |

RepoMagpie treats all of it as data. Control characters, bidi controls and zero-width characters show as visible markers such as `<U+202E>` before note text reaches your terminal, your agent or the app, so an escape sequence does nothing and hidden text can't change how a line reads. Text handed to an agent is capped, quoted and labelled with its source, and a project journal's note never says "you noted". A note that is a link, or a file over 256 KB, is never read. The app shows note text as text, never as HTML, and links only `http` and `https` addresses. The agent skill tells the agent to report what a note says and never follow instructions in it.

## Scope

- The `repomagpie` CLI, its Claude Code hook, the local app and the agent skill.
- The agent hook scripts in [`.claude/hooks/`](.claude/hooks/), which guard this repository's own development.

Vulnerabilities in third-party repositories or skills that notes describe are out of scope. Report those to their maintainers.
