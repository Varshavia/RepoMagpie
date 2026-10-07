// The note's alternatives (decision 0027, docs/ui.md §7): chips that open the note (or look
// unresolved, like any [[link]]), each with a remove button, and "+ Add" with the [[ autocomplete's
// list; free text names a subject without a note. "Alternative to: …" shows the notes that list this
// one: one side is enough, so it comes from backlinks.
import { useId, useRef, useState, type ReactNode } from "react";
import type { Backlink, Link } from "../../../src/core/links.ts";
import { Icon } from "../icons.tsx";
import { alternativeEntry, alternativeOptions, linkText, withAlternative, type LinkNote } from "../logic/links.ts";
import { readablePurl } from "../logic/schema.ts";
import { FieldError } from "./common.tsx";

interface Props {
  alternatives: Link[]; // the note's links from the field
  raw: unknown; // the field as written (the Note document's frontmatter), for Undo
  alternativeTo: Backlink[];
  notes: LinkNote[]; // the journal's notes
  self: string | null;
  editable: boolean;
  saving: boolean;
  onSave: (targets: string[], message: string) => Promise<string | null>; // the error, or null
  link: (target: string, text: string) => ReactNode; // a [[link]] as the note view shows it
  noteLink: (id: string, text: string) => ReactNode; // a link to a note of this journal
}

export function Alternatives({ alternatives, raw, alternativeTo, notes, self, editable, saving, onSave, link, noteLink }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // The last one removed, until the next change: Undo puts it back where it was, as it was written.
  const [removed, setRemoved] = useState<{ entry: string; at: number; name: string } | null>(null);
  const targets = alternatives.map((l) => l.target);
  const options = adding ? alternativeOptions(notes, query, targets, self) : [];
  const at = Math.min(active, options.length - 1);

  async function save(next: string[], message: string) {
    setError(null);
    const problem = await onSave(next, message);
    if (problem) setError(problem);
    return !problem;
  }

  async function add(target: string, name: string) {
    const next = withAlternative(targets, target);
    if (next === targets) return close();
    if (await save(next, `${name} added as an alternative`)) {
      setRemoved(null);
      close();
    }
  }

  // Core keeps the other entries as written; only this one goes.
  async function remove(at: number, name: string) {
    const entry = alternativeEntry(raw, alternatives[at]);
    if (await save(targets.filter((_, j) => j !== at), `${name} removed from alternatives`)) setRemoved({ entry, at, name });
  }

  async function undo() {
    if (!removed) return;
    const next = [...targets.slice(0, removed.at), removed.entry, ...targets.slice(removed.at)];
    if (await save(next, `${removed.name} is an alternative again`)) setRemoved(null);
  }

  function close() {
    setAdding(false);
    setQuery("");
    setActive(0);
    setError(null);
  }

  if (!editable && !alternatives.length && !alternativeTo.length) return null;

  return (
    <section className="alternatives" aria-labelledby={`${id}-label`}>
      <div className="alternatives-row">
        <h3 className="section-label" id={`${id}-label`}>
          Alternatives
        </h3>
        {alternatives.length ? (
          <ul className="chips">
            {alternatives.map((l, i) => (
              <li key={`${l.target} ${i}`} className="chip alternative">
                {link(l.target, l.target)}
                {editable ? (
                  <button
                    type="button"
                    className="chip-remove"
                    onClick={() => void remove(i, linkText(l))}
                    disabled={saving}
                    aria-label={`Remove ${linkText(l)} from alternatives`}
                    title="Remove"
                  >
                    <Icon name="x" size={12} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : editable ? null : (
          <span className="muted">None</span>
        )}
        {editable && !adding ? (
          <button
            type="button"
            className="button ghost"
            aria-label="Add an alternative"
            onClick={() => {
              setAdding(true);
              requestAnimationFrame(() => input.current?.focus());
            }}
          >
            <Icon name="plus" />
            Add
          </button>
        ) : null}
      </div>
      {adding ? (
        <div className="link-input alternatives-add">
          <input
            ref={input}
            className="input"
            name="alternative"
            role="combobox"
            aria-label="Add an alternative: a note, or the name of something without one"
            aria-expanded={options.length > 0}
            aria-controls={options.length ? `${id}-options` : undefined}
            aria-activedescendant={options.length ? `${id}-option-${at}` : undefined}
            aria-autocomplete="list"
            placeholder="A note, or a name, such as puppeteer…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (options.length) setActive((at + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
              } else if ((e.key === "Enter" || e.key === "Tab") && options.length && !e.shiftKey) {
                e.preventDefault();
                const option = options[at];
                void add(option.target, option.kind === "note" ? (option.note.name ?? option.target) : option.target);
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
              // Every key stays here: no single-key shortcuts while you type a name.
              e.stopPropagation();
            }}
            onBlur={(e) => {
              if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null) && !query.trim()) close();
            }}
            autoComplete="off"
            spellCheck={false}
            disabled={saving}
          />
          {options.length ? (
            <ul className="link-options" id={`${id}-options`} role="listbox" aria-label="Alternatives to add">
              {options.map((option, i) => (
                <li
                  key={option.kind === "note" ? option.note.file : "text"}
                  id={`${id}-option-${i}`}
                  role="option"
                  aria-selected={i === at}
                  className="link-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => i !== at && setActive(i)}
                  onClick={() => void add(option.target, option.kind === "note" ? (option.note.name ?? option.target) : option.target)}
                >
                  {option.kind === "note" ? (
                    <>
                      <span className="label" translate="no">
                        {option.note.name ?? option.target}
                      </span>
                      <span className="detail mono" translate="no">
                        {option.target}
                      </span>
                    </>
                  ) : (
                    <span className="label">{`Add “${option.target}”, no note yet`}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
      {removed && editable ? (
        <p className="field-help">
          <span translate="no">{removed.name}</span>
          {" removed. "}
          <button type="button" className="link-button" onClick={() => void undo()} disabled={saving}>
            Undo
          </button>
        </p>
      ) : null}
      {alternativeTo.length ? (
        <p className="alternative-to">
          <span className="muted">Alternative to: </span>
          {alternativeTo.map((b, i) => (
            <span key={b.id}>
              {i ? ", " : null}
              {noteLink(b.id, b.name ?? readablePurl(b.id))}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
