# Working as a team

A team keeps its dependency rules in the repository, next to the code. This page says how to start, how to review a rule, and what happens when a rule and someone's own note disagree.

## What the project journal is

The project journal is a `.magpie/` folder at the root of a git repository. It holds one Markdown note per package, like your personal journal, and it is committed with the code.

- A teammate gets it with `git pull`. From then on, their agent's `recall`, the install hook, `search` and `suggest` read it, next to their own journal.
- Only notes, `.magpie/.gitignore` and `tags.md` are committed. The caches and the trash stay out (the `.gitignore` lists them).
- Anyone who can read the repository can read its notes. Don't put secrets in them.

Outside a git repository there is no project journal ([decision 0051](decisions/0051-no-project-journal-outside-git.md)).

## Starting one

Any of these creates `.magpie/` with its `.gitignore` and `tags.md`:

- **The app:** run `repomagpie ui` in the repository and choose **Project**. It names the repository, for example `acme/widget` on github.com. Click **Turn on shared notes for acme/widget**. Under the name, a line says whether the shared notes are committed and pushed yet. It reads only your local git, so it doesn't know about your teammates' new notes until you pull.
- **Your agent:** ask it to note something for the team, in your words: "We don't use moment here; note it for the team: date-fns instead, moment is unmaintained and big." It writes to the project journal and tells you `.magpie/` was created.
- **The command line:** `repomagpie note moment "avoid: unmaintained and big; use date-fns" --to project`.

To share one of your own notes, use **Copy to this project** on it in the app, or `repomagpie adopt <name>`. Then commit:

```sh
git add .magpie
git commit -m "Add our note on moment"
```

## Reviewing rules with pull requests

A change to `.magpie/` is a change to the code, so it goes through a pull request like any other.

- **A note without a Verdict is a proposal.** It sits in the project inbox: anyone can add one, for example when a new dependency comes up.
- **A lead writes the Verdict and approves the pull request.** The Verdict is the decision: "avoid: unmaintained and big; use date-fns".

To make leads the only approvers of rule changes, add a line to `.github/CODEOWNERS` and turn on "Require review from Code Owners" for the main branch:

```
/.magpie/ @your-org/leads
```

## When a rule and a personal note disagree

The project note wins: it is the team's decision for this repository. Personal notes stay as context.

- `recall` and the install hook list the project note first, then the personal one.
- The agent follows the project note and mentions the personal one. When the project note says to avoid a package, the hook asks before the install, whatever the personal note says.
- Changing a project note changes it for everyone on the repository, so the agent does it only when you ask.

## What's coming

After launch, team features build on git, not on a server: a CI check that fails a pull request adding an avoided package, a block mode per project, a sync button in the app, a draft note for each new dependency, a chat notice when `.magpie/` changes, and an organisation journal. The list and its order are in the [roadmap](roadmap.md#teams-after-launch).
