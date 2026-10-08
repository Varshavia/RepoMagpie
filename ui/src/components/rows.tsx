// List rows (DESIGN.md, List row): two lines. Line 1: the name (full name on hover) and the type;
// line 2: the Verdict, muted, or "no verdict yet". The Inbox badge is left out where every row is
// an inbox note.
import { Fragment } from "react";
import type { NoteSummary } from "../../../src/core/documents.ts";
import type { Scope, SearchResult } from "../api.ts";
import type { SuggestItem } from "../logic/suggest.ts";
import { AlternativeName, StatusBadge } from "./common.tsx";

const typeOf = (id: string | null) => id?.match(/^pkg:([^/]+)/)?.[1] ?? "";

export function NoteRow({ note, showInbox }: { note: NoteSummary; showInbox: boolean }) {
  const name = note.name ?? note.file;
  return (
    <>
      <span className="row-line">
        <span className="row-name" title={name}>
          {name}
        </span>
        {note.read_only ? <StatusBadge status={null} readOnly /> : showInbox && note.status === "inbox" ? <StatusBadge status="inbox" /> : null}
        <span className="row-meta">{typeOf(note.id)}</span>
      </span>
      <span className="row-verdict">{note.read_only ? "can't be read; open it in an editor" : note.verdict || "no verdict yet"}</span>
    </>
  );
}

// A suggestion: a candidate, or a dependency you noted to avoid (labelled in words, not by colour alone).
// An avoid row's third line names its alternatives, as magpie suggest's Instead line does.
export function SuggestRow({ item, onOpen, onAdd, onSearch }: {
  item: SuggestItem;
  onOpen: (journal: Scope, id: string) => void;
  onAdd: (journal: Scope, target: string) => void;
  onSearch: (name: string) => void;
}) {
  return (
    <>
      <span className="row-line">
        <span className="row-name" title={item.name}>
          {item.name}
        </span>
        {item.kind === "avoid" ? <span className="badge avoid">{item.nameOnly ? "In use, avoid (name match)" : "In use, avoid"}</span> : null}
        {item.status === "inbox" ? <StatusBadge status="inbox" /> : null}
        <span className="row-meta">
          {item.type} · {item.journal}
        </span>
      </span>
      <span className="row-verdict">{item.verdict ?? "no verdict yet"}</span>
      {item.why ? <span className="row-why" title={item.why}>{item.why}</span> : null}
      {item.instead.length ? (
        <span className="row-why">
          {"Instead: "}
          {item.instead.map((a, i) => (
            <Fragment key={`${a.name} ${i}`}>
              {i ? ", " : null}
              <AlternativeName alternative={a} onOpen={onOpen} onAdd={onAdd} onSearch={onSearch} inRow />
            </Fragment>
          ))}
          {item.moreInstead ? `, +${item.moreInstead} more` : null}
        </span>
      ) : null}
    </>
  );
}

export function SearchRow({ result }: { result: SearchResult }) {
  const verdict = result.type === "skill" ? result.verdict : result.verdict ?? "no verdict yet";
  return (
    <>
      <span className="row-line">
        <span className="row-name" title={result.name}>
          {result.name}
        </span>
        {result.type === "skill" ? <span className="chip meta">{result.skill}</span> : null}
        {result.status === "inbox" && result.type === "note" ? <StatusBadge status="inbox" /> : null}
        <span className="row-meta">
          {typeOf(result.id)} · {result.journal}
        </span>
      </span>
      <span className="row-verdict">{verdict}</span>
    </>
  );
}
