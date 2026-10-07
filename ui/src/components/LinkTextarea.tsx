// A textarea with the [[ autocomplete (docs/ui.md §7): typing [[ lists notes in the same journal,
// filtered by name and file stem as you type. ↑/↓ move, Enter or Tab inserts [[<file stem>|<name>]],
// Esc closes and leaves the text as typed. The list is a listbox the textarea points to with
// aria-activedescendant; a status line tells screen readers when it opens and how to use it.
import { useEffect, useId, useRef, useState, type Ref, type TextareaHTMLAttributes } from "react";
import { insertLink, linkCandidates, linkQuery, type LinkNote } from "../logic/links.ts";

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  notes: LinkNote[]; // the journal's notes
  self: string | null; // the note being edited, left out of the list
  textareaRef?: Ref<HTMLTextAreaElement>;
}

export function LinkTextarea({ value, onValueChange, notes, self, textareaRef, onKeyDown, ...rest }: Props) {
  const id = useId();
  const element = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [closedAt, setClosedAt] = useState<number | null>(null); // the [[ Esc closed the list for
  const query = caret === null ? null : linkQuery(value, caret);
  const options = query && query.start !== closedAt ? linkCandidates(notes, query.query, self) : [];
  const open = options.length > 0;
  const at = Math.min(active, options.length - 1);
  const list = useRef<HTMLUListElement>(null);

  // An editor low in the pane would open the list below the fold: bring it into view.
  useEffect(() => {
    if (open) list.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const track = () => {
    const el = element.current;
    if (el) setCaret(el.selectionStart === el.selectionEnd ? el.selectionStart : null);
  };

  const choose = (note: LinkNote) => {
    if (!query || caret === null) return;
    const next = insertLink(value, query.start, caret, note);
    onValueChange(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => element.current?.setSelectionRange(next.caret, next.caret));
  };

  return (
    <div className="link-input">
      <textarea
        {...rest}
        ref={(el) => {
          element.current = el;
          if (typeof textareaRef === "function") textareaRef(el);
          else if (textareaRef) textareaRef.current = el;
        }}
        value={value}
        onChange={(e) => {
          const next = e.target.selectionStart === e.target.selectionEnd ? e.target.selectionStart : null;
          onValueChange(e.target.value);
          setActive(0);
          setCaret(next);
          if (next === null || linkQuery(e.target.value, next) === null) setClosedAt(null);
        }}
        onSelect={track}
        onBlur={() => setCaret(null)}
        onKeyDown={(e) => {
          if (open && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              e.stopPropagation();
              setActive((at + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
              return;
            }
            if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              choose(options[at]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setClosedAt(query?.start ?? null);
              return;
            }
          }
          onKeyDown?.(e);
        }}
        aria-autocomplete="list"
        aria-controls={open ? `${id}-links` : undefined}
        aria-activedescendant={open ? `${id}-link-${at}` : undefined}
      />
      {open ? (
        <ul ref={list} className="link-options" id={`${id}-links`} role="listbox" aria-label="Notes to link">
          {options.map((note, i) => (
            <li
              key={note.file}
              id={`${id}-link-${i}`}
              role="option"
              aria-selected={i === at}
              className="link-option"
              onMouseDown={(e) => e.preventDefault()} // keep the focus and the caret in the textarea
              onMouseMove={() => i !== at && setActive(i)}
              onClick={() => choose(note)}
            >
              <span className="label" translate="no">
                {note.name ?? note.file.replace(/\.md$/, "")}
              </span>
              <span className="detail mono" translate="no">
                {note.file.replace(/\.md$/, "")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="visually-hidden" role="status">
        {open ? `${options.length} ${options.length === 1 ? "note" : "notes"} to link. Up and down to choose, Enter to insert, Escape to close.` : ""}
      </p>
    </div>
  );
}
