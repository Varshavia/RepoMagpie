// Add (docs/ui.md §7): paste a URL, PURL or name; see the preview; write the Verdict; save. The same
// logic as magpie note, through POST /api/note/preview and POST /api/note.
import { useId, useState, type ReactNode } from "react";
import { api, type ApiError, type NotePreviewJson, type PackageType, type SavedNoteJson, type Scope } from "../api.ts";
import { Icon } from "../icons.tsx";
import { addTopicSuggestions, oneLine } from "../logic/edits.ts";
import { packageLabel, readablePurl } from "../logic/schema.ts";
import { IS_MAC, MOD } from "../platform.ts";
import { Banner, DraftBadge, FieldError } from "./common.tsx";
import { JournalChoice, TopicChips, TypeChoice, type ProjectState } from "./fields.tsx";

interface Props {
  project: ProjectState;
  defaultJournal: Scope;
  initialTarget?: string; // from an unresolved [[link]]
  onOpenNote: (journal: Scope, id: string) => void;
  onSaved: (journal: Scope) => void;
}

export function AddPage({ project, defaultJournal, initialTarget, onOpenNote, onSaved }: Props) {
  const id = useId();
  const [target, setTarget] = useState(initialTarget ?? "");
  const [to, setTo] = useState<Scope>(defaultJournal);
  const [type, setType] = useState<PackageType | "">("");
  const [verdict, setVerdict] = useState("");
  const [preview, setPreview] = useState<NotePreviewJson | null>(null);
  const [tags, setTags] = useState<string[]>([]); // a new note's tags: the preview's, as the user leaves them (decision 0030)
  const [busy, setBusy] = useState<"" | "preview" | "save">("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedNoteJson | null>(null);

  const request = { target: target.trim(), to, type: type || undefined };
  const locked = Boolean(preview?.exists && preview.verdict);

  // Any change to what is being added drops the preview.
  const change = (fn: () => void) => {
    fn();
    setPreview(null);
    setError(null);
  };

  async function doPreview() {
    if (!request.target) return setError("Paste a package name, a PURL or a GitHub URL first.");
    setBusy("preview");
    setError(null);
    setSaved(null);
    try {
      const doc = await api.preview(request);
      setPreview(doc);
      setTags(doc.tags);
    } catch (e) {
      setPreview(null);
      setError((e as ApiError).message);
    } finally {
      setBusy("");
    }
  }

  async function doSave() {
    if (!request.target) return setError("Paste a package name, a PURL or a GitHub URL first.");
    if (locked) return;
    setBusy("save");
    setError(null);
    try {
      const text = oneLine(verdict);
      // The tags shown are the ones written; the save appends the new ones to tags.md.
      const doc = await api.save({ ...request, text: text || undefined, tags: preview && !preview.exists ? tags : undefined });
      setSaved(doc);
      setTarget("");
      setVerdict("");
      setPreview(null);
      onSaved(to);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div
      className="page"
      onKeyDown={(e) => {
        if ((IS_MAC ? e.metaKey : e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          void doSave();
        }
      }}
    >
      <h1 className="page-title">Add a note</h1>
      <p className="page-lede">
        Works like <code>magpie note</code>. For a GitHub URL, magpie fetches the repository's description, licence and skills as drafts. magpie writes nothing until you choose Save note.
      </p>

      <form
        className="page-section"
        onSubmit={(e) => {
          e.preventDefault();
          void doPreview();
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor={`${id}-target`}>
            Package, PURL or GitHub URL
          </label>
          <div className="input-row">
            <input
              id={`${id}-target`}
              name="target"
              className="input mono-input"
              value={target}
              onChange={(e) => change(() => setTarget(e.target.value))}
              placeholder="https://github.com/microsoft/playwright-cli"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              aria-invalid={error && !preview ? true : undefined}
            />
            <button type="submit" className="button secondary" disabled={busy !== ""}>
              {busy === "preview" ? "Checking…" : "Preview"}
            </button>
          </div>
          <p className="field-help">
            For example <code>pdfkit</code>, the package URL (PURL) <code>pkg:pypi/requests</code>, or a repository URL. Only a GitHub URL makes magpie contact GitHub.
          </p>
        </div>
        <div className="review-fields">
          <JournalChoice value={to} onChange={(j) => change(() => setTo(j))} project={project} />
          <TypeChoice value={type} onChange={(t) => change(() => setType(t))} />
        </div>
      </form>

      {preview ? (
        <Preview
          preview={preview}
          tags={preview.exists ? preview.tags : tags}
          onRemoveTag={preview.exists ? undefined : (tag) => setTags((t) => t.filter((x) => x !== tag))}
          onOpen={() => preview.id && onOpenNote(to, preview.id)}
        >
          {preview.exists ? null : (
            <TopicChips topics={addTopicSuggestions(preview.topic_tags, tags)} noTagList={false} busy={busy !== ""} onAdd={(tag) => setTags((t) => [...t, tag])} />
          )}
        </Preview>
      ) : null}

      <div className="page-section">
        <div className="field">
          <label className="field-label" htmlFor={`${id}-verdict`}>
            Verdict <span className="field-help">(optional; without one the note goes to the Inbox)</span>
          </label>
          <textarea
            id={`${id}-verdict`}
            name="verdict"
            className="textarea verdict-editor"
            rows={2}
            value={verdict}
            onChange={(e) => setVerdict(e.target.value)}
            disabled={locked}
            placeholder="Your own words: what you decided, and why…"
            autoComplete="off"
          />
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        <div className="form-actions">
          <button type="button" className="button primary" onClick={() => void doSave()} disabled={busy !== "" || locked}>
            {busy === "save" ? "Saving…" : "Save note"}
            <kbd>{MOD}+Enter</kbd>
          </button>
        </div>
      </div>

      {saved ? (
        <div className="page-section" role="status">
          <div className="banner muted">
            <Icon name="check" />
            <span className="text">{`${saved.created ? "Saved to" : "Updated in"} your ${saved.journal} journal: ${saved.id && readablePurl(saved.id)}${saved.status === "inbox" ? ". It is in the Inbox until it has a Verdict." : "."}`}</span>
            {saved.id ? (
              <button type="button" className="button secondary" onClick={() => onOpenNote(saved.journal, saved.id as string)}>
                Open the note
              </button>
            ) : null}
          </div>
          {saved.warnings.map((w) => (
            <Banner tone="warning" key={w}>
              {w}
            </Banner>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Preview({ preview, tags, onRemoveTag, onOpen, children }: { preview: NotePreviewJson; tags: string[]; onRemoveTag?: (tag: string) => void; onOpen: () => void; children?: ReactNode }) {
  const packages = preview.packages.map((p) => packageLabel(p).name);
  const chips = [preview.kind, preview.license === "unknown" ? "licence unknown" : preview.license, preview.language, ...packages].filter((c): c is string => Boolean(c));
  const id = preview.id && readablePurl(preview.id);
  return (
    <section className="page-section preview" aria-label="Preview">
      <div className="note-title-row">
        <h2 className="preview-name">{preview.name ?? id}</h2>
        <span className="badge plain">{preview.exists ? "Already in this journal" : "New note"}</span>
      </div>
      <p className="mono note-purl">{id}</p>
      {preview.exists && preview.verdict ? (
        <Banner
          tone="muted"
          action={
            <button type="button" className="button secondary" onClick={onOpen}>
              Open the note
            </button>
          }
        >
          {`This note already has a Verdict: “${preview.verdict}”. Edit it in the note.`}
        </Banner>
      ) : null}
      {preview.what_it_does ? (
        <div>
          <div className="section-head">
            <h3 className="section-label">What it does</h3>
            <DraftBadge />
          </div>
          <p>{preview.what_it_does}</p>
        </div>
      ) : null}
      {chips.length || tags.length ? (
        <ul className="chips" aria-label="Details">
          {chips.map((c) => (
            <li key={c} className="chip meta">
              {c}
            </li>
          ))}
          {tags.map((t) =>
            onRemoveTag ? (
              <li key={t} className="chip tag removable">
                <span translate="no">{t}</span>
                <button type="button" className="chip-remove" onClick={() => onRemoveTag(t)} aria-label={`Remove tag ${t}`} title="Remove">
                  <Icon name="x" size={12} />
                </button>
              </li>
            ) : (
              <li key={t}>
                <span className="chip tag">{t}</span>
              </li>
            ),
          )}
        </ul>
      ) : null}
      {children}
      {preview.skills.length ? <p className="field-help">{`${preview.skills.length} ${preview.skills.length === 1 ? "skill" : "skills"}: ${preview.skills.join(", ")}`}</p> : null}
      {preview.warnings.map((w) => (
        <Banner tone="warning" key={w}>
          {w}
        </Banner>
      ))}
    </section>
  );
}
