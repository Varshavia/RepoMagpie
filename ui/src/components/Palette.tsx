// The command palette (Ctrl/Cmd+K; DESIGN.md, Command palette): notes and skills from magpie search,
// and every action, grouped. Arrow keys move, Enter runs, Esc closes.
import { useEffect, useId, useRef, useState } from "react";
import { api, type SearchResult } from "../api.ts";
import { Icon, type IconName } from "../icons.tsx";
import { noteResults, rankActions, type NoteSearch, type PaletteAction } from "../logic/palette.ts";

export interface Command extends PaletteAction {
  icon: IconName;
  hint?: string;
  run: () => void;
}

interface Props {
  actions: Command[];
  onNote: (result: SearchResult) => void;
  onClose: () => void;
}

type Item = { kind: "note"; key: string; result: SearchResult } | { kind: "action"; key: string; action: Command };

export function Palette({ actions, onNote, onClose }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [last, setLast] = useState<NoteSearch<SearchResult> | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => before?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let current = true;
    const timer = setTimeout(() => {
      api.search({ q, limit: 6 }).then(
        (doc) => current && setLast({ query: q, results: doc.results }),
        (error: Error) => current && setLast({ query: q, results: [], error: error.message }),
      );
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const found = noteResults(query, last);
  const notes: Item[] = found.notes.map((r) => ({ kind: "note", key: `${r.journal} ${r.id} ${r.skill ?? ""}`, result: r }));
  const commands: Item[] = rankActions(actions, query).map((a) => ({ kind: "action", key: a.id, action: a }));
  const items = [...notes, ...commands];
  const at = Math.min(active, Math.max(0, items.length - 1));

  const run = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (item.kind === "note") onNote(item.result);
    else item.action.run();
  };

  const groups: [string, Item[]][] = [
    ["Notes and skills", notes],
    ["Actions", commands],
  ];
  let index = -1;

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="dialog-head">
          <Icon name="command" size={20} />
          <input
            ref={input}
            className="palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={items.length ? `${id}-${at}` : undefined}
            aria-autocomplete="list"
            aria-label="Search notes or run an action"
            placeholder="Search notes or run an action…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(1, items.length));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(items[at]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }
              // Every other key stays in the palette: no single-key shortcuts while it is open.
              e.stopPropagation();
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" id={`${id}-list`} role="listbox" aria-label="Results">
          {found.error && items.length ? <p className="palette-empty" role="status">{found.error}</p> : null}
          {items.length ? (
            groups.map(([label, group]) =>
              group.length ? (
                <div role="group" aria-label={label} key={label}>
                  <div className="palette-group" aria-hidden="true">
                    {label}
                  </div>
                  {group.map((item) => {
                    index++;
                    const i = index;
                    return (
                      <div
                        key={item.key}
                        id={`${id}-${i}`}
                        role="option"
                        aria-selected={i === at}
                        className="palette-item"
                        onMouseMove={() => i !== at && setActive(i)}
                        onClick={() => run(item)}
                      >
                        {item.kind === "note" ? (
                          <>
                            <Icon name={item.result.type === "skill" ? "cube" : "notebook"} />
                            <span className="label">{item.result.type === "skill" ? `${item.result.skill} · ${item.result.name}` : item.result.name}</span>
                            <span className="detail">{item.result.verdict ?? "no verdict yet"}</span>
                            <span className="row-meta">{item.result.journal}</span>
                          </>
                        ) : (
                          <>
                            <Icon name={item.action.icon} />
                            <span className="label">{item.action.label}</span>
                            {item.action.hint ? <kbd>{item.action.hint}</kbd> : null}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null,
            )
          ) : (
            <p className="palette-empty" role="status">
              {found.pending ? "Searching…" : found.error ?? `Nothing matches “${query.trim()}”.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
