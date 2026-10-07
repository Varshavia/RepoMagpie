// The graph of one journal (decisions 0026 and 0028): notes and the tags they carry as nodes; tags,
// [[links]], alternatives and computed similarity as edges; optionally, unresolved link targets as
// ghost nodes. Built from the notes, their per-file cache and the link index. A pure read: nothing is
// written but the caches. Never prints.
import { readFileSync } from "node:fs";
import { resolvedLinkIndex } from "./links.ts";
import { readableId, readNote } from "./note.ts";
import { isRecord, isTextOrNull, isTexts, noteEntries } from "./note-cache.ts";

export type KindGroup = "skill-pack" | "tool" | "resource" | "other";
export type EdgeType = "tagged" | "link" | "alternative" | "similar";

// Node keys: "note:<file>", "tag:<tag>", "ghost:<target, lower case>".
export interface NoteNode {
  type: "note";
  key: string;
  id: string;
  file: string;
  name: string | null;
  kind: string | null;
  kind_group: KindGroup;
  status: "inbox" | "reviewed";
  tried: boolean;
  rating: number | null;
  tags: string[];
  language: string | null;
  degree: number; // edges to other notes and tags (tagged, link, alternative); not similar, not ghosts
}

export interface TagNode {
  type: "tag";
  key: string;
  tag: string;
  count: number; // notes that carry it
}

export interface GhostNode {
  type: "ghost";
  key: string;
  target: string; // as first written
  reason: "missing" | "ambiguous";
}

export type GraphNode = NoteNode | TagNode | GhostNode;

// tagged: note → tag. link, alternative, similar: one per pair; between two notes, source is the
// smaller key; to a ghost, source is the note.
export interface GraphEdge {
  type: EdgeType;
  source: string;
  target: string;
  count?: number; // link: the body links between the two, in both directions
  score?: number; // similar: the score, rounded to 3 decimals
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: { notes: number; tags: number; edges_by_type: Record<EdgeType, number> };
}

const KIND_GROUPS: Record<string, KindGroup> = {
  "skill-pack": "skill-pack",
  cli: "tool",
  library: "tool",
  framework: "tool",
  plugin: "tool",
  "awesome-list": "resource",
  template: "resource",
  platform: "resource",
  app: "resource",
};

// Similarity (decision 0026): the Jaccard index of the two notes' topics, plus a bonus for the same
// language. Only notes that share a topic are compared. Each note keeps its 3 best neighbours at or
// above the threshold; an edge exists if either note keeps it. One shared topic of four (two topics
// and three) is just enough; one of five is not, unless the language is the same.
export const SIMILAR = { neighbours: 3, threshold: 0.25, languageBonus: 0.1 };

const EDGE_TYPES: EdgeType[] = ["tagged", "link", "alternative", "similar"];
const GRAPH_CACHE = "graph.json";
const GRAPH_VERSION = 1;

interface Entry {
  id: string;
  name: string | null;
  kind: string | null;
  status: "inbox" | "reviewed";
  tried: boolean;
  rating: number | null;
  tags: string[];
  language: string | null;
  topics: string[];
}

export function graphData(journal: string, options: { ghosts?: boolean } = {}): GraphData {
  const { files, data } = noteEntries(journal, GRAPH_CACHE, GRAPH_VERSION, (_file, path) => entry(path), isEntry);
  const notes = files.filter((file) => data[file].id !== null);
  const noteKey = (file: string) => `note:${file}`;
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>(notes.map((file) => [noteKey(file), 0]));
  const connect = (edge: GraphEdge) => {
    edges.push(edge);
    if (edge.target.startsWith("ghost:")) return;
    for (const key of [edge.source, edge.target]) if (degree.has(key)) degree.set(key, (degree.get(key) as number) + 1);
  };

  // Tags.
  const tagCount = new Map<string, number>();
  for (const file of notes) {
    for (const tag of (data[file] as Entry).tags) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
      connect({ type: "tagged", source: noteKey(file), target: `tag:${tag}` });
    }
  }

  // Links and alternatives, one edge per pair and type; to ghosts only when asked.
  const { outgoing, targets } = resolvedLinkIndex(journal);
  const pairs = new Map<string, GraphEdge>();
  const ghosts = new Map<string, GhostNode>();
  for (const file of notes) {
    (outgoing[file] ?? []).forEach((link, i) => {
      const type = link.from === "alternatives" ? "alternative" : "link";
      const to = targets[file][i];
      if (to === file) return;
      let source = noteKey(file);
      let target: string;
      if (to !== null) target = noteKey(to);
      else if (options.ghosts) {
        target = `ghost:${link.target.toLowerCase()}`;
        if (!ghosts.has(target)) ghosts.set(target, { type: "ghost", key: target, target: link.target, reason: link.reason ?? "missing" });
      } else return;
      if (to !== null && target < source) [source, target] = [target, source];
      const id = `${type} ${source} ${target}`;
      const edge = pairs.get(id);
      if (!edge) pairs.set(id, type === "link" ? { type, source, target, count: 1 } : { type, source, target });
      else if (type === "link") edge.count = (edge.count as number) + 1;
    });
  }
  for (const edge of pairs.values()) connect(edge);

  // Similarity, between notes not already joined by a link or an alternative. Notes are sorted by
  // file, so a pair's first index is its source.
  const index = new Map(notes.map((file, i) => [noteKey(file), i]));
  const n = notes.length;
  const joined = new Set([...pairs.values()].filter((e) => index.has(e.target)).map((e) => (index.get(e.source) as number) * n + (index.get(e.target) as number)));
  const isJoined = (a: number, b: number) => joined.has(a < b ? a * n + b : b * n + a);
  for (const [a, b, score] of similarPairs(notes.map((file) => data[file] as Entry), isJoined)) {
    edges.push({ type: "similar", source: noteKey(notes[a]), target: noteKey(notes[b]), score: Math.round(score * 1000) / 1000 });
  }

  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  edges.sort((a, b) => EDGE_TYPES.indexOf(a.type) - EDGE_TYPES.indexOf(b.type) || order(a.source, b.source) || order(a.target, b.target));
  const nodes: GraphNode[] = [
    ...notes.map((file): NoteNode => {
      const { topics: _topics, ...note } = data[file] as Entry;
      const kind_group = (note.kind && KIND_GROUPS[note.kind]) || "other";
      return { type: "note", key: noteKey(file), id: note.id, file, name: note.name, kind: note.kind, kind_group, status: note.status, tried: note.tried, rating: note.rating, tags: note.tags, language: note.language, degree: degree.get(noteKey(file)) as number };
    }),
    ...[...tagCount.keys()].sort(order).map((tag): TagNode => ({ type: "tag", key: `tag:${tag}`, tag, count: tagCount.get(tag) as number })),
    ...[...ghosts.keys()].sort(order).map((key) => ghosts.get(key) as GhostNode),
  ];
  const edges_by_type = Object.fromEntries(EDGE_TYPES.map((type) => [type, edges.filter((e) => e.type === type).length])) as Record<EdgeType, number>;
  return { nodes, edges, counts: { notes: notes.length, tags: tagCount.size, edges_by_type } };
}

// Pairs [a, b, score] of similar notes, a < b (indexes into `notes`), each pair once. An inverted index
// from topic to notes finds the notes that share a topic, never all pairs. Joined pairs are left out
// before ranking, so they don't take a neighbour's place.
function similarPairs(notes: Entry[], isJoined: (a: number, b: number) => boolean): [number, number, number][] {
  const postings = new Map<string, number[]>();
  notes.forEach((note, i) => {
    for (const topic of note.topics) {
      const list = postings.get(topic);
      if (list) list.push(i);
      else postings.set(topic, [i]);
    }
  });
  const shared = new Int32Array(notes.length);
  const kept = new Map<string, [number, number, number]>();
  notes.forEach((note, i) => {
    const touched: number[] = [];
    for (const topic of note.topics) {
      for (const j of postings.get(topic) as number[]) if (j !== i && shared[j]++ === 0) touched.push(j);
    }
    const best: [number, number][] = [];
    for (const j of touched) {
      const other = notes[j];
      const language = note.language !== null && note.language.toLowerCase() === other.language?.toLowerCase();
      const score = shared[j] / (note.topics.length + other.topics.length - shared[j]) + (language ? SIMILAR.languageBonus : 0);
      shared[j] = 0;
      if (score >= SIMILAR.threshold && !isJoined(i, j)) best.push([j, score]);
    }
    best.sort((x, y) => y[1] - x[1] || x[0] - y[0]);
    for (const [j, score] of best.slice(0, SIMILAR.neighbours)) {
      const [a, b] = i < j ? [i, j] : [j, i];
      kept.set(`${a} ${b}`, [a, b, score]);
    }
  });
  return [...kept.values()];
}

// Whether a cached value has an entry's shape (a damaged cache is read again from the note).
function isEntry(e: unknown): boolean {
  if (!isRecord(e)) return false;
  if (e.id === null) return true;
  return typeof e.id === "string" && isTextOrNull(e.name) && isTextOrNull(e.kind) && (e.status === "inbox" || e.status === "reviewed") &&
    typeof e.tried === "boolean" && (e.rating === null || Number.isInteger(e.rating)) && isTexts(e.tags) && isTextOrNull(e.language) && isTexts(e.topics);
}

// One note's graph fields; no id for a note that can't be read (skipped, as in the link index).
function entry(path: string): Entry | { id: null } {
  let note;
  try {
    note = readNote(readFileSync(path, "utf8"));
  } catch {
    return { id: null };
  }
  const id = readableId(note);
  if (id === null) return { id: null };
  const fm = note.frontmatter;
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  const list = (value: unknown) => (Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : []);
  return {
    id,
    name: text(fm.name),
    kind: text(fm.kind),
    status: note.status,
    tried: fm.tried === true,
    rating: Number.isInteger(fm.rating) ? (fm.rating as number) : null,
    tags: list(fm.tags),
    language: text(fm.language),
    topics: [...new Set(list(fm.topics).map((topic) => topic.toLowerCase()))],
  };
}
