// A section's Markdown body as plain data for React: bullet lists, lines, code spans and links. HTML
// comments (the draft marker among them) are not shown. No HTML is built from note text.
import { DRAFT_MARKER } from "./schema.ts";

export type Inline = { kind: "text"; text: string } | { kind: "code"; text: string } | { kind: "link"; text: string; href: string };
export type Block = { kind: "list"; items: Inline[][] } | { kind: "lines"; lines: Inline[][] };

const COMMENT = /<!--[\s\S]*?-->/g;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const INLINE = /`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/g;

export function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  let current = null as Block | null;
  for (const raw of body.replace(COMMENT, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }
    const bullet = line.match(BULLET);
    const kind = bullet ? "list" : "lines";
    if (current?.kind !== kind) {
      current = kind === "list" ? { kind: "list", items: [] } : { kind: "lines", lines: [] };
      blocks.push(current);
    }
    if (current.kind === "list") current.items.push(parseInline(bullet ? bullet[1] : line));
    else current.lines.push(parseInline(line));
  }
  return blocks;
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last?.kind === "text") last.text += t;
    else out.push({ kind: "text", text: t });
  };
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    pushText(text.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "link", text: m[2], href: m[3] });
    else {
      // A bare link doesn't take the sentence's closing punctuation.
      const href = m[4].replace(/[.,;:!?]+$/, "");
      out.push({ kind: "link", text: href, href });
      pushText(m[4].slice(href.length));
    }
  }
  pushText(text.slice(at));
  return out;
}

// The first n entries (bullets or lines) across the blocks, for a collapsed view, and how many more
// there are.
export function firstEntries(blocks: Block[], n: number): { blocks: Block[]; more: number } {
  const out: Block[] = [];
  let left = n;
  let more = 0;
  for (const block of blocks) {
    const entries = block.kind === "list" ? block.items : block.lines;
    const kept = entries.slice(0, Math.max(0, left));
    more += entries.length - kept.length;
    left -= kept.length;
    if (kept.length) out.push(block.kind === "list" ? { kind: "list", items: kept } : { kind: "lines", lines: kept });
  }
  return { blocks: more ? out : blocks, more };
}

// Only comments and whitespace: an empty section.
export function isBlank(body: string): boolean {
  return !body.replace(COMMENT, "").trim();
}

// What the section editor starts with: the body without the draft marker and the blank lines
// around it. Other comments stay, so saving never drops them unseen.
export function editableBody(body: string): string {
  return body.replace(DRAFT_MARKER, "").replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
}

// A path for people: under the home directory it starts with ~, as magpie recall and the hook print
// it. The separator is the one the home directory uses (the app can't ask Node's path module).
export function homePath(path: string, home: string | null): string {
  if (!home) return path;
  const sep = home.includes("\\") ? "\\" : "/";
  return path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
}
