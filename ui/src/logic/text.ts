// A section's Markdown body as plain data for React: bullet lists, lines, code spans, links and
// [[wikilinks]]. HTML comments (the draft marker among them) are not shown. No HTML is built from
// note text. Wikilinks are found by core's rules (src/core/links.ts; text.test.ts keeps them equal):
// none in fenced code blocks or code spans.
import { DRAFT_MARKER } from "./schema.ts";

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "wikilink"; target: string; label: string | null; text: string };
export type Block = { kind: "list"; items: Inline[][] } | { kind: "lines"; lines: Inline[][] };

const BULLET = /^\s*[-*+]\s+(.*)$/;
const FENCE = /^(```|~~~)/;
// A code span (a run of backticks, up to a run of the same length), a wikilink, a Markdown link, a
// bare link.
const INLINE = /(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)|\[\[([^[\]\n]*)\]\]|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/g;

// A URL from a note as a link's target (decision 0032, rule 7): only http and https. Anything else
// (javascript:, data:, vbscript:, file:, or what doesn't parse) gives null, and stays text.
export function externalHref(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

// Hidden characters (decision 0032, rule 1, in the app): the C0 controls but tab and line breaks,
// DEL and C1; the Arabic letter mark; zero-width space, non-joiner and joiner, and the LTR and RTL
// marks; the bidi embeddings and overrides; the word joiner; the bidi isolates; the BOM. The same
// characters, and markers, as core's clean (text.test.ts keeps them equal). Built from code points,
// so this source holds none of them.
const char = (code: number) => String.fromCharCode(code);
const range = (from: number, to: number) => `${char(from)}-${char(to)}`;
const HIDDEN_CLASS = `[${range(0x00, 0x08)}${char(0x0b)}${char(0x0c)}${range(0x0e, 0x1f)}${range(0x7f, 0x9f)}${char(0x61c)}${range(0x200b, 0x200f)}${range(0x202a, 0x202e)}${char(0x2060)}${range(0x2066, 0x2069)}${char(0xfeff)}]`;
const HIDDEN = new RegExp(HIDDEN_CLASS, "g");
const HAS_HIDDEN = new RegExp(HIDDEN_CLASS);

// Note text for a read view: each hidden character becomes a visible marker in its place, the
// ASCII form core uses (<U+202E>), never shown raw and never dropped. Editors keep the raw text.
// Text from the API already has its markers; this is for the documents that keep the file's text.
export function visible(text: string): string {
  return text.replace(HIDDEN, (c) => `<U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}>`);
}

// Whether any string in a value, however deep, holds a hidden character.
export function hasHidden(value: unknown): boolean {
  if (typeof value === "string") return HAS_HIDDEN.test(value);
  if (Array.isArray(value)) return value.some(hasHidden);
  return value !== null && typeof value === "object" && Object.values(value).some(hasHidden);
}

// Text without HTML comments, as core's stripComments reads it (src/core/note.ts; text.test.ts keeps
// them equal), so the app shows what core and the agent read. Comments are removed until none is left,
// so "<!-<!---->-" can't leave "<!--" behind; then an unterminated "<!--" is dropped to the end of its line.
export function stripComments(text: string): string {
  let out = text;
  for (let before = ""; out !== before; ) {
    before = out;
    out = out.replace(/<!--[\s\S]*?-->/g, "");
  }
  return out.replace(/<!--[^\r\n]*/g, "");
}

export function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  let current = null as Block | null;
  let fence: string | null = null;
  for (const raw of stripComments(body).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }
    // A fenced code block's lines, its fences too, are shown as plain lines.
    const mark = line.match(FENCE)?.[1];
    if (mark) fence = fence === null ? mark : fence === mark ? null : fence;
    const plain = Boolean(mark || fence);
    const bullet = plain ? null : line.match(BULLET);
    const kind = bullet ? "list" : "lines";
    if (current?.kind !== kind) {
      current = kind === "list" ? { kind: "list", items: [] } : { kind: "lines", lines: [] };
      blocks.push(current);
    }
    if (current.kind === "list") current.items.push(parseInline(bullet ? bullet[1] : line));
    else current.lines.push(plain ? [{ kind: "text", text: line }] : parseInline(line));
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
    if (m[1] !== undefined) out.push({ kind: "code", text: m[2] });
    else if (m[3] !== undefined) {
      const bar = m[3].indexOf("|");
      const target = (bar === -1 ? m[3] : m[3].slice(0, bar)).split("#")[0].trim();
      const label = bar === -1 ? "" : m[3].slice(bar + 1).trim();
      if (target) out.push({ kind: "wikilink", target, label: label || null, text: m[0] });
      else pushText(m[0]);
    } else if (m[4] !== undefined) out.push({ kind: "link", text: m[4], href: m[5] });
    else {
      // A bare link doesn't take the sentence's closing punctuation.
      const href = m[6].replace(/[.,;:!?]+$/, "");
      out.push({ kind: "link", text: href, href });
      pushText(m[6].slice(href.length));
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
  return !stripComments(body).trim();
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
