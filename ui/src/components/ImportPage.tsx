// Import (docs/ui.md §7): paste lines, check them (magpie import --dry-run), then import.
import { useId, useState } from "react";
import { api, type ApiError, type ImportJson, type Scope } from "../api.ts";
import { Icon, type IconName } from "../icons.tsx";
import { countItems, noItemsHint, rows, summary, writes } from "../logic/importing.ts";
import { readablePurl } from "../logic/schema.ts";
import { Banner, FieldError } from "./common.tsx";
import { JournalChoice, type ProjectState } from "./fields.tsx";

const EXAMPLE = "https://github.com/microsoft/playwright-cli\nhttps://www.npmjs.com/package/pdfkit\n- [zod](https://github.com/colinhacks/zod)";
const ICONS: Record<string, IconName> = { created: "check", updated: "check", unchanged: "check", failed: "warning", skipped: "warning" };

export function ImportPage({ project, defaultJournal, onImported }: { project: ProjectState; defaultJournal: Scope; onImported: (journal: Scope) => void }) {
  const id = useId();
  const [text, setText] = useState("");
  const [to, setTo] = useState<Scope>(defaultJournal);
  const [result, setResult] = useState<{ doc: ImportJson; dryRun: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<"" | "check" | "import">("");
  const [error, setError] = useState<string | null>(null);
  const items = countItems(text);
  // Import only what was checked: any change to the lines or the journal needs a new check.
  const checked = result?.dryRun && result.text === text ? writes(result.doc) : 0;

  async function run(dryRun: boolean) {
    if (!items) return setError("Paste at least one repo URL or package name.");
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
      <p className="page-lede">Have a list of repos or packages? Paste it here, and each line becomes an inbox note you can review later.</p>

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
          <p className="field-help">
            <span id={`${id}-help`}>{items ? `One repo URL or package name per line. ${items} ${items === 1 ? "item" : "items"}.` : text.trim() ? noItemsHint(text) : "One repo URL or package name per line."}</span>{" "}
            <button type="button" className="link-button" onClick={() => setText(EXAMPLE)}>
              Paste an example
            </button>
          </p>
          <details className="disclosure">
            <summary>Add your own Verdict on the same line</summary>
            <p>
              After the name, write a dash and your words: <code>{"pkg:npm/pdfkit — verdict: fine for one-page PDFs | use: invoices | avoid: large reports"}</code>. The Verdict stays as you wrote it; use and avoid become drafts you review.
            </p>
          </details>
        </div>
        <JournalChoice value={to} onChange={(j) => { setTo(j); setResult(null); }} project={project} />
        {error ? <FieldError>{error}</FieldError> : null}
        <div className="form-actions">
          <button type="button" className={checked ? "button secondary" : "button primary"} onClick={() => void run(true)} disabled={busy !== ""}>
            {busy === "check" ? "Checking…" : "Check lines"}
          </button>
          <button type="button" className={checked ? "button primary" : "button secondary"} onClick={() => void run(false)} disabled={busy !== "" || !checked}>
            {busy === "import" ? "Importing…" : checked ? `Import ${checked} ${checked === 1 ? "line" : "lines"}` : "Import"}
          </button>
          {!checked && items ? <span className="hint">{result?.dryRun && result.text === text ? "No line here is new." : "Check the lines before you import them."}</span> : null}
        </div>
      </div>

      {result ? (
        <section className="page-section" aria-labelledby={`${id}-result`}>
          <h2 className="section-label" id={`${id}-result`}>
            {result.dryRun ? "Check" : "Imported"}
          </h2>
          <p role="status">{summary(result.doc, result.dryRun)}</p>
          <table className="result-table import-table">
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col">Becomes</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows(result.doc, result.text, result.dryRun).map((row) => (
                <tr key={row.line}>
                  <td>
                    <span className="mono">{row.text}</span>
                  </td>
                  <td>{row.becomes ? <span className="mono">{readablePurl(row.becomes)}</span> : "–"}</td>
                  <td>
                    <span className={`result ${row.result}`}>
                      <Icon name={ICONS[row.result]} size={14} />
                      {row.status}
                    </span>
                    {row.why ? <span className="result-why">{row.why}</span> : null}
                  </td>
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
