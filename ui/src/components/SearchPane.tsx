// Search (docs/ui.md §7): the same ranking as magpie search, across both journals; Verdict first.
// Filters for journal, kind and tag go to the API; status is filtered here, from the results.
import { useEffect, useRef, useState, type Ref } from "react";
import { api, type ApiError, type Scope, type SearchResult } from "../api.ts";
import { Icon } from "../icons.tsx";
import { KINDS } from "../logic/schema.ts";
import { EmptyState, SkeletonRows } from "./common.tsx";
import { SearchRow } from "./rows.tsx";
import { VirtualList } from "./VirtualList.tsx";

export interface SearchState {
  query: string;
  journal: Scope | "";
  kind: string;
  tag: string;
  status: "" | "reviewed" | "inbox";
}

export const NO_SEARCH: SearchState = { query: "", journal: "", kind: "", tag: "", status: "" };

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
}

const LIMIT = 100;

export function SearchPane({ search, onSearch, results, onResults, selected, onSelect, hasProject, tags, inputRef, listRef, refresh }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(search.query.trim() ? "loading" : "idle");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const attempt = useRef(0);
  const set = <K extends keyof SearchState>(key: K, value: SearchState[K]) => onSearch({ ...search, [key]: value });

  useEffect(() => {
    const q = search.query.trim();
    if (!q) {
      setState("idle");
      onResults([]);
      return;
    }
    const n = ++attempt.current;
    const timer = setTimeout(() => {
      if (!results.length) setState("loading");
      api.search({ q, journal: search.journal || undefined, kind: search.kind || undefined, tag: search.tag ? [search.tag] : undefined, limit: LIMIT }).then(
        (doc) => {
          if (n !== attempt.current) return;
          onResults(doc.results);
          setState("ready");
        },
        (e: ApiError) => {
          if (n !== attempt.current) return;
          setError(e.message);
          setState("error");
        },
      );
    }, 150);
    return () => clearTimeout(timer);
    // results is read only to keep old results on screen while the next ones load
  }, [search.query, search.journal, search.kind, search.tag, refresh, retry]);

  const shown = search.status ? results.filter((r) => r.status === search.status) : results;
  const filtered = Boolean(search.journal || search.kind || search.tag || search.status);

  return (
    <section className="pane" aria-labelledby="search-title">
      <header className="pane-header">
        <h1 className="visually-hidden" id="search-title">
          Search
        </h1>
        <label className="search-box">
          <Icon name="search" />
          <span className="visually-hidden">Search both journals</span>
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
        <div className="segmented" role="radiogroup" aria-label="Journal">
          {(["", "personal", "project"] as const).map((j) => (
            <button key={j || "all"} type="button" role="radio" aria-checked={search.journal === j} disabled={j === "project" && !hasProject} onClick={() => set("journal", j)}>
              {j === "" ? "Both" : j === "personal" ? "Personal" : "Project"}
            </button>
          ))}
        </div>
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
      {state === "idle" ? (
        <EmptyState>Type to search both journals. Notes with a Verdict come first.</EmptyState>
      ) : state === "loading" ? (
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
        />
      ) : (
        <EmptyState
          action={
            filtered ? (
              <button type="button" className="button secondary" onClick={() => onSearch({ ...NO_SEARCH, query: search.query })}>
                Clear the filters
              </button>
            ) : undefined
          }
        >
          {`No notes match “${search.query.trim()}”. Try fewer words${filtered ? ", or clear the filters" : ""}.`}
        </EmptyState>
      )}
    </section>
  );
}
