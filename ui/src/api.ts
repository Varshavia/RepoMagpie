// The app's only way to the journals: magpie ui's API (docs/ui.md §6). Reads carry the session
// cookie (the browser sends it); writes also carry the X-Magpie-Token header from the page's meta tag.
// Every document type comes from core, so the app reads exactly what the CLI's --json prints.
import type { AdoptJson } from "../../src/core/adopt.ts";
import type { GraphJson, NoteJson, NoteListJson, NotePreviewJson, SettingsJson, TagListJson } from "../../src/core/documents.ts";
import type { RecallMatch } from "../../src/core/recall.ts";
import type { ImportJson, NoteJson as SavedNoteJson } from "../../src/core/save.ts";
import type { SearchResult } from "../../src/core/search.ts";
import type { SuggestJson } from "../../src/core/suggest.ts";
import type { Patch } from "./logic/edits.ts";

export type { GraphJson, NoteJson, NoteListJson, NotePreviewJson, SettingsJson, TagListJson, ImportJson, SavedNoteJson, SearchResult, SuggestJson, AdoptJson };
export type Scope = "personal" | "project";
export type Address = { id: string } | { file: string };
export type RecallJson = { matches: Omit<RecallMatch, "name">[]; error?: string };
export type PackageType = "npm" | "pypi" | "cargo";

const TOKEN = document.querySelector<HTMLMetaElement>('meta[name="magpie-token"]')?.content ?? "";

export const UNREACHABLE = "Can't reach magpie ui. Start it again in a terminal with magpie ui, then open the new URL it prints.";

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
    const message = response.status === 401 ? "This page's session ended. Open the URL magpie ui printed in the terminal." : document?.error ?? `The server answered ${response.status}.`;
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

export const api = {
  settings: () => get<SettingsJson>("/api/settings"),
  tags: (journal: Scope) => get<TagListJson>("/api/tags", { journal }),
  createTagList: (journal: Scope) => write<TagListJson>("POST", "/api/tags", { journal }),
  addTags: (journal: Scope, add: string[]) => write<TagListJson>("POST", "/api/tags", { journal, add }),
  notes: (journal: Scope) => get<NoteListJson>("/api/notes", { journal }),
  graph: (journal: Scope, ghosts: boolean) => get<GraphJson>("/api/graph", { journal, ghosts: ghosts ? "1" : undefined }),
  note: (journal: Scope, address: Address) => get<NoteJson>("/api/note", { journal, ...addressParams(address) }),
  patch: (patch: Patch) => write<NoteJson>("PATCH", "/api/note", patch),
  search: (params: { q: string; journal?: Scope; kind?: string; tag?: string[]; limit?: number }) =>
    get<{ query: string; results: SearchResult[] }>("/api/search", { q: params.q, journal: params.journal, kind: params.kind, tag: params.tag, limit: String(params.limit ?? 10) }),
  preview: (body: { target: string; type?: PackageType; to: Scope }) => write<NotePreviewJson>("POST", "/api/note/preview", body),
  save: (body: { target: string; text?: string; type?: PackageType; to: Scope }) => write<SavedNoteJson>("POST", "/api/note", body),
  importLines: (body: { text: string; to: Scope; dry_run: boolean }) => write<ImportJson>("POST", "/api/import", body),
  open: (journal: Scope, address: Address) => write<{ opened: boolean; path: string | null }>("POST", "/api/open", { journal, ...addressParams(address) }),
  openTagList: (journal: Scope) => write<{ opened: boolean; path: string | null }>("POST", "/api/open", { journal, tag_list: true }),
  recall: (packages: string[], type?: PackageType) => get<RecallJson>("/api/recall", { package: packages, type }),
  suggest: (params: { description?: string; limit: number }) => get<SuggestJson>("/api/suggest", { description: params.description, limit: String(params.limit) }),
  adopt: (target: string) => write<AdoptJson>("POST", "/api/adopt", { target }),
};
