# Validation

Results of roadmap step 1.5: developer interviews, a hands-on competitor review, and the demo scenario. The findings update [vision.md](vision.md), and each decision listed in the [roadmap](roadmap.md) gets a decision record.

**Status:** template. Nothing recorded yet.

## Interviews

### Plan

Start with at least 3 real interviews, one per profile:
- a heavy coding-agent user
- a security-minded engineer
- a student

Add more interviews if the patterns are still unclear after these three.

### Rules

- **Don't pitch the idea.** Ask about what people do today, not whether they'd like RepoMagpie.
- **Privacy:** this file is public. Record a first name or a role only, never a full name, email, employer or handle. Ask before quoting anyone.
- Keep answers short and refer to questions by number (Q1–Q7).

### Questions

The questions ask about past behaviour, not hypothetical use.

1. When did you last go back to a repository you starred? How did you find it?
2. Where do you look when you need a new tool or library?
3. Do you ask your coding agent for tool recommendations? Do you trust them?
4. Have you ever installed a package again after forgetting it went badly the first time? When was the last time?
5. If a skill you installed changed after you reviewed it, how would you find out? What would you do?
6. Whose opinion do you rely on when choosing a tool? Whose recommendation did you last act on?
7. Do you use Obsidian's graph view, or any graph view? What do you actually do with it?

### Pre-interview hypotheses (synthetic, not evidence)

These hypotheses came from a simulated exercise before any interview. They are **not interview data**, and **no step 1.5 decision may rest on them**. They only tell the interviewer what to listen for. Each one lists what real interviews would need to show to confirm or reject it.

**H1. Note-taking friction may be the biggest risk.** Many developers don't take notes, so [decision 0005](decisions/0005-human-written-usefulness.md)'s rule that the user writes every "When it's useful" section may lose most users at the first step.
- *Confirm:* most interviewees have never kept written notes on tools they found, or started and stopped. In Q1 and Q2 they find tools again by memory, search or stars, never by notes they wrote.
- *Reject:* most interviewees already write something about tools they keep (a list, a README, a notes app, comments on bookmarks), and can show a recent example.

**H2. Vet and drift may be a stronger hook than proactive recall**, including "you have NOT reviewed this package" warnings (relevant to hallucinated-package attacks).
- *Confirm:* in Q5, interviewees describe a real past case of a dependency or skill changing, or of a malicious or made-up package, and that it mattered to them. In Q3 they describe checking what their agent suggests before installing it. Q4 brings few or no repeat-install stories.
- *Reject:* no interviewee has checked what an agent installs or noticed an upstream change, while several tell Q4 stories about reinstalling something that went badly before.

**H3. The pain may be bigger for teams than for individuals.** Review notes get lost in wikis.
- *Confirm:* when interviewees mention a team in Q2 or Q6, they describe tool reviews or decisions that were written down but could not be found later, or the same tool being evaluated twice. Follow-up when a team comes up: "How did your team record the last tool it evaluated? Where is that now?"
- *Reject:* interviewees who work in teams say tool choices are settled in conversation and nobody looks for old reviews, or they find them easily.

**H4. Graph views are a showcase, not a working tool.** Keep them for marketing; don't over-invest.
- *Confirm:* in Q7, interviewees who have a graph view describe opening it rarely, mostly to look at it or show it, not to find or decide something.
- *Reject:* several interviewees describe a recent, specific task they did with a graph view, such as finding related notes or spotting a gap.

### Notes

| # | Date | First name or role | Profile | Answers (Q1–Q7) | Notable quotes (with permission) |
|---|---|---|---|---|---|
| 1 | | | heavy coding-agent user | | |
| 2 | | | security-minded engineer | | |
| 3 | | | student | | |

### Patterns

What came up in more than one interview, and what it means for the [ideas](ideas.md) and their target releases.

-

## Competitor review

Try each tool hands-on, except where noted. Background: [competitive landscape](competitors.md).

### GithubStarsManager

<https://github.com/AmintaCCCP/GithubStarsManager>

- **Tried on:** (date, version)
- **Setup:** what it took to get a first useful result
- **What works:**
- **What doesn't:**
- **Compared with RepoMagpie:**

### Obsidian "GitHub Integration" plugin

<https://community.obsidian.md/plugins/github>

- **Tried on:** (date, plugin version, Obsidian version)
- **Setup:**
- **What works:**
- **What doesn't:**
- **Compared with RepoMagpie:**

### Starcat

<https://github.com/starcat-app/Starcat>

README only: Starcat is macOS-only.

- **Read on:** (date)
- **What it claims:**
- **Compared with RepoMagpie:**

## 30-second demo scenario

The script for the demo GIF ([marketing](marketing.md)): what is typed, what appears, and the one moment the viewer should remember.

1.

## Decisions

Each decision gets a decision record in [decisions](decisions/README.md). Link it here when it exists.

| Decision | Record |
|---|---|
| Soften [decision 0005](decisions/0005-human-written-usefulness.md) (AI suggests, human confirms)? | |
| Import stars as inbox suggestions? | |
| The v0.1 command set and the release themes | |
