// Check a package (docs/ui.md §7, Recall): what magpie recall finds, and what the hook does with it
// in each agent (spec §6, decisions 0024 and 0036): an exact avoid note asks you first, or stops the
// first try where the agent can't ask; any other match informs where the agent shows it; the hook
// never blocks an install for good.
import { useId, useState } from "react";
import { api, type ApiError, type PackageType, type RecallJson, type Scope } from "../api.ts";
import { Icon } from "../icons.tsx";
import { concernLabel, hookWouldAsk, packageLabel } from "../logic/schema.ts";
import { homePath, visible } from "../logic/text.ts";
import { MOD } from "../platform.ts";
import { AlternativeName, FieldError } from "./common.tsx";
import { TypeChoice } from "./fields.tsx";

type Match = RecallJson["matches"][number];

export function RecallPage({ home, onOpenNote, onAdd, onSearch }: { home: string | null } & Opening) { // paths under home are shown with ~
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
      <p className="page-lede">About to install something? Type its name to see what your journals say before you add it.</p>

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
            For example <code>moment</code>; separate several names with spaces.
          </p>
          <details className="disclosure">
            <summary>How this works</summary>
            <p>
              Write names as you would install them; a version or a PURL works too. Each card shows the note's Verdict, when to use and avoid it, and what the hook does before an install in each agent. VS Code gets no hook; there, the MCP server and the skill check installs. The command line does the same: <code>repomagpie recall</code>.
            </p>
          </details>
        </div>
        <TypeChoice value={type} onChange={setType} />
        {error ? <FieldError>{error}</FieldError> : null}
      </form>

      {result ? (
        <section className="page-section" aria-label="What the journals say" role="status">
          {result.queries.map((q) => {
            const matches = result.matches.filter((m) => m.query === q);
            return matches.length ? (
              matches.map((m) => <Card key={`${m.query} ${m.journal} ${m.id}`} match={m} home={home} onOpenNote={onOpenNote} onAdd={onAdd} onSearch={onSearch} />)
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
  onSearch: (name: string) => void; // one whose name several notes have
}

// The card as magpie recall prints it, with every alternative (decision 0029): each links to its
// note, or, without one, is muted and opens Add (missing) or Search (ambiguous).
function Card({ match, home, onOpenNote, onAdd, onSearch }: { match: Match; home: string | null } & Opening) {
  const ask = hookWouldAsk(match);
  const { type, name } = packageLabel(match.id);
  const draft = (list: "use_when" | "avoid_when") => (match.drafts as string[]).includes(list);
  return (
    <article className={ask ? "recall-card ask" : "recall-card"} aria-label={visible(name)}>
      <p>
        <strong>{visible(name)}</strong>
        <span className="field-help">{` · ${type} · ${match.journal} journal${match.confidence === "name-only" ? " · name match only" : ""}`}</span>
      </p>
      <p className={ask ? "hook-line ask" : "hook-line"}>
        <Icon name={ask ? "warning" : "check"} size={14} />
        {ask ? (
          <span>
            In Claude Code, Gemini CLI and Antigravity CLI, the hook asks you first.
            <br />
            In Codex CLI, Cursor and Copilot CLI, it stops the first try, and your agent asks you.
          </span>
        ) : (
          "The install goes ahead; in Claude Code, Codex CLI and Gemini CLI, the hook shows this note to the agent."
        )}
      </p>
      <div className="recall-line">
        <span className="section-label">Verdict</span>
        <span>{match.verdict === null ? "[inbox] no verdict yet" : visible(match.verdict)}</span>
      </div>
      {match.avoid_when.length ? (
        <div className="recall-line">
          <span className="section-label avoid">Avoid when</span>
          <span>
            {draft("avoid_when") ? "(draft) " : ""}
            {visible(match.avoid_when.join("; "))}
          </span>
        </div>
      ) : null}
      {match.alternatives.length ? (
        <div className="recall-line" role="group" aria-label="Alternatives">
          <span className="section-label">Alternatives</span>
          <ul className="recall-alternatives">
            {match.alternatives.map((a, i) => (
              <li key={`${a.name} ${i}`}>
                <AlternativeName alternative={a} onOpen={onOpenNote} onAdd={onAdd} onSearch={onSearch} />
                {concernLabel(a.name, a.path === null)}
                {a.id ? `: ${a.verdict === null ? "[inbox] no verdict yet" : visible(a.verdict)}${a.avoid ? " (you also noted to avoid it)" : ""}` : null}
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
            {visible(match.use_when.join("; "))}
          </span>
        </div>
      ) : null}
      <p className="mono field-help">{visible(homePath(match.path, home))}</p>
    </article>
  );
}
