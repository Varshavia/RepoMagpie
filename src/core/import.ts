// The magpie import line format (spec §2):
//   - <url-or-name> — verdict: ... | use: ... | avoid: ...
// read leniently, for a list pasted from anywhere: the marker is optional, a line may be a bare URL
// or name (backticks aside), a numbered line or a Markdown link; prose is skipped and listed, a
// heading skipped without a word. Pure: text in, items
// out, no imports, so the app runs the same parser. Resolving and saving each item is the caller's job.

export interface ImportItem {
  line: number; // 1-based line number in the file
  target: string;
  verdict?: string; // the user's own words (decision 0018)
  useWhen: string[]; // drafts
  avoidWhen: string[]; // drafts
  myNotes?: string; // text without a label, one line per part
  error: string | null; // set when the line can't be parsed
}

// A line that is no item: what it says, and why it was skipped.
export interface SkippedLine {
  line: number;
  reason: string;
}

// A list marker, optional: "- ", "* ", "+ ", "• ", "1. ", "1) ", or "\- " as a list copied out of a
// chat escapes it; leading spaces are allowed and a non-breaking space counts as a space.
const MARKER = /^[ \t ]*(?:\\?-|\*|\+|•|\d{1,3}[.)])[  ]+/;
const SEPARATOR = /^(.*?)(?:^|\s)(?:—|--)(?:\s|$)(.*)$/;
const LINK = /^\[[^\]]*\]\((\S+?)\)/; // [name](url): the URL is the target
const ADDRESS = /^(?:https?:\/\/|pkg:)\S+/i; // a URL or a PURL
// A package name as one word, starting with a letter or digit (a scope's @ aside). resolveTarget
// still decides whether it is valid; this only tells a name from prose.
const NAME = /^(?:@[A-Za-z0-9][^\s/@\\:%]*\/)?[A-Za-z0-9][^\s/@\\:%]*$/;
const CODE = /^`([^`\s]+)`$/; // `pdfkit`, as a chat writes a name
// A heading, skipped without a word: "# Tools", or a short line ending with a colon, bold or not
// ("Tools:", "**Security tools:**"). A line with the separator is an item, even if it ends in "use:".
const HEADING_LENGTH = 60;
const isHeading = (rest: string, separated: boolean) => rest.startsWith("#") || (!separated && rest.length <= HEADING_LENGTH && /:(?:\*\*|__)?$/.test(rest));
export const NOT_A_TARGET = "Not a URL or a package name.";

// The lines of an import text, without a UTF-8 BOM.
export const importLines = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/);

export function parseImport(text: string): { items: ImportItem[]; skipped: SkippedLine[] } {
  const items: ImportItem[] = [];
  const skipped: SkippedLine[] = [];
  importLines(text).forEach((raw, index) => {
    const line = index + 1;
    const rest = raw.replace(MARKER, "").trim();
    if (!rest) return; // a blank line, or a marker alone
    const split = rest.match(SEPARATOR);
    if (isHeading(rest, Boolean(split))) return;
    const written = (split ? split[1] : rest).trim();
    const head = written.match(CODE)?.[1] ?? written;
    // A link or a URL is the target, and text after it up to the separator is left out: a
    // description copied from somewhere is not the user's words. A name must be the whole head.
    const target = head.match(LINK)?.[1] ?? head.match(ADDRESS)?.[0] ?? (NAME.test(head) ? head : null);
    if (target === null && head) return skipped.push({ line, reason: NOT_A_TARGET });

    const item: ImportItem = { line, target: target ?? "", useWhen: [], avoidWhen: [], error: null };
    items.push(item);
    if (!target) {
      item.error = "No package or URL before the separator.";
      return;
    }
    const notes: string[] = [];
    for (const part of (split?.[2] ?? "").split(" | ").map((p) => p.trim()).filter((p) => p)) {
      const labelled = part.match(/^(verdict|use|avoid)\s*:\s*(.*)$/is);
      if (!labelled) {
        notes.push(part);
        continue;
      }
      const value = labelled[2].trim();
      if (!value) continue;
      const label = labelled[1].toLowerCase();
      if (label === "use") item.useWhen.push(value);
      else if (label === "avoid") item.avoidWhen.push(value);
      else if (item.verdict === undefined) item.verdict = value;
      else item.error = "The line has more than one verdict: part.";
    }
    if (notes.length) item.myNotes = notes.join("\n");
  });
  return { items, skipped };
}

// For a text without items: the rule, and what the first line with text starts with instead.
export function noItemsHint(text: string): string {
  const rule = "Put one repo URL or package name on each line.";
  const all = importLines(text);
  const index = all.findIndex((line) => line.trim());
  if (index === -1) return `${rule} The text is empty.`;
  const first = all[index].trim().split(/\s/)[0];
  const start = first.length > 20 ? `${first.slice(0, 20)}…` : first;
  return `${rule} Line ${index + 1} starts with "${start}".`;
}
