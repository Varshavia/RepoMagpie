# 0054 — Discover: results that fit

**Status:** accepted (2026-10-31, from the maintainer's brief, §3b). Refines [0045](0045-discover.md): rule 3 (how a domain's requests are merged) and rule 7 (the default sort). 0045 stays as written for everything else; its index row points here.

## Context
Discover's first results were often not tools. On 2026-10-31, with a token, the top 10 of a domain search held 4 lists for `security` (book-of-secret-knowledge, Awesome-Hacking, cs-video-courses, PayloadsAllTheThings), 4 for the old `styling` (system-design-primer, 30-seconds-of-code, Web-Dev-For-Beginners, Front-End-Checklist), 1 for `ai` and 1 for `testing`. Lists collect stars, and stars were the default sort.

Two more problems:
- **Best match merged by name.** A domain search sends one request per topic and merges them. Every item GitHub's search returns has `"score": 1` (checked on 2026-10-31 with `gh api` GET on three queries), so sorting the merged list by score left it in name order.
- **No reason shown.** A card didn't say why it was there: which of the domain's topics found it, or which words matched.

## Decision
1. **Lists and courses are hidden by default.** A result is a list or course when its topics include `awesome`, `awesome-list`, `awesome-lists`, `lists`, `cheatsheet`, `cheatsheets`, `cheat-sheet`, `courses`, `books`, `tutorials`, `learning-resources`, `interview-questions` or `education`, or its repository name starts with `awesome-` or `learn-` (or `_`), ends with `-course`, `-tutorial`, `-cheatsheet` or `-book` (or their plurals), or is one of those words alone. `--include-lists`, `include_lists=true` and the app's "Show lists and courses" show them; so does the `awesome-list` kind. The hidden ones are counted (`lists_hidden`), and a line says so: `7 lists and courses hidden; --include-lists shows them.` in the CLI, "7 lists and courses hidden." with **Show** in the app. They are hidden from the page GitHub sent, so a page can show fewer than its limit; the requests don't change, so Show is answered from the cache.
2. **The default sort follows the words.** Best match when the search has words, stars when it has only filters. A sort the person chose is kept. The app's Sort shows the default until one is chosen.
3. **Best match merges by rank.** Each request's first result, then each one's second, and so on; a repository found twice keeps its first place. Stars, forks and updated are sorted again after the merge, as before.
4. **Each result says why it is there.** `matched_topics`: the domain's or kind's topics whose request found it. `matched_words`: the search's words that start a word of its name, description or topics (a word with a hyphen or a dot may match anywhere), so `ui` doesn't match "guide". GitHub matches other forms of a word too, so this can be empty. The app shows "Matched topic: react · matched words: design, system".
5. **"Hide ones I already have"**, in the app only, off by default: hides, at once and without a search, the results a journal has a note on, and the count says how many. The CLI and the API have no such filter: `in_journal` is in every result.

## Measurements
- **The 159 labelled repositories** of the classification and retrieval fixtures: the rule hides exactly their 4 awesome-lists and nothing else.
- **80 Discover results labelled by hand:** it hides 10 of the 13 lists and courses, and nothing else. The ones it misses, such as nodebestpractices and app-ideas, have none of the topics and an ordinary name.
- **The top 10 above, after the rule:** security 4 lists → 0 (shannon, x64dbg, mitmproxy and sniffnet take their places); old styling 4 → 1 (app-ideas stays); ai 1 → 0 (prompts.chat out, dify in); testing 1 → 1 (nodebestpractices stays).
- **One wrong hide found since:** `cheat/cheat`, a CLI for cheatsheets, has the `cheatsheet` topics, so it is hidden. In the recorded "design system" page the end-to-end tests use, the rule hides 7 of 20: 6 lists, courses or interview guides, and `cheat/cheat`. Show brings it back.

## Consequences
- A domain search's first page shows tools first, and the person sees how many lists were left out and can bring them back with one click.
- A page can show fewer results than its limit; "More results" and `--page` still page through GitHub's results, each page with its own count.
- `--json` adds `lists_hidden`, `query.include_lists`, and on each result `matched_topics`, `matched_words` and `list_or_course` (additions). `query.sort` is `best` by default when there are words: a script that relied on stars for word searches passes `--sort stars`.
- The cache file is version 3: it keeps which topics found each result. A version 2 file starts empty.
- The rule is a word list. A list with none of the words shows; a tool with one of them hides. It is measured above, and the line and Show make either visible.
