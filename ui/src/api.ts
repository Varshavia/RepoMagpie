// The app's only way to the journals: magpie ui's API (docs/ui.md §6). Reads carry the session
// cookie (the browser sends it); writes also carry the X-Magpie-Token header from the page's meta tag.
// Every document type comes from core, so the app reads exactly what the CLI's --json prints.
import type { AdoptJson } from "../../src/core/adopt.ts";
import type { DeleteJson, RestoreJson } from "../../src/core/delete.ts";
import type { GraphJson, NoteJson, NoteListJson, NotePreviewJson, SettingsJson, TagListJson } from "../../src/core/documents.ts";
import type { RecallMatch } from "../../src/core/recall.ts";
import type { ImportJson, NoteJson as SavedNoteJson } from "../../src/core/save.ts";
import type { SearchResult } from "../../src/core/search.ts";
import type { SuggestJson } from "../../src/core/suggest.ts";
import type { TagsFromTopicsJson } from "../../src/core/tags-from-topics.ts";
import type { Patch } from "./logic/edits.ts";

export type { GraphJson, NoteJson, NoteListJson, NotePreviewJson, SettingsJson, TagListJson, ImportJson, SavedNoteJson, SearchResult, SuggestJson, AdoptJson, TagsFromTopicsJson, DeleteJson, RestoreJson };
export type Scope = "personal" | "project";
export type Address = { id: string } | { file: string };
export type RecallJson = { matches: Omit<RecallMatch, "name">[]; error?: string };
export type PackageType = "npm" | "pypi" | "cargo";

const TOKEN = document.querySelector<HTMLMetaElement>('meta[name="magpie-token"]')?.content ?? "";

export const UNREACHABLE = "Can't reach repomagpie ui. Start it again in a terminal with repomagpie ui, then open the new URL it prints.";

// A failed request: the HTTP status (0 when the server can't be reached) and the endpoint's document,
// which for most failures is the success shape plus "error" (spec §1).
export class ApiError extends Error {
  status: number;
  document: unknown;
  constructor(status: number, document: unknown, message: string) {
    super(message);
    this.status = status;
    this.document = document;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, null, UNREACHABLE);
  }
  const document = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    const message = response.status === 401 ? "This page's session ended. Open the URL repomagpie ui printed in the terminal." : document?.error ?? `The server answered ${response.status}.`;
    throw new ApiError(response.status, document, message);
  }
  return document as T;
}

const get = <T>(path: string, params: Record<string, string | string[] | undefined> = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  const text = query.toString();
  return request<T>(text ? `${path}?${text}` : path);
};

const write = <T>(method: "POST" | "PATCH", path: string, body: unknown) =>
  request<T>(path, { method, headers: { "Content-Type": "application/json", "X-Magpie-Token": TOKEN }, body: JSON.stringify(body) });

const addressParams = (address: Address) => ("id" in address ? { id: address.id } : { file: address.file });

// The graph page's data, asked for as soon as the page is (App's go), so the request runs while the
// page's chunk loads instead of after it (docs/ui.md §10). The page takes it once, when it mounts
// for that journal; any other time it fetches its own.
let early: { journal: Scope; data: Promise<GraphJson> } | null = null;

export function fetchGraphEarly(journal: Scope): void {
  performance.mark("graph:fetch");
  early = { journal, data: api.graph(journal, true) };
  early.data.catch(() => {}); // a failure is the page's to show, if it takes the request
}

export function takeGraph(journal: Scope): Promise<GraphJson> | null {
  const data = early?.journal === journal ? early.data : null;
  early = null;
  return data;
}

export const api = {
  settings: () => get<SettingsJson>("/api/settings"),
  tags: (journal: Scope) => get<TagListJson>("/api/tags", { journal }),
  createTagList: (journal: Scope) => write<TagListJson>("POST", "/api/tags", { journal }),
  addTags: (journal: Scope, add: string[]) => write<TagListJson>("POST", "/api/tags", { journal, add }),
  fromTopics: (journal: Scope, dryRun: boolean) => write<TagsFromTopicsJson>("POST", "/api/tags/from-topics", { journal, dry_run: dryRun }),
  notes: (journal: Scope) => get<NoteListJson>("/api/notes", { journal }),
  graph: (journal: Scope, ghosts: boolean) => get<GraphJson>("/api/graph", { journal, ghosts: ghosts ? "1" : undefined }),
  note: (journal: Scope, address: Address) => get<NoteJson>("/api/note", { journal, ...addressParams(address) }),
  patch: (patch: Patch) => write<NoteJson>("PATCH", "/api/note", patch),
  search: (params: { q: string; journal?: Scope; kind?: string; tag?: string[]; domain?: string[]; match?: "boost" | "filter"; limit?: number }) =>
    get<{ query: string; results: SearchResult[] }>("/api/search", { q: params.q, journal: params.journal, kind: params.kind, tag: params.tag, domain: params.domain, match: params.match, limit: String(params.limit ?? 10) }),
  preview: (body: { target: string; type?: PackageType; to: Scope }) => write<NotePreviewJson>("POST", "/api/note/preview", body),
  save: (body: { target: string; text?: string; type?: PackageType; to: Scope; tags?: string[]; use_when?: string[]; avoid_when?: string[] }) => write<SavedNoteJson>("POST", "/api/note", body),
  importLines: (body: { text: string; to: Scope; dry_run: boolean }) => write<ImportJson>("POST", "/api/import", body),
  open: (journal: Scope, address: Address) => write<{ opened: boolean; path: string | null }>("POST", "/api/open", { journal, ...addressParams(address) }),
  openTagList: (journal: Scope) => write<{ opened: boolean; path: string | null }>("POST", "/api/open", { journal, tag_list: true }),
  recall: (packages: string[], type?: PackageType) => get<RecallJson>("/api/recall", { package: packages, type }),
  suggest: (params: { description?: string; limit: number }) => get<SuggestJson>("/api/suggest", { description: params.description, limit: String(params.limit) }),
  adopt: (target: string) => write<AdoptJson>("POST", "/api/adopt", { target }),
  // Delete note (decision 0037): a dry run for the confirm dialog, then the move to the trash.
  deleteNote: (journal: Scope, address: Address, version: string, dryRun: boolean) =>
    write<DeleteJson>("POST", "/api/note/delete", { journal, ...addressParams(address), version, dry_run: dryRun }),
  // Undo: `trash` is the file's name in the journal's .trash/.
  restoreNote: (journal: Scope, trash: string) => write<RestoreJson>("POST", "/api/note/restore", { journal, trash }),
};
