// npm run check:fs-calls: no code in src/ or scripts/ calls fs.rmSync, fs.rm, rmdirSync with
// recursive, fs.cpSync or fs.cp. On Windows, some Node releases get paths with letters outside ASCII
// wrong in them: rmSync removes nothing and reports no error, cpSync writes under a mangled folder
// name or kills the process. src/core/copy-folder.ts has removeFolder and copyFolder instead, with
// the versions. CI's Node releases don't have these bugs, so the tests wouldn't catch a return to
// them; this check does. Also an import of rm, cp, rmSync or cpSync from node:fs or node:fs/promises,
// so an alias doesn't hide a call. Comments are skipped, and so is this check's own test.
// Exits 1 with each file, line, column and call.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OWN_TEST = "scripts/check-fs-calls.test.ts";
const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

const FORBIDDEN: { call: string; pattern: RegExp }[] = [
  { call: "fs.rmSync", pattern: /\brmSync\s*\(/g },
  { call: "fs.cpSync", pattern: /\bcpSync\s*\(/g },
  { call: "fs.rm", pattern: /\b(?:fs|promises)\.rm\s*\(/g },
  { call: "fs.cp", pattern: /\b(?:fs|promises)\.cp\s*\(/g },
  { call: "rmdirSync with recursive", pattern: /\brmdir(?:Sync)?\s*\([^;]*?\brecursive\b/g },
  { call: "an import of rm, cp, rmSync or cpSync", pattern: /\bimport\s*(?:type\s*)?(?:\w+\s*,\s*)?\{[^}]*\b(?:rm|cp|rmSync|cpSync)\b[^}]*\}\s*from\s*["'](?:node:)?fs(?:\/promises)?["']/g },
];

// The code files to scan: tracked and new under src/ and scripts/, not ignored; not this check's test.
export function filesToScan(root: string): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src", "scripts"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/).filter((file) => CODE.test(file) && file !== OWN_TEST).map((file) => resolve(root, file));
}

// Comments become spaces, so lines and columns stay where they were. A line comment starts at the
// line's start or after a space: "https://" in a string stays.
function withoutComments(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[ \t])\/\/.*$/gm, (comment, before: string) => before + blank(comment.slice(before.length)));
}

export function fsCalls(text: string): { line: number; column: number; call: string }[] {
  const code = withoutComments(text);
  const hits: { line: number; column: number; call: string }[] = [];
  for (const { call, pattern } of FORBIDDEN) {
    for (const match of code.matchAll(pattern)) {
      const before = code.slice(0, match.index);
      hits.push({ line: before.split("\n").length, column: before.length - before.lastIndexOf("\n"), call });
    }
  }
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}

const main = () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const files = filesToScan(root);
  let count = 0;
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // listed but gone (a deleted file not yet staged)
    }
    for (const hit of fsCalls(text)) {
      count++;
      console.log(`  ${file.slice(root.length)}:${hit.line}:${hit.column}: ${hit.call}`);
    }
  }
  console.log(`${files.length} files checked, ${count} ${count === 1 ? "call" : "calls"} to fs.rmSync, fs.rm, rmdirSync with recursive, fs.cpSync or fs.cp`);
  if (count) console.log("Use removeFolder or copyFolder from src/core/copy-folder.ts instead.");
  process.exitCode = count ? 1 : 0;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
