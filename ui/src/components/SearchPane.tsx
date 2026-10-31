// Search (docs/ui.md §7): the same ranking as magpie search, across both journals; Verdict first.
// Filters for journal, kind, domain and tag go to the API; status is filtered here, from the results.
// Each row says why it matched (decision 0041). An empty query lists the notes the filters keep, and
// an empty list says why, with the click that fixes it.
import { useEffect, useRef, useState, type Ref } from "react";
import type { NoteSummary } from "../../../src/core/documents.ts";
import { DOMAINS } from "../../../src/core/domains.ts";
import { api, type ApiError, type Scope, type SearchResult } from "../api.ts";
import { Icon } from "../icons.tsx";
import { KINDS } from "../logic/schema.ts";
import { browseRows, emptyText } from "../logic/search.ts";
import { EmptyState, SkeletonRows } from "./common.tsx";
import { SearchRow } from "./rows.tsx";
import { TALL_ROW, VirtualList } from "./VirtualList.tsx";

export interface SearchState {
  query: string;
  journal: Scope | "";
  kind: string;
  tag: string;
  domain: string;
  status: "" | "reviewed" | "inbox";
}

export const NO_SEARCH: SearchState = { query: "", journal: "", kind: "", tag: "", domain: "", status: "" };

export const resultKey = (r: SearchResult) => `${r.journal} id ${r.id}${r.skill ? ` skill ${r.skill}` : ""}`;

interface Props {
  search: SearchState;
  onSearch: (search: SearchState) => void;
  results: SearchResult[];
  onResults: (results: SearchResult[]) => void;
  selected: string | null;
  onSelect: (key: string, open: boolean) => void;
  hasProject: boolean;
  tags: string[];
  inputRef: Ref<HTMLInputElement>;
  listRef: Ref<HTMLDivElement>;
  refresh: number; // grows on live updates: search again
  notes: Partial<Record<Scope, NoteSummary[] | null>>; // each journal's notes, for an empty query; null while loading
  onAdd: (page: "discover" | "import") => void; // an empty journal's way to add notes
}

const LIMIT = 100;
const NO_FILTERS = { journal: "", kind: "", tag: "", domain: "" } as const;

export function SearchPane({ search, onSearch, results, onResults, selected, onSelect, hasProject, tags, inputRef, listRef, refresh, notes, onAdd }: Props) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [unfiltered, setUnfiltered] = useState<number | null>(null); // matches without the filters, once known
  const attempt = useRef(0);
  const set = <K extends keyof SearchState>(key: K, value: SearchState[K]) => onSearch({ ...search, [key]: value });
  const q = search.query.trim();
  const filters = { journal: search.journal, kind: search.kind, tag: search.tag, domain: search.domain };
  const filtered = Boolean(search.journal || search.kind || search.tag || search.domain);

  useEffect(() => {
    setUnfiltered(null);
    // An empty query lists the notes the filters keep, from the lists the app already has.
    if (!q) {
      attempt.current++;
      if (!notes.personal) return setState("loading");
      onResults(browseRows(notes, filters));
      setUnfiltered(browseRows(notes, NO_FILTERS).length);
      setState("ready");
      return;
    }
    const n = ++attempt.current;
    const timer = setTimeout(() => {
      if (!results.length) setState("loading");
      // The app's tag and domain are filters: only notes that have them (search's match "filter").
      const structured = Boolean(search.tag || search.domain);
      api.search({ q, journal: search.journal || undefined, kind: search.kind || undefined, tag: search.tag ? [search.tag] : undefined, domain: search.domain ? [search.domain] : undefined, match: structured ? "filter" : undefined, limit: LIMIT }).then(
        (doc) => {
          if (n !== attempt.current) return;
          onResults(doc.results);
          setState("ready");
          // Nothing with the filters: does anything match without them? The empty list says so.
          if (!doc.results.length && filtered) api.search({ q, limit: LIMIT }).then((all) => n === attempt.current && setUnfiltered(all.results.length), () => {});
        },
        (e: ApiError) => {
          if (n !== attempt.current) return;
          setError(e.message);
          setState("error");
        },
      );
    }, 150);
    return () => clearTimeout(timer);
    // results is read only to keep old results on screen while the next ones load; notes only matter without a query
  }, [search.query, search.journal, search.kind, search.tag, search.domain, refresh, retry, q ? null : notes]);

  const shown = search.status ? results.filter((r) => r.status === search.status) : results;
  const empty = state === "ready" && !shown.length
    ? emptyText({ query: q, status: search.status, rows: results, filtered, unfiltered, total: browseRows(notes, { ...NO_FILTERS, journal: search.journal }).length, journals: search.journal || !hasProject ? 1 : 2 })
    : null;

  return (
    <section className="pane" aria-labelledby="search-title">
      <header className="pane-header">
        <h1 className="visually-hidden" id="search-title">
          Search
        </h1>
        <label className="search-box">
          <Icon name="search" />
          <span className="visually-hidden">Search notes</span>
          <input
            ref={inputRef}
            type="search"
            value={search.query}
            onChange={(e) => set("query", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && shown.length) {
                e.preventDefault();
                onSelect(resultKey(shown[0]), false);
                (listRef as { current: HTMLDivElement | null })?.current?.focus();
              }
            }}
            name="q"
            placeholder="Search names, Verdicts, notes and skills…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </header>
      <div className="filters" role="group" aria-label="Filters">
        {/* Without a project there is one journal to search: no switch names the other. */}
        {hasProject && (
          <div className="segmented" role="radiogroup" aria-label="Journal">
            {(["", "personal", "project"] as const).map((j) => (
              <button key={j || "all"} type="button" role="radio" aria-checked={search.journal === j} onClick={() => set("journal", j)}>
                {j === "" ? "Both" : j === "personal" ? "Personal" : "Project"}
              </button>
            ))}
          </div>
        )}
        <div className="segmented" role="radiogroup" aria-label="Status">
          {(["", "reviewed", "inbox"] as const).map((s) => (
            <button key={s || "any"} type="button" role="radio" aria-checked={search.status === s} onClick={() => set("status", s)}>
              {s === "" ? "Any" : s === "reviewed" ? "Reviewed" : "Inbox"}
            </button>
          ))}
        </div>
        <select className="select" value={search.kind} onChange={(e) => set("kind", e.target.value)} aria-label="Kind">
          <option value="">Any kind</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select className="select" value={search.domain} onChange={(e) => set("domain", e.target.value)} aria-label="Domain">
          <option value="">Any domain</option>
          {DOMAINS.map((d) => (
            <option key={d.id} value={d.id} title={d.definition}>
              {d.id}
            </option>
          ))}
        </select>
        <select className="select" value={search.tag} onChange={(e) => set("tag", e.target.value)} aria-label="Tag">
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="visually-hidden" role="status" aria-live="polite">
        {state === "ready" ? `${shown.length} ${shown.length === 1 ? "result" : "results"}` : ""}
      </div>
      {state === "loading" ? (
        <SkeletonRows label="Searching" />
      ) : state === "error" ? (
        <EmptyState
          action={
            <button type="button" className="button secondary" onClick={() => setRetry((r) => r + 1)}>
              <Icon name="reload" />
              Retry
            </button>
          }
        >
          {`The search failed. ${error}`}
        </EmptyState>
      ) : shown.length ? (
        <VirtualList
          id="results"
          label="Search results"
          items={shown}
          keyOf={resultKey}
          selected={selected}
          onSelect={(key) => onSelect(key, false)}
          onOpen={(key) => onSelect(key, true)}
          row={(r) => <SearchRow result={r} />}
          listRef={listRef}
          rowHeight={TALL_ROW}
        />
      ) : empty ? (
        <EmptyState
          action={
            empty.fix?.kind === "status" ? (
              <button type="button" className="button secondary" onClick={() => set("status", (empty.fix as { status: SearchState["status"] }).status)}>
                {empty.fix.label}
              </button>
            ) : empty.fix?.kind === "clear" ? (
              <button type="button" className="button secondary" onClick={() => onSearch({ ...NO_SEARCH, query: search.query })}>
                Clear the filters
              </button>
            ) : empty.fix?.kind === "add" ? (
              <span className="empty-actions">
                <button type="button" className="button secondary" onClick={() => onAdd("discover")}>
                  <Icon name="external" />
                  Discover
                </button>
                <button type="button" className="button secondary" onClick={() => onAdd("import")}>
                  <Icon name="import" />
                  Import
                </button>
              </span>
            ) : undefined
          }
        >
          {empty.text}
        </EmptyState>
      ) : null}
    </section>
  );
}
