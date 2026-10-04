// npm run check:links: checks every relative link in the repository's Markdown files (tracked and
// new ones, not git-ignored), including #anchors into Markdown headings. Exits 1 if any is broken.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = execSync("git ls-files --cached --others --exclude-standard -- *.md", { cwd: root, encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean).map((file) => resolve(root, file));

// GitHub's heading anchors: lowercase, punctuation dropped, spaces to dashes, -1, -2 for repeats.
const slug = (h) => h.trim().toLowerCase().replace(/[`*_]/g, "").replace(/[^\p{L}\p{N} -]/gu, "").replace(/ /g, "-");
const anchors = (file) => {
  const seen = new Map();
  const out = new Set();
  let fence = false;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (/^```/.test(line)) fence = !fence;
    const m = !fence && line.match(/^#{1,6}\s+(.*)$/);
    if (!m) continue;
    const base = slug(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
};

let checked = 0;
const broken = [];
for (const file of files) {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^[a-z]+:/i.test(target)) continue; // https:, mailto: and other schemes
    checked++;
    const [path, anchor] = target.split("#");
    const dest = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
    const where = `${file.slice(root.length)}: ${target}`;
    if (!existsSync(dest)) broken.push(where);
    else if (anchor && statSync(dest).isFile() && dest.endsWith(".md") && !anchors(dest).has(anchor)) broken.push(`${where} (anchor)`);
  }
}
console.log(`${checked} links checked, ${broken.length} broken`);
for (const line of broken) console.log(`  ${line}`);
process.exitCode = broken.length ? 1 : 0;
