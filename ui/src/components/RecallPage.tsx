// Check a package (docs/ui.md §7, Recall): what magpie recall finds, and what the Claude Code hook
// would do with it (spec §6, decision 0024): an exact avoid note asks you first; any other match
// informs; magpie never blocks an install.
import { useId, useState } from "react";
import { api, type ApiError, type PackageType, type RecallJson, type Scope } from "../api.ts";
import { Icon } from "../icons.tsx";
import { hookWouldAsk, packageLabel } from "../logic/schema.ts";
import { homePath } from "../logic/text.ts";
import { MOD } from "../platform.ts";
import { AlternativeName, FieldError } from "./common.tsx";
import { TypeChoice } from "./fields.tsx";

type Match = RecallJson["matches"][number];

export function RecallPage({ home, onOpenNote, onAdd }: { home: string | null } & Opening) { // paths under home are shown with ~
  const id = useId();
  const [text, setText] = useState("");
  const [type, setType] = useState<PackageType | "">("");
  const [result, setResult] = useState<{ queries: string[]; matches: Match[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    const queries = text.split(/\s+/).filter(Boolean);
    if (!queries.length) return setError("Type at least one package name.");
    setBusy(true);
    setError(null);
    try {
      const doc = await api.recall(queries, type || undefined);
      setResult({ queries, matches: doc.matches });
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Check a package</h1>
      <p className="page-lede">
        What your journals say before an install: the same lookup as <code>magpie recall</code>, and what the Claude Code hook would show.
      </p>

      <form
        className="page-section"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor={`${id}-packages`}>
            Packages
          </label>
          <div className="input-row">
            <input
              id={`${id}-packages`}
              name="packages"
              className="input mono-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="pdfkit requests@2.31"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              aria-describedby={`${id}-help`}
            />
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "Checking…" : "Check"}
            </button>
          </div>
          <p className="field-help" id={`${id}-help`}>
            Names as you would install them, separated by spaces. A version or a PURL works too.
          </p>
        </div>
        <TypeChoice value={type} onChange={setType} />
        {error ? <FieldError>{error}</FieldError> : null}
      </form>

      {result ? (
        <section className="page-section" aria-label="What the journals say" role="status">
          {result.queries.map((q) => {
            const matches = result.matches.filter((m) => m.query === q);
            return matches.length ? (
              matches.map((m) => <Card key={`${m.query} ${m.journal} ${m.id}`} match={m} home={home} onOpenNote={onOpenNote} onAdd={onAdd} />)
            ) : (
              <p className="recall-card" key={q}>
                <span>
                  <span className="mono">{q}</span>: no note in your journals. The hook stays silent.
                </span>
              </p>
            );
          })}
        </section>
      ) : (
        <p className="field-help page-section">{`Tip: open the palette with ${MOD}+K and type “check”.`}</p>
      )}
    </div>
  );
}

interface Opening {
  onOpenNote: (journal: Scope, id: string) => void; // an alternative with a note
  onAdd: (journal: Scope, target: string) => void; // one without
}

// The card as magpie recall prints it, with every alternative (decision 0029): each links to its
// note, or, without one, is muted and opens Add.
function Card({ match, home, onOpenNote, onAdd }: { match: Match; home: string | null } & Opening) {
  const ask = hookWouldAsk(match);
  const { type, name } = packageLabel(match.id);
  const draft = (list: "use_when" | "avoid_when") => (match.drafts as string[]).includes(list);
  return (
    <article className={ask ? "recall-card ask" : "recall-card"} aria-label={name}>
      <p>
        <strong>{name}</strong>
        <span className="field-help">{` · ${type} · ${match.journal} journal${match.confidence === "name-only" ? " · name match only" : ""}`}</span>
      </p>
      <p className={ask ? "hook-line ask" : "hook-line"}>
        <Icon name={ask ? "warning" : "check"} size={14} />
        {ask ? "Claude Code asks you before installing it." : "Claude Code shows this note to the agent; the install goes ahead."}
      </p>
      <div className="recall-line">
        <span className="section-label">Verdict</span>
        <span>{match.verdict ?? "[inbox] no verdict yet"}</span>
      </div>
      {match.avoid_when.length ? (
        <div className="recall-line">
          <span className="section-label avoid">Avoid when</span>
          <span>
            {draft("avoid_when") ? "(draft) " : ""}
            {match.avoid_when.join("; ")}
          </span>
        </div>
      ) : null}
      {match.alternatives.length ? (
        <div className="recall-line" role="group" aria-label="Alternatives">
          <span className="section-label">Alternatives</span>
          <ul className="recall-alternatives">
            {match.alternatives.map((a, i) => (
              <li key={`${a.name} ${i}`}>
                <AlternativeName alternative={a} onOpen={onOpenNote} onAdd={onAdd} />
                {a.id ? `: ${a.verdict ?? "[inbox] no verdict yet"}${a.avoid ? " (you also noted to avoid it)" : ""}` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {match.use_when.length ? (
        <div className="recall-line">
          <span className="section-label">Use when</span>
          <span>
            {draft("use_when") ? "(draft) " : ""}
            {match.use_when.join("; ")}
          </span>
        </div>
      ) : null}
      <p className="mono field-help">{homePath(match.path, home)}</p>
    </article>
  );
}
