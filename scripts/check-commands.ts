// npm run check:commands: no doc tells someone to run `magpie …` (decision 0031). Machines and
// people run `repomagpie`; `magpie` is only an alias. Checks the Markdown files that check:links
// checks, except decision records and the changelog's released sections, which record what was true
// then. Exits 1 if a line runs magpie: a code span that starts with `magpie`, a line in a code block
// that starts with it, or a hook entry whose command is magpie. To allow one line (the alias
// sentence), put <!-- check:commands allow --> on it.
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { markdownFiles } from "./check-links.ts";

const ALLOW = "<!-- check:commands allow -->";
const RUNS = /^(\$\s*)?magpie(\s|$)/; // a code span's text or a code block's line, trimmed
const HOOK_ENTRY = /"command":\s*"magpie[\s"]/;

export function magpieCommands(text: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  let fence = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      return;
    }
    if (line.includes(ALLOW)) return;
    const runs = fence ? RUNS.test(line.trim()) : [...line.matchAll(/`([^`]+)`/g)].some(([, span]) => RUNS.test(span.trim()));
    if (runs || HOOK_ENTRY.test(line)) hits.push({ line: i + 1, text: line.trim() });
  });
  return hits;
}

// The changelog's text up to its first released section.
export function checkedText(file: string, text: string): string {
  if (basename(file) !== "CHANGELOG.md") return text;
  const released = text.search(/^## \[(?!Unreleased\])/m);
  return released === -1 ? text : text.slice(0, released);
}

export const filesToCheck = (root: string): string[] =>
  markdownFiles(root).filter((file) => !file.slice(root.length).replace(/\\/g, "/").replace(/^\//, "").startsWith("docs/decisions/"));

const main = () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const files = filesToCheck(root);
  let count = 0;
  for (const file of files) {
    for (const hit of magpieCommands(checkedText(file, readFileSync(file, "utf8")))) {
      count++;
      console.log(`  ${file.slice(root.length)}:${hit.line}: ${hit.text}`);
    }
  }
  console.log(`${files.length} files checked, ${count} ${count === 1 ? "line runs" : "lines run"} magpie instead of repomagpie`);
  process.exitCode = count ? 1 : 0;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
