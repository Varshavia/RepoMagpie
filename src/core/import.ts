// The magpie import line format (spec §2):
//   - <url-or-name> — verdict: ... | use: ... | avoid: ...
// Pure: text in, items out. Resolving and saving each item is the caller's job.

export interface ImportItem {
  line: number; // 1-based line number in the file
  target: string;
  verdict?: string; // the user's own words (decision 0018)
  useWhen: string[]; // drafts
  avoidWhen: string[]; // drafts
  myNotes?: string; // text without a label, one line per part
  error: string | null; // set when the line can't be parsed
}

export function parseImport(text: string): ImportItem[] {
  const items: ImportItem[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.startsWith("- ")) return;
    const rest = raw.slice(2);
    const split = rest.match(/^(.*?)(?:^|\s)(?:—|--)(?:\s|$)(.*)$/);
    const target = (split ? split[1] : rest).trim();
    const item: ImportItem = { line: index + 1, target, useWhen: [], avoidWhen: [], error: null };
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
  return items;
}
