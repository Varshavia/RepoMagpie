// npm run check:characters: no repository file holds an invisible character that changes how text
// reads: bidi controls and marks, zero-width characters, the line and paragraph separators, or a
// byte-order mark ("Trojan Source"). Scans the tracked and new text files that git doesn't ignore.
// Exits 1 with each file, line, column and code point. A test or source that needs one of these
// characters builds it from its code point (String.fromCharCode(0x202e)).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const char = (code: number) => String.fromCharCode(code);
const INVISIBLE = new RegExp(`[${char(0x061c)}${char(0x200b)}-${char(0x200f)}${char(0x2028)}-${char(0x202e)}${char(0x2060)}${char(0x2066)}-${char(0x2069)}${char(0xfeff)}]`, "g");
const BINARY = /\.(png|jpe?g|gif|ico|svg|woff2?|ttf|pdf|tgz|zip)$/i;

// The text files to scan: tracked and new, not ignored, no binaries.
export function filesToScan(root: string): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/).filter((file) => file && !BINARY.test(file)).map((file) => resolve(root, file));
}

export function invisibleCharacters(text: string): { line: number; column: number; code: string }[] {
  const hits: { line: number; column: number; code: string }[] = [];
  text.split("\n").forEach((line, i) => {
    for (const match of line.matchAll(INVISIBLE)) {
      hits.push({ line: i + 1, column: (match.index ?? 0) + 1, code: `U+${match[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}` });
    }
  });
  return hits;
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
    for (const hit of invisibleCharacters(text)) {
      count++;
      console.log(`  ${file.slice(root.length)}:${hit.line}:${hit.column}: ${hit.code}`);
    }
  }
  console.log(`${files.length} files checked, ${count} invisible ${count === 1 ? "character" : "characters"}`);
  process.exitCode = count ? 1 : 0;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
