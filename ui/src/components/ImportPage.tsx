// Import (docs/ui.md §7): paste lines, check them (magpie import --dry-run), then import.
import { useId, useState } from "react";
import { api, type ApiError, type ImportJson, type Scope } from "../api.ts";
import { Icon, type IconName } from "../icons.tsx";
import { countItems, lineTarget, noItemsHint, resultWord, summary } from "../logic/importing.ts";
import { readablePurl } from "../logic/schema.ts";
import { Banner, FieldError } from "./common.tsx";
import { JournalChoice, type ProjectState } from "./fields.tsx";

const EXAMPLE = "- https://github.com/microsoft/playwright-cli — verdict: default for agent browser checks\n- pkg:npm/pdfkit — verdict: avoid | avoid: streamed output for large PDFs";
const ICONS: Record<string, IconName> = { created: "check", updated: "check", unchanged: "check", failed: "warning" };

export function ImportPage({ project, defaultJournal, onImported }: { project: ProjectState; defaultJournal: Scope; onImported: (journal: Scope) => void }) {
  const id = useId();
  const [text, setText] = useState("");
  const [to, setTo] = useState<Scope>(defaultJournal);
  const [result, setResult] = useState<{ doc: ImportJson; dryRun: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<"" | "check" | "import">("");
  const [error, setError] = useState<string | null>(null);
  const items = countItems(text);
  // Import only what was checked: any change to the lines or the journal needs a new check.
  const checked = result?.dryRun && result.text === text && result.doc.items.length > 0;

  async function run(dryRun: boolean) {
    if (!items) return setError("Add at least one line that starts with “- ”.");
    setBusy(dryRun ? "check" : "import");
    setError(null);
    try {
      const doc = await api.importLines({ text, to, dry_run: dryRun });
      setResult({ doc, dryRun, text });
      if (!dryRun) onImported(to);
    } catch (e) {
      const err = e as ApiError;
      const doc = err.document as ImportJson | null;
      // 422: some lines failed; the document still lists every line.
      if (err.status === 422 && doc?.items?.length) {
        setResult({ doc, dryRun, text });
        if (!dryRun) onImported(to);
      } else setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Import</h1>
      <p className="page-lede">
        Works like <code>magpie import</code>: one note per line that starts with a dash. Check the lines first; magpie writes nothing until you import them.
      </p>

      <div className="page-section">
        <div className="field">
          <label className="field-label" htmlFor={`${id}-lines`}>
            Lines
          </label>
          <textarea
            id={`${id}-lines`}
            name="lines"
            className="textarea mono-input"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            spellCheck={false}
            aria-describedby={`${id}-help`}
            autoFocus
          />
          <p className="field-help" id={`${id}-help`}>

            One item per line: <code>{"- <url-or-name> — verdict: … | use: … | avoid: …"}</code>. The Verdict stays your own words; use and avoid become drafts.{" "}
            {items ? `${items} ${items === 1 ? "item" : "items"}.` : text.trim() ? `No items yet. ${noItemsHint(text)}` : "No items yet."}
          </p>
        </div>
        <JournalChoice value={to} onChange={(j) => { setTo(j); setResult(null); }} project={project} />
        {error ? <FieldError>{error}</FieldError> : null}
        <div className="form-actions">
          <button type="button" className={checked ? "button secondary" : "button primary"} onClick={() => void run(true)} disabled={busy !== ""}>
            {busy === "check" ? "Checking…" : "Check lines"}
          </button>
          <button type="button" className={checked ? "button primary" : "button secondary"} onClick={() => void run(false)} disabled={busy !== "" || !checked}>
            {busy === "import" ? "Importing…" : checked && result ? `Import ${result.doc.items.length} ${result.doc.items.length === 1 ? "line" : "lines"}` : "Import"}
          </button>
          {!checked && items ? <span className="hint">Check the lines before you import them.</span> : null}
        </div>
      </div>

      {result ? (
        <section className="page-section" aria-labelledby={`${id}-result`}>
          <h2 className="section-label" id={`${id}-result`}>
            {result.dryRun ? "Check" : "Imported"}
          </h2>
          <p role="status">{summary(result.doc.items, result.dryRun)}</p>
          <table className="result-table">
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col">Item</th>
                <th scope="col">{result.dryRun ? "What happens" : "Result"}</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {result.doc.items.map((item) => (
                <tr key={item.line}>
                  <td className="tabular">{item.line}</td>
                  <td className="nowrap">
                    <span className="mono">{item.id ? readablePurl(item.id) : lineTarget(result.text, item.line)}</span>
                  </td>
                  <td className="nowrap">
                    <span className={`result ${item.result}`}>
                      <Icon name={ICONS[item.result]} size={14} />
                      {resultWord(item.result, result.dryRun)}
                    </span>
                  </td>
                  <td>{[item.error, ...item.warnings].filter(Boolean).join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.doc.error && !result.doc.items.length ? <Banner tone="danger">{result.doc.error}</Banner> : null}
        </section>
      ) : null}
    </div>
  );
}
