# Validation

Results of roadmap step 1.5: developer interviews, a hands-on competitor review, and the demo scenario. The findings update [vision.md](vision.md), and each decision listed in the [roadmap](roadmap.md) gets a decision record.

**Status:** desk research recorded (see "Desk research" below). No interviews were run: the maintainer decided to close step 1.5 with desk research instead.

## Interviews

### Plan

Not run (see Status). The plan, rules and questions are kept for reference; the questions also structure the desk research.

Originally: start with at least 3 real interviews, one per profile:
- a heavy coding-agent user
- a security-minded engineer
- a student

Add more interviews if the patterns are still unclear after these three.

### Rules

- **Don't pitch the idea.** Ask about what people do today, not whether they'd like RepoMagpie.
- **Privacy:** this file is public. Record a first name or a role only, never a full name, email, employer or handle. Ask before quoting anyone.
- Keep answers short and refer to questions by number (Q1–Q10).
- **The one-liner comes last.** Show it only after the original eight questions and Q9–Q10 are answered, then record the reaction.

### Questions

The questions ask about past behaviour, not hypothetical use.

1. When did you last go back to a repository you starred? How did you find it?
2. Where do you look when you need a new tool or library?
3. When did you last install something your coding agent suggested? Did you check it first? How?
4. Have you ever installed a package again after forgetting it went badly the first time? When was the last time?
5. When did you last check what an installed extension, plugin or skill actually does? What made you check?
6. Whose opinion do you rely on when choosing a tool? Whose recommendation did you last act on?
7. Do you use Obsidian's graph view, or any graph view? What do you actually do with it?
8. Where did you last write something down about a tool you found? Can you show me?

Then, after the eight:

9. Has your team ever adopted a dependency it had already rejected before? How did you find out?
10. Where would someone on your team look to find out why you chose a library?

Only after these may the interviewer show the one-liner ([decision 0009](decisions/0009-positioning-dependency-memory.md)) and record the reaction:

> RepoMagpie remembers what you and your team learned about every dependency, and tells your coding agent before it installs one.

### Desk research (secondhand evidence)

The maintainer decided not to run interviews. Step 1.5 closes with desk research instead. One row per question; sources were checked on 2026-10-03.

| Q | Finding | Sources |
|---|---|---|
| Q1 | Stars work as "look at this later" bookmarks that get forgotten. The maker of Starcat built it after collecting 1,800+ starred repositories with "no way to find the one I actually needed". | [jcs.org note (2022)](https://jcs.org/notes/2022/07/14/529220892481516752); [Starcat on Product Hunt](https://www.producthunt.com/products/starcat-2) (maker's comment) |
| Q2 | Developers' main community platforms are Stack Overflow (84.2%), public GitHub (66.9%) and YouTube (60.5%). | [Stack Overflow Developer Survey 2025, Technology: Community platforms](https://survey.stackoverflow.co/2025/technology) |
| Q3 | 46% of developers distrust the accuracy of AI tools, up from 31% in 2024. Code LLMs suggested non-existent packages in 19.7% of cases on average (16 models); the 2026 frontier models still do so at 4.62–6.10%. | [Stack Overflow 2025 press release](https://stackoverflow.co/company/press/archive/stack-overflow-2025-developer-survey/); [Spracklen et al., USENIX Security 2025](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen); [Churilov, arXiv 2605.17062](https://www.alphaxiv.org/abs/2605.17062) |
| Q4 | No direct data on repeat installs. Decision-record literature says teams can't answer "why did we choose X?", that ADRs are "praised universally and practised sporadically", and that a routine library choice "does not warrant an ADR". | [Catio, ADR guide (2026)](https://www.catio.tech/blog/architecture-decision-record); [Java Code Geeks (2026)](https://www.javacodegeeks.com/?p=143468) |
| Q5 | GitHub confirmed in May 2026 that a poisoned version of a VS Code extension (Nx Console) on one employee's device led to the theft of ~3,800 internal repositories. The average developer has about 40 IDE extensions, and extensions update automatically, without explicit review. | [BleepingComputer (2026-05-20)](https://www.bleepingcomputer.com/news/security/github-confirms-breach-of-3-800-repos-via-malicious-vscode-extension/); [Security Boulevard (2026-05-20)](https://securityboulevard.com/2026/05/the-extension-blind-spot-how-one-vs-code-plugin-gave-attackers-githubs-source-code/), citing Koi Security research; [BlueOptima (2026-01-21)](https://www.blueoptima.com/post/vs-code-extension-security-risks-the-supply-chain-that-auto-updates-on-your-developers-laptops) |
| Q6 | 75.3% of developers say they would still ask a person "when I don't trust AI's answers", the top reason given. | [Stack Overflow Developer Survey 2025, AI](https://survey.stackoverflow.co/2025/ai) |
| Q7 | On the Obsidian forum, graph view is widely reported as not useful: "nothing than a bunch of dots", "never seen the point … other than 'hey look at this!'". A minority use the local graph or filters. | [Obsidian forum: "What's the point of the graph view?" (2023)](https://forum.obsidian.md/t/whats-the-point-of-the-graph-view-how-are-you-using-it/71316); [Obsidian forum: "You All Say the Graph Is Useless…"](https://forum.obsidian.md/t/you-all-say-the-graph-is-useless-let-me-show-you-how-to-use-it/116738) |
| Q8 | No strong evidence found on whether developers write notes about the tools they find. Open. | — |

**Limits.** This evidence is secondhand: other people's surveys, papers, articles and forum threads, chosen by us. Survey respondents and forum posters are self-selected. None of them are RepoMagpie's users. There is no direct data on repeat installs (Q4) or on note-taking (Q8).

**Hypothesis status after desk research**

| Hypothesis | Status | Why |
|---|---|---|
| H1 Note-taking friction | **Open** | No evidence either way (Q8). To be tested by the v0.1 beta. |
| H2 Vet and drift as a hook | **Real, but crowded** | The risk is real (Q3, Q5), and many tools already address it ([competitors](competitors.md), B and C). |
| H3 Bigger pain for teams | **Supported** | Teams lose the "why" behind choices, and library-level decisions fall below the threshold for a decision record (Q4). |
| H4 Graph views as a showcase | **Confirmed** (secondhand) | Widely reported as not useful for real work (Q7). |

### Pre-interview hypotheses (synthetic, not evidence)

These hypotheses came from a simulated exercise before any interview. They are **not interview data**, and **no step 1.5 decision may rest on them**. They only tell the interviewer what to listen for. Each one lists what real interviews would need to show to confirm or reject it.

**H1. Note-taking friction may be the biggest risk.** Many developers don't take notes, so [decision 0005](decisions/0005-human-written-usefulness.md)'s rule that the user writes every "When it's useful" section may lose most users at the first step.
- *Confirm:* in Q8, most interviewees can't point to anything they wrote about a tool they found, or only to notes they started and abandoned. Secondary: in Q1 and Q2 they find tools again by memory, search or stars, never by notes they wrote.
- *Reject:* in Q8, most interviewees show a recent note about a tool (a list, a README, a notes app, a comment on a bookmark). Secondary: in Q1 and Q2 they mention going back to their own notes.

**H2. Vet and drift may be a stronger hook than proactive recall**, including "you have NOT reviewed this package" warnings (relevant to hallucinated-package attacks).
- *Confirm:* in Q3, interviewees describe checking what their agent suggested before installing it. In Q5, they describe a recent check of what an extension, plugin or skill does, prompted by a safety concern, an upstream change, or a malicious or made-up package. Q4 brings few or no repeat-install stories.
- *Reject:* in Q3 and Q5, interviewees can't recall checking an agent's suggestion or an installed extension, plugin or skill, while several tell Q4 stories about reinstalling something that went badly before.

**H3. The pain may be bigger for teams than for individuals.** Review notes get lost in wikis.
- *Confirm:* in Q9 and Q10, or when interviewees mention a team in Q2 or Q6, they describe tool reviews or decisions that were written down but could not be found later, or the same tool being evaluated twice. Follow-up when a team comes up: "How did your team record the last tool it evaluated? Where is that now?"
- *Reject:* interviewees who work in teams say tool choices are settled in conversation and nobody looks for old reviews, or they find them easily.

**H4. Graph views are a showcase, not a working tool.** Keep them for marketing; don't over-invest.
- *Confirm:* in Q7, interviewees who have a graph view describe opening it rarely, mostly to look at it or show it, not to find or decide something.
- *Reject:* several interviewees describe a recent, specific task they did with a graph view, such as finding related notes or spotting a gap.

### Synthetic interview S1 (not evidence)

S1 is a simulated interview, like the hypotheses above. It was not a real person, it is **not interview data**, and **no step 1.5 decision may rest on it**. It suggested:
- manual vetting of every package an agent suggests;
- a repeat install of a library abandoned earlier for the same reason;
- tool notes with a one-line decision;
- no use of graph views.

Like H1–H4, it only tells the interviewer what to listen for. It is not in the notes table below.

### Notes

Real interviews so far: **0 of 3**.

| # | Date | First name or role | Profile | Answers (Q1–Q10) | Reaction to the one-liner | Notable quotes (with permission) |
|---|---|---|---|---|---|---|
| 1 | | | heavy coding-agent user | | | |
| 2 | | | security-minded engineer | | | |
| 3 | | | student | | | |

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
| The v0.1 command set and the release themes | [0010](decisions/0010-v0-1-scope.md) |
