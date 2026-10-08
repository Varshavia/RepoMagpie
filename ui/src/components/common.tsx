// Small components from DESIGN.md, "Components". Every coloured item also carries a word or a shape.
import type { MouseEvent, ReactNode } from "react";
import type { Alternative } from "../../../src/core/recall.ts";
import { Icon } from "../icons.tsx";
import { noteHash, unresolvedTitle, type Scope } from "../logic/links.ts";

// A plain click opens the note in the app; a click with a modifier, or the middle button, is left to
// the browser (a new tab opens the same note from its address).
export const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

// An alternative's name (decision 0029), as a [[link]] shows: one with a note links to it; one
// without is muted with a dashed underline and says so in words. A missing one opens Add, an
// ambiguous one Search, with its name. In a list row it is no tab stop (the row is one option of
// the listbox); the note pane has the same links.
export function AlternativeName({ alternative: a, onOpen, onAdd, onSearch, inRow = false }: {
  alternative: Alternative;
  onOpen: (journal: Scope, id: string) => void;
  onAdd: (journal: Scope, target: string) => void;
  onSearch: (name: string) => void;
  inRow?: boolean;
}) {
  const tabIndex = inRow ? -1 : undefined;
  if (a.id) {
    const id = a.id;
    return (
      <a
        className="wikilink"
        href={noteHash(a.journal, id)}
        tabIndex={tabIndex}
        onClick={(e) => {
          e.stopPropagation();
          if (!plainClick(e)) return;
          e.preventDefault();
          onOpen(a.journal, id);
        }}
      >
        <span translate="no">{a.name}</span>
      </a>
    );
  }
  const why = unresolvedTitle({ target: a.name, reason: a.reason });
  const ambiguous = a.reason === "ambiguous";
  return (
    <button
      type="button"
      className="wikilink unresolved"
      title={why}
      tabIndex={tabIndex}
      onClick={(e) => {
        e.stopPropagation();
        if (ambiguous) onSearch(a.name);
        else onAdd(a.journal, a.name);
      }}
    >
      <span translate="no">{a.name}</span>
      <span className="visually-hidden">{` (${why}. ${ambiguous ? "Search for it" : "Add it"}.)`}</span>
    </button>
  );
}

export function StatusBadge({ status, readOnly = false }: { status: "inbox" | "reviewed" | null; readOnly?: boolean }) {
  if (readOnly) return <span className="badge read-only">Read-only</span>;
  if (status === null) return null;
  return (
    <span className={`badge ${status}`}>
      <span className="badge-dot" aria-hidden="true" />
      {status === "inbox" ? "Inbox" : "Reviewed"}
    </span>
  );
}

export function DraftBadge() {
  return <span className="badge draft">Draft</span>;
}

export function Banner({ tone, children, action }: { tone: "warning" | "danger" | "muted"; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner ${tone}`} role={tone === "muted" ? "note" : "alert"}>
      <Icon name="warning" />
      <span className="text">{children}</span>
      {action}
    </div>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="field-error" role="alert">
      <Icon name="warning" size={14} />
      {children}
    </p>
  );
}

export function EmptyState({ children, action, center = false }: { children: ReactNode; action?: ReactNode; center?: boolean }) {
  return (
    <div className={center ? "empty-state center" : "empty-state"}>
      <p>{children}</p>
      {action}
    </div>
  );
}

// Bars shaped like list rows; no spinners in lists (DESIGN.md, Components).
const WIDTHS = [[34, 52], [22, 61], [41, 38], [28, 55], [37, 44], [25, 58], [31, 49], [44, 33]];

export function SkeletonRows({ count = 8, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-label={label}>
      {Array.from({ length: count }, (_, i) => {
        const [a, b] = WIDTHS[i % WIDTHS.length];
        return (
          <div className="skeleton-row" key={i} aria-hidden="true">
            <span className="skeleton" style={{ width: `${a}%` }} />
            <span className="skeleton" style={{ width: `${a + b}%` }} />
          </div>
        );
      })}
    </div>
  );
}

export function SkeletonNote() {
  return (
    <div className="note" role="status" aria-label="Loading the note">
      <div aria-hidden="true" className="stack">
        <span className="skeleton" style={{ width: "40%", height: 20 }} />
        <span className="skeleton" style={{ width: "28%" }} />
        <span className="skeleton" style={{ width: "100%", height: 72, marginTop: 16, borderRadius: 8 }} />
        <span className="skeleton" style={{ width: "18%", marginTop: 24 }} />
        <span className="skeleton" style={{ width: "72%" }} />
        <span className="skeleton" style={{ width: "64%" }} />
      </div>
    </div>
  );
}

export interface ToastItem {
  id: number;
  text: string;
}

// Short confirmations, bottom right, 4 s. Never the only place an error appears.
export function Toasts({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <Icon name="check" />
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}
