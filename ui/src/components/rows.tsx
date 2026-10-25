// List rows (DESIGN.md, List row): two lines. Line 1: the name (full name on hover) and the type;
// line 2: the Verdict, muted, or "no verdict yet". The Inbox badge is left out where every row is
// an inbox note.
import { Fragment } from "react";
import type { NoteSummary } from "../../../src/core/documents.ts";
import type { Scope, SearchResult } from "../api.ts";
import { whyLine } from "../logic/search.ts";
import type { SuggestItem } from "../logic/suggest.ts";
import { visible } from "../logic/text.ts";
import { AlternativeName, StatusBadge } from "./common.tsx";

const typeOf = (id: string | null) => id?.match(/^pkg:([^/]+)/)?.[1] ?? "";

export function NoteRow({ note, showInbox }: { note: NoteSummary; showInbox: boolean }) {
  const name = visible(note.name ?? note.file);
  return (
    <>
      <span className="row-line">
        <span className="row-name" title={name}>
          {name}
        </span>
        {note.read_only ? <StatusBadge status={null} readOnly /> : showInbox && note.status === "inbox" ? <StatusBadge status="inbox" /> : null}
        <span className="row-meta">{visible(typeOf(note.id))}</span>
      </span>
      <span className="row-verdict">{note.read_only ? "can't be read; open it in an editor" : visible(note.verdict) || "no verdict yet"}</span>
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
        <span className="row-name" title={visible(item.name)}>
          {visible(item.name)}
        </span>
        {item.kind === "avoid" ? <span className="badge avoid">{item.nameOnly ? "In use, avoid (name match)" : "In use, avoid"}</span> : null}
        {item.status === "inbox" ? <StatusBadge status="inbox" /> : null}
        <span className="row-meta">
          {item.type} · {item.journal}
        </span>
      </span>
      <span className="row-verdict">{item.verdict === null ? "no verdict yet" : visible(item.verdict)}</span>
      {item.why ? <span className="row-why" title={visible(item.why)}>{visible(item.why)}</span> : null}
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
  const verdict = result.verdict !== null ? visible(result.verdict) : result.type === "skill" ? null : "no verdict yet";
  const why = whyLine(result);
  return (
    <>
      <span className="row-line">
        <span className="row-name" title={visible(result.name)}>
          {visible(result.name)}
        </span>
        {result.type === "skill" ? <span className="chip meta">{visible(result.skill ?? "")}</span> : null}
        {result.status === "inbox" && result.type === "note" ? <StatusBadge status="inbox" /> : null}
        <span className="row-meta">
          {typeOf(result.id)} · {result.journal}
        </span>
      </span>
      <span className="row-verdict">{verdict}</span>
      {why ? <span className="row-why" title={`Matched: ${visible(why)}`}>{`Matched: ${visible(why)}`}</span> : null}
    </>
  );
}
