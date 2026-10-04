// The search index of one journal (spec §5, §7): MiniSearch over its notes and completed skill
// lines, cached in <journal>/.cache/. The cache is rebuildable and safe to delete; it is rebuilt
// when any note is added, removed or changed, and a cache that can't be read is rebuilt silently.
// Reads and writes only inside the journal; never prints.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import MiniSearch, { type Options } from "minisearch";
import { DRAFT_MARKER, readNote } from "./note.ts";
import { noteSignature, readCache, writeCache } from "./note-cache.ts";

export const CACHE_FILE = "search-index.json";
const CACHE_VERSION = 2; // 2: the index sits under "data" (note-cache.ts)

// One searchable document: a note, or one completed skill line of a note (decision 0006).
export interface SearchDoc {
  key: string; // the note's file name, plus "#<skill>" for a skill line
  type: "note" | "skill";
  file: string; // the note's file name in <journal>/notes/
  purl: string | null; // the note's id ("id" is MiniSearch's name for the document key)
  name: string;
  skill: string | null;
  kind: string | null;
  tags: string[];
  status: "inbox" | "reviewed";
  verdict: string;
  useWhen: string;
  avoidWhen: string;
  whatItDoes: string;
  myNotes: string;
  skillText: string;
  drafts: string[]; // sections whose text is still a draft
}

const FIELDS = ["name", "purl", "tags", "verdict", "useWhen", "avoidWhen", "whatItDoes", "myNotes", "skill", "skillText"];
const STORED = ["type", "file", "purl", "name", "skill", "kind", "tags", "status", "verdict", "useWhen", "avoidWhen", "whatItDoes", "myNotes", "skillText", "drafts"];

export const INDEX_OPTIONS: Options<SearchDoc> = {
  idField: "key",
  fields: FIELDS,
  storeFields: STORED,
  searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 3, skill: 3, purl: 2, tags: 2, verdict: 2 } },
};

export type JournalIndex = MiniSearch<SearchDoc>;

// The documents of one note: the note itself, then one per completed skill line.
export function noteDocuments(text: string, file: string): SearchDoc[] {
  const note = readNote(text);
  const fm = note.frontmatter;
  const section = (name: string) => clean(note.sections.find((s) => s.name === name)?.body ?? "");
  const base = {
    file,
    purl: typeof fm.id === "string" ? fm.id : null,
    name: typeof fm.name === "string" ? fm.name : file.replace(/\.md$/, ""),
    kind: typeof fm.kind === "string" ? fm.kind : null,
    tags: Array.isArray(fm.tags) ? fm.tags.filter((tag): tag is string => typeof tag === "string") : [],
    status: note.status,
  };
  const empty = { verdict: "", useWhen: "", avoidWhen: "", whatItDoes: "", myNotes: "", drafts: [] as string[] };
  const docs: SearchDoc[] = [{
    key: file,
    type: "note",
    ...base,
    skill: null,
    verdict: note.verdict,
    useWhen: section("Use when"),
    avoidWhen: section("Avoid when"),
    whatItDoes: section("What it does"),
    myNotes: section("My notes"),
    skillText: "",
    drafts: note.sections.filter((s) => s.draft && s.name).map((s) => s.name as string),
  }];
  // Skill lines with nothing after the dash are ignored by search (schema rule 4).
  for (const line of (note.sections.find((s) => s.name === "Notable skills")?.body ?? "").split("\n")) {
    const match = line.match(/^\s*[-*]\s+`([^`]+)`\s*(?:—|--?)\s*(.*)$/);
    const skillText = clean(match?.[2] ?? "");
    if (match && skillText) docs.push({ key: `${file}#${match[1]}`, type: "skill", ...base, ...empty, skill: match[1], skillText });
  }
  return docs;
}

// The index of one journal, from the cache when it matches the notes on disk.
export function loadIndex(journal: string): { index: JournalIndex; rebuilt: boolean } {
  const { files, signature } = noteSignature(journal);
  const cached = readCache(journal, CACHE_FILE, CACHE_VERSION, signature);
  if (cached !== undefined) {
    try {
      return { index: MiniSearch.loadJS(cached as Parameters<typeof MiniSearch.loadJS>[0], INDEX_OPTIONS) as JournalIndex, rebuilt: false };
    } catch {
      // A cache with a broken index: rebuild below.
    }
  }

  const index = new MiniSearch<SearchDoc>(INDEX_OPTIONS);
  index.addAll(files.flatMap((file) => noteDocuments(readFileSync(join(journal, "notes", file), "utf8"), file)));
  if (files.length) writeCache(journal, CACHE_FILE, CACHE_VERSION, signature, index);
  return { index, rebuilt: true };
}

// Section text for the index: without the draft marker and comments, trailing spaces trimmed.
function clean(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
    .replace(DRAFT_MARKER, "");
}
