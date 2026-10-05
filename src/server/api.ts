// The local app's API endpoints (docs/ui.md §6). Each one parses its request, calls src/core and
// returns core's document with the status for its outcome; no logic of its own (decision 0023).
// Security checks happen before a request gets here (server.ts).
import {
  emptyNote,
  emptyPreview,
  locateNote,
  noteDocument,
  noteListDocument,
  patchNote,
  previewNote,
  settingsDocument,
  tagListDocument,
  tagListPath,
  type NoteAddress,
} from "../core/documents.ts";
import type { PackageType } from "../core/identity.ts";
import { KINDS } from "../core/note.ts";
import type { Outcome } from "../core/outcome.ts";
import { runRecall } from "../core/recall.ts";
import { importFailure, runImport, runNote, type Context } from "../core/save.ts";
import { runSearch } from "../core/search.ts";

export interface ApiRequest {
  query: URLSearchParams;
  body: Record<string, unknown>; // {} for a GET
}

export interface ApiReply {
  status: number;
  document: unknown;
}

export type Handler = (request: ApiRequest) => ApiReply | Promise<ApiReply>;

const STATUS: Record<Outcome, number> = { ok: 200, usage: 400, failed: 422, "not-found": 404, conflict: 409 };
const SCOPES = ["personal", "project"] as const;
const TYPES = ["npm", "pypi", "cargo"] as const;
type Scope = (typeof SCOPES)[number];

const reply = ({ outcome, document }: { outcome: Outcome; document: unknown }): ApiReply => ({ status: STATUS[outcome], document });
const bad = (document: object, error: string): ApiReply => ({ status: 400, document: { ...document, error } });

const JOURNAL = "journal must be personal or project.";
const scope = (value: unknown): Scope | null => (SCOPES as readonly unknown[]).includes(value) ? (value as Scope) : null;
const type = (value: unknown): PackageType | undefined | null =>
  value === undefined || value === null ? undefined : (TYPES as readonly unknown[]).includes(value) ? (value as PackageType) : null;
const optionalText = (value: unknown): string | undefined | null => (value === undefined || value === null ? undefined : typeof value === "string" ? value : null);

// The endpoints by path, then method. `open` opens a file in the default app (POST /api/open).
export function endpoints(context: Context, open: (path: string) => Promise<void>): Record<string, Record<string, Handler>> {
  return {
    "/api/settings": {
      GET: () => ({ status: 200, document: settingsDocument(context) }),
    },

    "/api/tags": {
      GET: ({ query }) => {
        const journal = scope(query.get("journal"));
        return journal ? reply(tagListDocument(journal, context)) : bad({ journal: null, tags: [] }, JOURNAL);
      },
    },

    "/api/notes": {
      GET: ({ query }) => {
        const journal = scope(query.get("journal"));
        const empty = { journal, count: 0, notes: [] };
        if (!journal) return bad(empty, JOURNAL);
        const status = query.get("status") ?? undefined;
        if (status !== undefined && status !== "inbox" && status !== "reviewed") return bad(empty, "status must be inbox or reviewed.");
        const kind = query.get("kind") ?? undefined;
        if (kind !== undefined && !KINDS.includes(kind)) return bad(empty, `kind must be one of: ${KINDS.join(", ")}.`);
        return reply(noteListDocument(journal, { status, kind, tags: query.getAll("tag") }, context));
      },
    },

    "/api/note": {
      GET: ({ query }) => {
        const journal = scope(query.get("journal"));
        if (!journal) return bad({ ...emptyNote("personal"), journal: null }, JOURNAL);
        const address = addressOf(query.get("id"), query.get("file"));
        return address ? reply(noteDocument(journal, address, context)) : bad(emptyNote(journal), "Give either id or file.");
      },
      PATCH: ({ body }) => reply(patchNote(body, context)),
      POST: async ({ body }) => {
        const to = body.to === undefined ? "personal" : scope(body.to);
        const empty = { id: null, journal: to, path: null, created: false, status: null, warnings: [] };
        if (!to) return bad(empty, JOURNAL);
        if (typeof body.target !== "string") return bad(empty, "target must be a package name, a PURL or a URL.");
        const text = optionalText(body.text);
        if (text === null) return bad(empty, "text must be your Verdict, in one line.");
        const packageType = type(body.type);
        if (packageType === null) return bad(empty, "type must be npm, pypi or cargo.");
        return reply(await runNote({ target: body.target, text, type: packageType, to }, context));
      },
    },

    "/api/note/preview": {
      POST: async ({ body }) => {
        const to = body.to === undefined ? "personal" : scope(body.to);
        if (!to) return bad({ ...emptyPreview("personal"), journal: null }, JOURNAL);
        if (typeof body.target !== "string") return bad(emptyPreview(to), "target must be a package name, a PURL or a URL.");
        const packageType = type(body.type);
        if (packageType === null) return bad(emptyPreview(to), "type must be npm, pypi or cargo.");
        return reply(await previewNote({ target: body.target, type: packageType, to }, context));
      },
    },

    "/api/search": {
      GET: ({ query }) => {
        const q = query.get("q") ?? "";
        const empty = { query: q, results: [] };
        const kind = query.get("kind") ?? undefined;
        if (kind !== undefined && !KINDS.includes(kind)) return bad(empty, `kind must be one of: ${KINDS.join(", ")}.`);
        const journal = query.has("journal") ? scope(query.get("journal")) : undefined;
        if (journal === null) return bad(empty, JOURNAL);
        const limit = query.has("limit") ? Number(query.get("limit")) : 10;
        if (!Number.isInteger(limit) || limit < 1) return bad(empty, "limit must be a whole number of 1 or more.");
        return reply(runSearch({ query: q, tags: query.getAll("tag"), kind, journal, limit }, context));
      },
    },

    "/api/import": {
      POST: async ({ body }) => {
        const to = body.to === undefined ? "personal" : scope(body.to);
        if (!to) return bad(importFailure(""), JOURNAL);
        if (typeof body.text !== "string") return bad(importFailure(""), "text must be the lines to import.");
        if (body.dry_run !== undefined && typeof body.dry_run !== "boolean") return bad(importFailure(""), "dry_run must be true or false.");
        return reply(await runImport({ text: body.text, to, dryRun: body.dry_run === true }, context));
      },
    },

    "/api/open": {
      POST: async ({ body }) => {
        const journal = scope(body.journal);
        if (!journal) return bad({ opened: false, path: null }, JOURNAL);
        let path: string | null;
        if (body.tag_list !== undefined) {
          if (body.tag_list !== true || body.id !== undefined || body.file !== undefined) return bad({ opened: false, path: null }, "Give either id, file or tag_list: true.");
          path = tagListPath(journal, context);
          if (!path) return { status: 404, document: { opened: false, path: null, error: "This journal has no tags.md yet." } };
        } else {
          const address = addressOf(body.id, body.file);
          if (!address) return bad({ opened: false, path: null }, "Give either id or file.");
          path = locateNote(journal, address, context).path;
          if (!path) return { status: 404, document: { opened: false, path: null, error: "No note with that id or file name in this journal." } };
        }
        try {
          await open(path);
        } catch (error) {
          return { status: 422, document: { opened: false, path, error: `Couldn't open the note: ${(error as Error).message}` } };
        }
        return { status: 200, document: { opened: true, path } };
      },
    },

    "/api/recall": {
      GET: ({ query }) => {
        const packages = query.getAll("package");
        if (!packages.length) return bad({ matches: [] }, "Give at least one package.");
        const packageType = type(query.get("type"));
        if (packageType === null) return bad({ matches: [] }, "type must be npm, pypi or cargo.");
        return { status: 200, document: runRecall(packages, packageType, context).document };
      },
    },
  };
}

// Exactly one of id and file, each a string.
function addressOf(id: unknown, file: unknown): NoteAddress | null {
  if (typeof id === "string" && (file === undefined || file === null)) return { id };
  if (typeof file === "string" && (id === undefined || id === null)) return { file };
  return null;
}
