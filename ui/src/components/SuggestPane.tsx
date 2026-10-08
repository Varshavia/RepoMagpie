// Suggest for this project (docs/ui.md §7): what magpie suggest finds, from the manifests and README
// of the project magpie ui was started in, or from a typed description. Candidates come Verdict
// first; the project's dependencies you noted to avoid follow. Your coding agent picks the fit.
import { useEffect, useId, useRef, useState, type Ref } from "react";
import { api, type ApiError, type Scope } from "../api.ts";
import { Icon } from "../icons.tsx";
import { keywordLine, suggestItems, suggestKey, type SuggestItem } from "../logic/suggest.ts";
import { EmptyState, SkeletonRows } from "./common.tsx";
import { SuggestRow } from "./rows.tsx";
import { TALL_ROW, VirtualList } from "./VirtualList.tsx";

interface Props {
  items: SuggestItem[];
  onItems: (items: SuggestItem[]) => void;
  selected: string | null;
  onSelect: (key: string, open: boolean) => void;
  projectRoot: string | null; // where magpie ui was started; null outside a project
  listRef: Ref<HTMLDivElement>;
  refresh: number; // grows on live updates: suggest again
  onOpenNote: (journal: Scope, id: string) => void; // an avoid row's alternative with a note
  onAdd: (journal: Scope, target: string) => void; // one without
}

const STEP = 20; // magpie suggest's default --limit

export function SuggestPane({ items, onItems, selected, onSelect, projectRoot, listRef, refresh, onOpenNote, onAdd }: Props) {
  const id = useId();
  const [text, setText] = useState("");
  const [description, setDescription] = useState<string | undefined>(undefined); // undefined: the project's files
  const [limit, setLimit] = useState(STEP);
  const [state, setState] = useState<"loading" | "ready" | "error" | "nothing">("loading");
  const [error, setError] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const attempt = useRef(0);

  useEffect(() => {
    const n = ++attempt.current;
    if (!items.length) setState("loading");
    api.suggest({ description, limit }).then(
      (doc) => {
        if (n !== attempt.current) return;
        onItems(suggestItems(doc));
        setKeywords(doc.keywords);
        setMore(doc.candidates.length === limit);
        setState("ready");
      },
      (e: ApiError) => {
        if (n !== attempt.current) return;
        onItems([]);
        setKeywords([]);
        // Nothing to go on: no manifest, no README, no words. Ask for a description.
        if (e.status === 400) {
          setState("nothing");
          requestAnimationFrame(() => input.current?.focus());
        } else {
          setError(e.message);
          setState("error");
        }
      },
    );
    // items is read only to keep old rows on screen while the next ones load
  }, [description, limit, refresh, retry]);

  const candidates = items.filter((i) => i.kind === "candidate").length;
  const avoid = items.length - candidates;
  const source = description === undefined
    ? projectRoot ? `From the manifests and README in ${projectRoot}.` : "From the manifests and README where magpie ui started."
    : "From your description.";

  return (
    <section className="pane" aria-labelledby="suggest-title">
      <header className="pane-header">
        <h1 className="pane-title" id="suggest-title">
          Suggest for this project
        </h1>
        {state === "ready" ? <span className="pane-count tabular">{candidates}</span> : null}
        {state === "ready" && more ? (
          <button type="button" className="button ghost pane-action" onClick={() => setLimit((l) => l + STEP)}>
            Show more
          </button>
        ) : null}
      </header>
      <form
        className="suggest-form"
        onSubmit={(e) => {
          e.preventDefault();
          const words = text.trim();
          setLimit(STEP);
          setDescription(words ? words : undefined);
        }}
      >
        <label className="field-label" htmlFor={`${id}-description`}>
          Describe the project instead
        </label>
        <div className="input-row">
          <input
            ref={input}
            id={`${id}-description`}
            name="description"
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="a TypeScript CLI with tests…"
            autoComplete="off"
            aria-describedby={`${id}-source`}
          />
          <button type="submit" className="button secondary">
            Suggest
          </button>
        </div>
        <p className="field-help" id={`${id}-source`}>
          {source}
          {description !== undefined ? (
            <>
              {" "}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setText("");
                  setLimit(STEP);
                  setDescription(undefined);
                }}
              >
                Use the project's files
              </button>
            </>
          ) : null}
        </p>
        {keywords.length ? <p className="field-help">{`Looked for: ${keywordLine(keywords)}`}</p> : null}
      </form>
      <div className="visually-hidden" role="status" aria-live="polite">
        {state === "ready" ? `${candidates} ${candidates === 1 ? "candidate" : "candidates"}${avoid ? `, ${avoid} in use that you noted to avoid` : ""}` : ""}
      </div>
      {state === "loading" ? (
        <SkeletonRows label="Looking for candidates" />
      ) : state === "nothing" ? (
        <EmptyState>Nothing to go on here: no package.json, pyproject.toml, Cargo.toml or README. Describe the project above instead.</EmptyState>
      ) : state === "error" ? (
        <EmptyState
          action={
            <button type="button" className="button secondary" onClick={() => setRetry((r) => r + 1)}>
              <Icon name="reload" />
              Retry
            </button>
          }
        >
          {`Couldn't get suggestions. ${error}`}
        </EmptyState>
      ) : items.length ? (
        <VirtualList
          id="suggestions"
          label="Suggestions"
          items={items}
          keyOf={suggestKey}
          selected={selected}
          onSelect={(key) => onSelect(key, false)}
          onOpen={(key) => onSelect(key, true)}
          row={(item) => <SuggestRow item={item} onOpen={onOpenNote} onAdd={onAdd} />}
          listRef={listRef}
          rowHeight={TALL_ROW}
        />
      ) : (
        <EmptyState>No notes match these words. Describe the project in other words, or add notes for the tools you use.</EmptyState>
      )}
    </section>
  );
}
