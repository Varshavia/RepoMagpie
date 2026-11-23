// "Import my GitHub stars" on the Import page (decision 0068, docs/ui.md §7): its own chunk, loaded when
// the person opens it. Reads the starred list through the server, sums it up, shows a table with
// filters, 100 rows a page, the 100 most recently starred new ones checked, and imports the checked
// ones as inbox notes in the Starred tab. Nothing is written until "Import selected".
import { useEffect, useId, useMemo, useState } from "react";
import { get, write, type ApiError, type Scope, type StarsJson } from "../api.ts";
import { defaultChecked, languagesOf, NO_FILTERS, PAGE_ROWS, shownStars, skipped, starsSummary, type StarFilters, type StarRow } from "../logic/stars.ts";
import { visible } from "../logic/text.ts";
import { Banner } from "./common.tsx";
import "./StarsImport.css";

export default function StarsImport({ to, onImported }: { to: Scope; onImported: (journal: Scope) => void }) {
  const id = useId();
  const [doc, setDoc] = useState<StarsJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<StarFilters>(NO_FILTERS);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<StarsJson | null>(null);

  const load = () => {
    setError(null);
    setDoc(null);
    get<StarsJson>("/api/stars", { to }).then(setDoc, (e: ApiError) => setError(e.message));
  };
  useEffect(load, [to]);

  const stars = useMemo(() => doc?.stars ?? [], [doc]);
  const shown = useMemo(() => shownStars(stars, filters), [stars, filters]);
  const languages = useMemo(() => languagesOf(stars), [stars]);
  // The filters set the checks, as the command's flags set its selection.
  useEffect(() => {
    setChecked(defaultChecked(stars, filters));
    setPage(0);
  }, [stars, filters]);

  const rows = shown.slice(page * PAGE_ROWS, (page + 1) * PAGE_ROWS);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_ROWS));
  const newShown = shown.filter((s) => !skipped(s));
  const allChecked = newShown.length > 0 && newShown.every((s) => checked.has(s.name));
  const set = (key: keyof StarFilters, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const toggle = (name: string) => setChecked((c) => {
    const next = new Set(c);
    if (!next.delete(name)) next.add(name);
    return next;
  });

  async function importChecked() {
    setBusy(true);
    setError(null);
    try {
      const result = await write<StarsJson>("POST", "/api/stars", { to, names: [...checked] });
      setDone(result);
      onImported(to);
      load();
    } catch (e) {
      const err = e as ApiError;
      const result = err.document as StarsJson | null;
      if (err.status === 422 && result?.items?.length) {
        setDone(result);
        onImported(to);
        load();
      } else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !doc) {
    return (
      <Banner tone="danger" action={<button type="button" className="button secondary" onClick={load}>Try again</button>}>
        {error}
      </Banner>
    );
  }
  if (!doc) return <p className="field-help" role="status">Reading your stars from GitHub…</p>;

  return (
    <div className="stars-import">
      <p role="status">{starsSummary(doc)}</p>
      {doc.languages.length ? <p className="field-help">Top languages: {doc.languages.slice(0, 5).map((c) => `${visible(c.name)} ${c.count}`).join(", ")}</p> : null}
      {doc.topics.length ? <p className="field-help">Top topics: {doc.topics.slice(0, 5).map((c) => `${visible(c.name)} ${c.count}`).join(", ")}</p> : null}
      {doc.warnings.map((w) => <Banner key={w} tone="warning">{visible(w)}</Banner>)}
      {done ? (
        <p className="stars-done" role="status">
          {`Imported ${done.created} starred ${done.created === 1 ? "note" : "notes"}${done.failed ? `, ${done.failed} failed` : ""}. They are in the Inbox's Starred tab until you write a Verdict.`}
        </p>
      ) : null}

      <div className="filters stars-filters">
        <select className="select" aria-label="Language" value={filters.language} onChange={(e) => set("language", e.target.value)}>
          <option value="">Any language</option>
          {languages.map((l) => <option key={l} value={l}>{visible(l)}</option>)}
        </select>
        <input className="input" aria-label="Topic" placeholder="Topic" value={filters.topic} onChange={(e) => set("topic", e.target.value)} spellCheck={false} />
        <label className="stars-since">
          <span>Starred since</span>
          <input className="input" type="date" value={filters.since} onChange={(e) => set("since", e.target.value)} />
        </label>
        <button type="button" className="link-button" onClick={() => setChecked(new Set())} disabled={!checked.size}>
          Uncheck all
        </button>
      </div>

      {shown.length ? (
        <table className="result-table stars-table" aria-labelledby={`${id}-caption`}>
          <caption id={`${id}-caption`} className="visually-hidden">Your GitHub stars</caption>
          <thead>
            <tr>
              <th scope="col">
                <input type="checkbox" aria-label="Check every new star shown" checked={allChecked} disabled={!newShown.length}
                  onChange={() => setChecked((c) => {
                    const next = new Set(c);
                    for (const s of newShown) allChecked ? next.delete(s.name) : next.add(s.name);
                    return next;
                  })} />
              </th>
              <th scope="col">Name</th>
              <th scope="col">Description</th>
              <th scope="col">Language</th>
              <th scope="col">Topics</th>
              <th scope="col">Starred</th>
              <th scope="col">In journal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => <Row key={s.name} star={s} checked={checked.has(s.name)} onToggle={() => toggle(s.name)} />)}
          </tbody>
        </table>
      ) : (
        <p className="field-help">No star matches these filters.</p>
      )}
      {pages > 1 ? (
        <div className="stars-pages">
          <button type="button" className="button secondary" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>Previous</button>
          <span className="tabular">{`Page ${page + 1} of ${pages}`}</span>
          <button type="button" className="button secondary" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages}>Next</button>
        </div>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="form-actions">
        <button type="button" className="button primary" onClick={() => void importChecked()} disabled={busy || !checked.size}>
          {busy ? "Importing…" : `Import selected (${checked.size.toLocaleString("en-US")})`}
        </button>
        <span className="hint">Each becomes an inbox note in your {to} journal, marked starred.</span>
      </div>
    </div>
  );
}

function Row({ star, checked, onToggle }: { star: StarRow; checked: boolean; onToggle: () => void }) {
  const name = visible(star.name);
  const noted = skipped(star);
  return (
    <tr>
      <td>
        <input type="checkbox" aria-label={`Import ${name}`} checked={!noted && checked} disabled={noted} onChange={onToggle} />
      </td>
      <td className="mono">{name}{star.archived ? <span className="chip meta">archived</span> : null}</td>
      <td>{star.description ? visible(star.description) : "–"}</td>
      <td>{star.language ? visible(star.language) : "–"}</td>
      <td>{star.topics.slice(0, 4).map(visible).join(", ") || "–"}</td>
      <td className="nowrap tabular">{star.starred}</td>
      <td>{star.in_journal.length ? star.in_journal.join(", ") : star.in_trash.length ? `${star.in_trash.join(", ")} trash` : "–"}</td>
    </tr>
  );
}
