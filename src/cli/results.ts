// Result rows for people (spec §8), shared by search and suggest: metadata cells, then the Verdict.
import type { Io } from "./program.ts";

export const INBOX = "[inbox]";

// Each row is its metadata cells (rank, name, type, journal), then the Verdict line, then optional
// more lines (suggest's why). Piped: one line per result, nothing cut. In a terminal: the metadata
// line is cut to its width, and the Verdict and the lines after it follow on their own lines,
// indented under the name and wrapped, never cut; [inbox] is coloured unless NO_COLOR is set.
export function renderRows(rows: string[][], io: Io, after: string[][] = []): string[] {
  const cells = rows[0]?.length ? rows[0].length - 1 : 0;
  const widths = Array.from({ length: cells }, (_, column) => Math.max(...rows.map((row) => row[column].length)));
  const metadata = (row: string[]) => row.slice(0, cells).map((cell, column) => cell.padEnd(widths[column])).join("  ");
  if (io.columns === undefined) return rows.map((row, i) => [`${metadata(row)}  ${row[cells]}`, ...(after[i] ?? [])].join("  "));

  const columns = io.columns;
  const color = !io.env.NO_COLOR;
  const indent = " ".repeat(widths[0] + 2);
  const block = (text: string) => wrap(text, Math.max(columns - indent.length, 1)).map((part) => indent + part);
  return rows.flatMap((row, i) => {
    let line = metadata(row).trimEnd();
    if (line.length > columns) line = `${line.slice(0, Math.max(columns - 1, 0))}…`;
    const lead = block(row[cells]);
    if (color && row[cells].startsWith(INBOX)) lead[0] = lead[0].replace(INBOX, `\u001b[33m${INBOX}\u001b[39m`);
    return [line, ...lead, ...(after[i] ?? []).flatMap(block)];
  });
}

// The PURL type of an id, for the type column.
export function purlType(id: string | null): string {
  return id?.match(/^pkg:([^/]+)\//)?.[1] ?? "-";
}

// Splits text into lines of at most `width` characters at spaces; a longer word is broken.
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length <= width) {
      line += ` ${word}`;
      continue;
    }
    if (line) lines.push(line);
    while (word.length > width) {
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    line = word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
