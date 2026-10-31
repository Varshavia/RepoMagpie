// A list as people paste it into Import or a file for magpie import (spec §2, lenient read): each
// form, headings, prose, a repeat and a code fence. The CLI and the app's API read it the same way.
export const PASTE = [
  "Here are the repos I mentioned:", // 1: a heading, skipped without a word
  "", // 2: blank
  "https://github.com/thedotmack/claude-mem.git", // 3
  "1. [playwright-cli](https://github.com/microsoft/playwright-cli/tree/main) - browser checks", // 4
  "* pkg:npm/pdfkit — verdict: avoid for large reports", // 5
  "• https://github.com/thedotmack/claude-mem/", // 6: skipped, line 3's repository
  "2) pkg:cargo/ripgrep", // 7
  "```", // 8: skipped
  "## **Security tools:**", // 9: a heading
  "- `chalk`", // 10: a name in backticks
  "I mostly use these at work.", // 11: skipped
].join("\n");
