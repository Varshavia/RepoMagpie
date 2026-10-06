// The right pane: one note (docs/ui.md §7, "Note view"), and the inbox review's Verdict editor.
// The Verdict leads; then Use when and Avoid when, the other sections, skill lines, metadata and
// actions. Every write sends the version the note was read with; a 409 shows the conflict banner.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, type Address, type AdoptJson, type NoteJson, type Scope } from "../api.ts";
import { Icon } from "../icons.tsx";
import { formOf, patchFor, triedLine, type Form, type Patch } from "../logic/edits.ts";
import { packageLabel, readablePurl } from "../logic/schema.ts";
import { editableBody, firstEntries, homePath, isBlank, obsidianUri, parseBody, type Block, type Inline } from "../logic/text.ts";
import { IS_MAC, MOD } from "../platform.ts";
import { Banner, DraftBadge, EmptyState, FieldError, SkeletonNote, StatusBadge } from "./common.tsx";
import type { ProjectState } from "./fields.tsx";
import { ReviewForm } from "./ReviewForm.tsx";

export interface NotePaneProps {
  journal: Scope;
  address: Address;
  noteKey: string;
  home: string | null; // paths under it are shown with ~
  review: boolean; // inbox review: an inbox note opens with the Verdict editor
  focusRequest: number; // > 0: take focus once the note has loaded
  editRequest: number; // grows with each press of e
  live: { tick: number; files: string[] }; // live updates for this journal
  tagList: string[];
  noTagList: boolean; // the journal has no tags.md
  onCreateTagList: () => void;
  drafts: Map<string, Form>; // unsaved forms, kept while you move between notes
  onSaved: (note: NoteJson, message: string) => void;
  onLeave: () => void; // Esc from an editor: back to the list
  onToast: (text: string) => void;
  onBack: () => void; // the back button in the one-pane layout
  project: ProjectState; // "none": no project to adopt into
  onAdopted: () => void;
  onOpenNote: (journal: Scope, id: string) => void;
}

type Adopting = null | { step: "confirm"; busy: boolean; error: string | null } | { step: "done"; doc: AdoptJson };

// Sections shown even when empty, so the person can fill them.
const ALWAYS = ["Use when", "Avoid when"];
// Shown above the Verdict editor while reviewing.
const CONTEXT = ["What it does", "Use when"];
// Sections the person can edit here (spec, "Editing a note"); the Verdict has its own editor, and
// skill lines are written by magpie note.
const EDITABLE = ["Use when", "Avoid when", "What it does", "How to use", "My notes", "Related"];

export function NotePane(props: NotePaneProps) {
  const { journal, address, noteKey, home, review, focusRequest, editRequest, live, tagList, noTagList, onCreateTagList, drafts, onSaved, onLeave, onToast, onBack, project, onAdopted, onOpenNote } = props;
  const [note, setNote] = useState<NoteJson | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<NoteJson | null>(null);
  const [removed, setRemoved] = useState(false);
  const [section, setSection] = useState<{ name: string; text: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<Adopting>(null);
  const verdictRef = useRef<HTMLTextAreaElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const focusHandled = useRef(0);
  const editHandled = useRef(editRequest);
  const latest = useRef({ note, form, section });
  latest.current = { note, form, section };

  const addressKey = "id" in address ? `id ${address.id}` : `file ${address.file}`;

  // Load the note; restore an unsaved form for it.
  useEffect(() => {
    let current = true;
    api.note(journal, address).then(
      (doc) => {
        if (!current) return;
        const draft = drafts.get(noteKey);
        setNote(doc);
        setForm(draft ?? formOf(doc));
        setEditing(Boolean(draft) || (review && doc.status === "inbox" && !doc.read_only));
      },
      (error: ApiError) => current && setLoadError(error.message),
    );
    return () => {
      current = false;
    };
  }, [journal, addressKey]); // the address, as a string

  // Keep an unsaved form when the pane closes (moving to another note).
  useEffect(() => () => {
    const { note: n, form: f } = latest.current;
    if (n && f && patchFor(n, f)) drafts.set(noteKey, f);
    else drafts.delete(noteKey);
  }, [drafts, noteKey]);

  // Live updates: a change on disk reloads the note, unless you are editing it; then the conflict
  // banner says so before you save.
  useEffect(() => {
    const n = latest.current.note;
    if (!live.tick || !n?.file || (live.files.length && !live.files.includes(n.file))) return;
    let current = true;
    api.note(journal, address).then(
      (doc) => {
        if (!current || doc.version === n.version) return;
        const { form: f, section: s } = latest.current;
        if ((f && patchFor(n, f)) || s) setConflict(doc);
        else {
          setNote(doc);
          setForm(formOf(doc));
        }
      },
      (error: ApiError) => current && error.status === 404 && setRemoved(true),
    );
    return () => {
      current = false;
    };
  }, [live.tick]);

  // Focus on request: the Verdict editor while editing, otherwise the note itself.
  useEffect(() => {
    if (!note || focusRequest <= focusHandled.current) return;
    focusHandled.current = focusRequest;
    if (editing) verdictRef.current?.focus();
    else articleRef.current?.focus();
  }, [note, focusRequest, editing]);

  // Unsaved changes: the browser asks before the page closes or reloads.
  useEffect(() => {
    if (!note || !form || (!patchFor(note, form) && !section)) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [note, form, section]);

  // The e key: open the Verdict editor.
  useEffect(() => {
    if (!note || note.read_only || editRequest <= editHandled.current) return;
    editHandled.current = editRequest;
    setEditing(true);
    requestAnimationFrame(() => verdictRef.current?.focus());
  }, [note, editRequest]);

  if (loadError) {
    return (
      <Shell onBack={onBack}>
        <EmptyState center>{`Couldn't open this note. ${loadError} Choose another note, or check the terminal running magpie ui.`}</EmptyState>
      </Shell>
    );
  }
  if (!note || !form) {
    return (
      <Shell onBack={onBack}>
        <SkeletonNote />
      </Shell>
    );
  }

  const fm = note.frontmatter;
  const text = (key: string) => (typeof fm[key] === "string" ? (fm[key] as string) : null);
  const list = (key: string) => (Array.isArray(fm[key]) ? (fm[key] as unknown[]).filter((v): v is string => typeof v === "string") : []);
  const name = text("name") ?? note.file ?? "Note";
  const url = text("url");
  const tried = triedLine(formOf(note));
  const patch = patchFor(note, form);

  async function submit(body: Patch, message: string): Promise<boolean> {
    setSaving(true);
    setSaveError(null);
    try {
      const doc = await api.patch(body);
      setNote(doc);
      setForm(formOf(doc));
      setConflict(null);
      drafts.delete(noteKey);
      onSaved(doc, message);
      return true;
    } catch (error) {
      const e = error as ApiError;
      if (e.status === 409 && e.document) setConflict(e.document as NoteJson);
      else setSaveError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveForm() {
    if (!note || !form) return;
    const body = patchFor(note, form);
    if (!body) return;
    const message = body.verdict === undefined ? "Note saved" : body.verdict ? "Verdict saved" : "Verdict cleared";
    if (await submit(body, message)) setEditing(review && !body.verdict && note.status === "inbox");
  }

  async function saveSection() {
    if (!note?.id || !note.version || !section) return;
    const original = note.sections.find((s) => (s.name ?? s.heading) === section.name);
    if (original && section.text.trimEnd() === editableBody(original.body)) return setSection(null);
    if (await submit({ journal, id: note.id, version: note.version, sections: { [section.name]: section.text.trimEnd() } }, `${section.name} saved`)) setSection(null);
  }

  async function accept(sectionName: string) {
    if (!note?.id || !note.version) return;
    await submit({ journal, id: note.id, version: note.version, accept_drafts: [sectionName] }, `${sectionName} accepted`);
  }

  function reload() {
    if (!conflict) return;
    // The note as it is on disk now; your unsaved changes stay in the form, ready to save again.
    setNote(conflict);
    setConflict(null);
    setSaveError(null);
  }

  async function openInEditor() {
    setActionError(null);
    try {
      await api.open(journal, address);
      onToast("Opened in your editor");
    } catch (error) {
      setActionError((error as ApiError).message);
    }
  }

  async function copyPurl() {
    if (!note?.id) return;
    try {
      await navigator.clipboard.writeText(note.id);
      onToast("PURL copied");
    } catch {
      setActionError("Couldn't copy the PURL. Select it and copy it yourself.");
    }
  }

  // magpie adopt: copies the note into the project journal and names the install command; it never
  // installs anything. Only after the confirm, which says who can read the project journal.
  async function adopt() {
    if (!note?.id) return;
    setAdopting({ step: "confirm", busy: true, error: null });
    try {
      const doc = await api.adopt(note.id);
      setAdopting({ step: "done", doc });
      onAdopted();
    } catch (error) {
      setAdopting({ step: "confirm", busy: false, error: (error as ApiError).message });
    }
  }

  async function copyInstall(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      onToast("Install command copied");
    } catch {
      setActionError("Couldn't copy the command. Select it and copy it yourself.");
    }
  }

  async function editTagList() {
    setActionError(null);
    try {
      await api.openTagList(journal);
      onToast("Opened tags.md in your editor");
    } catch (error) {
      setActionError((error as ApiError).message);
    }
  }

  const sections = note.sections.filter((s) => s.name !== "Verdict" && s.name !== "Notable skills");
  // While you write the Verdict, What it does and Use when sit above the editor, short, so a note
  // can be reviewed without scrolling (docs/ui.md §7: under 15 seconds a note).
  const reviewing = editing && !note.read_only;
  const context = reviewing ? CONTEXT.flatMap((n) => sections.filter((s) => s.name === n && !isBlank(s.body))) : [];
  const present = new Set(sections.map((s) => s.name));
  const missing = ALWAYS.filter((n) => !present.has(n)).map((n) => ({ name: n, heading: n, body: "", draft: false }));
  const shown = [...missing, ...sections]
    .filter((s) => (ALWAYS.includes(s.name ?? "") || !isBlank(s.body)) && !context.includes(s))
    .sort((a, b) => rank(a.name) - rank(b.name));

  return (
    <Shell onBack={onBack}>
      <article className="note" ref={articleRef} tabIndex={-1} aria-labelledby="note-title">
        <header className="note-head">
          <div className="note-title-row">
            <h2 className="note-title" id="note-title" translate="no">
              {name}
            </h2>
            <StatusBadge status={note.status} readOnly={note.read_only} />
          </div>
          {tried ? <p className="note-tried">{tried}</p> : null}
          {note.id ? (
            <p className="note-purl">
              <span className="mono" translate="no">
                {readablePurl(note.id)}
              </span>
              <button type="button" className="button ghost icon-button" onClick={copyPurl} aria-label="Copy PURL" title="Copy PURL">
                <Icon name="copy" />
              </button>
            </p>
          ) : null}
          <Chips kind={text("kind")} license={text("license")} language={text("language")} packages={list("packages")} tags={list("tags")} />
          <div className="actions">
            {url && /^https:\/\//.test(url) ? (
              <a className="button secondary" href={url} target="_blank" rel="noreferrer">
                <Icon name="external" />
                Open repository
              </a>
            ) : null}
            <button type="button" className="button secondary" onClick={openInEditor}>
              <Icon name="pencil" />
              Open in editor
            </button>
            {note.path ? (
              <a className="button secondary" href={obsidianUri(note.path)}>
                <Icon name="external" />
                Open in Obsidian
              </a>
            ) : null}
            {journal === "personal" && project !== "none" && note.id && !note.read_only ? (
              <button type="button" className="button secondary" onClick={() => setAdopting({ step: "confirm", busy: false, error: null })} aria-expanded={adopting !== null}>
                <Icon name="users" />
                Adopt to project
              </button>
            ) : null}
          </div>
        </header>

        <div className="stack">
          {adopting?.step === "confirm" ? (
            <div className="adopt-panel" role="group" aria-label="Adopt to project">
              <p>
                Copy this note into the project journal, with today's date as <code translate="no">adopted</code>. magpie names the install command; it installs nothing.
              </p>
              <p>The project journal is committed with the code; anyone who can read this repository can read this note.</p>
              {adopting.error ? <FieldError>{adopting.error}</FieldError> : null}
              <div className="form-actions">
                <button type="button" className="button secondary" onClick={adopt} disabled={adopting.busy}>
                  {adopting.busy ? "Copying…" : "Copy to the project journal"}
                </button>
                <button type="button" className="button ghost" onClick={() => setAdopting(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : adopting?.step === "done" ? (
            <div className="adopt-panel" role="group" aria-label="Adopted">
              <p>Copied to the project journal.</p>
              {adopting.doc.install || adopting.doc.install_choices.length ? (
                <>
                  {adopting.doc.install_choices.length ? <p>{`This repository publishes ${adopting.doc.install_choices.length} packages; install the one you need:`}</p> : null}
                  {(adopting.doc.install ? [adopting.doc.install] : adopting.doc.install_choices).map((command) => (
                    <p className="install-line" key={command}>
                      <code translate="no">{command}</code>
                      <button type="button" className="button ghost icon-button" onClick={() => copyInstall(command)} aria-label={`Copy ${command}`} title="Copy the install command">
                        <Icon name="copy" />
                      </button>
                    </p>
                  ))}
                  <p className="field-help">Run it yourself when you are ready; magpie never installs anything.</p>
                </>
              ) : (
                <p className="field-help">No install command for a GitHub repository.</p>
              )}
              <div className="form-actions">
                <button type="button" className="button secondary" onClick={() => adopting.doc.id && onOpenNote("project", adopting.doc.id)}>
                  Open the project's note
                </button>
                <button type="button" className="button ghost" onClick={() => setAdopting(null)}>
                  Close
                </button>
              </div>
            </div>
          ) : null}
          {actionError ? <Banner tone="danger">{actionError}</Banner> : null}
          {removed ? <Banner tone="warning">Another program deleted this note's file. Choose another note.</Banner> : null}
          {conflict ? (
            <Banner
              tone="warning"
              action={
                <button type="button" className="button secondary" onClick={reload}>
                  <Icon name="reload" />
                  Reload
                </button>
              }
            >
              This note changed on disk since you opened it. Reload to see the new version; your unsaved changes stay.
            </Banner>
          ) : null}
          {note.read_only ? (
            <Banner
              tone="muted"
              action={
                <button type="button" className="button secondary" onClick={openInEditor}>
                  Open in editor
                </button>
              }
            >
              {note.warnings.join(" ") || "This note can't be read, so it is read-only here."}
            </Banner>
          ) : null}
        </div>

        <section className="verdict-block" aria-label="Verdict">
          {editing && !note.read_only ? (
            <>
            {context.length ? (
              <div className="review-context">
                {context.map((s) => (
                  <div key={s.name}>
                    <div className="section-head">
                      <h3 className="section-label">{s.name}</h3>
                      {s.draft ? <DraftBadge /> : null}
                    </div>
                    <ShortBody body={s.body} />
                  </div>
                ))}
              </div>
            ) : null}
            <ReviewForm
              form={form}
              onChange={setForm}
              onSave={saveForm}
              onLeave={() => {
                if (review) onLeave();
                else {
                  setEditing(false);
                  setForm(formOf(note));
                  setSaveError(null);
                  articleRef.current?.focus();
                }
              }}
              tagList={tagList}
              saving={saving}
              dirty={patch !== null}
              error={saveError}
              verdictRef={verdictRef}
              verdictChanged={patch?.verdict !== undefined}
              onEditTags={editTagList}
              noTagList={noTagList}
              onCreateTagList={onCreateTagList}
            />
            </>
          ) : (
            <>
              <div className="section-head">
                <h3 className="section-label">Verdict</h3>
                {note.read_only ? null : (
                  <div className="actions">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => {
                        setEditing(true);
                        requestAnimationFrame(() => verdictRef.current?.focus());
                      }}
                      title="Edit the Verdict (e)"
                    >
                      <Icon name="pencil" />
                      {note.verdict ? "Edit" : "Write the Verdict"}
                      <kbd>e</kbd>
                    </button>
                  </div>
                )}
              </div>
              {note.verdict ? <p className="verdict-hero">{note.verdict}</p> : <p className="verdict-hero empty">No verdict yet.</p>}
            </>
          )}
        </section>

        {shown.map((s) => {
          const label = s.name ?? s.heading;
          const canEdit = !note.read_only && s.name !== null && EDITABLE.includes(s.name);
          const isEditing = section?.name === label;
          return (
            <section className="section" key={label} aria-labelledby={`section-${slug(label)}`}>
              <div className="section-head">
                <h3 className={label === "Avoid when" && !isBlank(s.body) ? "section-label avoid" : "section-label"} id={`section-${slug(label)}`}>
                  {label}
                </h3>
                {s.draft ? <DraftBadge /> : null}
                {canEdit && !isEditing ? (
                  <div className="actions">
                    {s.draft ? (
                      <button type="button" className="button ghost" onClick={() => accept(label)} disabled={saving} title="Keep this text as yours; the draft label goes">
                        <Icon name="check" />
                        Accept
                      </button>
                    ) : null}
                    <button type="button" className="button ghost" onClick={() => setSection({ name: label, text: editableBody(s.body) })} aria-label={`Edit ${label}`}>
                      <Icon name="pencil" />
                      Edit
                    </button>
                  </div>
                ) : null}
              </div>
              {isEditing ? (
                <SectionEditor
                  label={label}
                  text={section.text}
                  onChange={(t) => setSection({ name: label, text: t })}
                  onSave={saveSection}
                  onCancel={() => setSection(null)}
                  saving={saving}
                  error={saveError}
                  draft={s.draft}
                />
              ) : isBlank(s.body) ? (
                <p className="prose muted">Nothing yet.</p>
              ) : (
                <Body blocks={parseBody(s.body)} />
              )}
            </section>
          );
        })}

        {note.skills.length ? (
          <section className="section" aria-labelledby="section-skills">
            <div className="section-head">
              <h3 className="section-label" id="section-skills">
                Notable skills
              </h3>
            </div>
            <Skills skills={note.skills} />
          </section>
        ) : null}

        <footer className="note-foot">
          {note.path ? (
            <span className="mono" translate="no">
              {homePath(note.path, home)}
            </span>
          ) : null}
          {text("explored") ? <span>Explored {text("explored")}</span> : null}
        </footer>
      </article>
    </Shell>
  );
}

function Shell({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return (
    <div className="note-scroll">
      <div className="pane-header back-button">
        <button type="button" className="button ghost" onClick={onBack}>
          <Icon name="back" />
          Back to the list
        </button>
      </div>
      {children}
    </div>
  );
}

function Chips({ kind, license, language, packages, tags }: { kind: string | null; license: string | null; language: string | null; packages: string[]; tags: string[] }) {
  if (!kind && !license && !language && !packages.length && !tags.length) return null;
  return (
    <ul className="chips" aria-label="Details">
      {kind ? <li className="chip">{kind}</li> : null}
      {license ? (
        <li className="chip meta" title="Licence">
          {license === "unknown" ? "licence unknown" : license}
        </li>
      ) : null}
      {language ? <li className="chip meta" title="Language">{language}</li> : null}
      {packages.map((p) => {
        const { type, name } = packageLabel(p);
        return (
          <li className="chip meta" key={p} title={type ? `${type} package` : "Package"} translate="no">
            {name}
          </li>
        );
      })}
      {tags.map((t) => (
        <li key={t}>
          <span className="chip tag">{t}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionEditor(props: { label: string; text: string; onChange: (text: string) => void; onSave: () => void; onCancel: () => void; saving: boolean; error: string | null; draft: boolean }) {
  return (
    <div
      className="review"
      onKeyDown={(e) => {
        if ((IS_MAC ? e.metaKey : e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          props.onSave();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          props.onCancel();
        }
      }}
    >
      <textarea
        className="textarea"
        rows={Math.min(12, Math.max(3, props.text.split("\n").length + 1))}
        value={props.text}
        onChange={(e) => props.onChange(e.target.value)}
        aria-label={props.label}
        autoFocus
      />
      {props.draft ? <p className="field-help">Saving your edit makes this text yours; the draft label goes.</p> : null}
      {props.error ? <FieldError>{props.error}</FieldError> : null}
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={props.onSave} disabled={props.saving}>
          {props.saving ? "Saving…" : "Save"}
          <kbd>{MOD}+Enter</kbd>
        </button>
        <button type="button" className="button ghost" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// Skill lines (decision 0006): the described ones; the rest, or all when none is described, behind
// one row that expands to their names.
function Skills({ skills }: { skills: { name: string; text: string }[] }) {
  const [open, setOpen] = useState(false);
  const described = skills.filter((s) => s.text);
  const rest = skills.filter((s) => !s.text);
  const label = described.length
    ? `${rest.length} more without a line`
    : `${skills.length} ${skills.length === 1 ? "skill" : "skills"}, none described yet`;
  return (
    <div className="stack">
      {described.length ? (
        <ul className="skills">
          {described.map((s) => (
            <li key={s.name}>
              <span className="mono" translate="no">
                {s.name}
              </span>
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {rest.length ? (
        <div>
          <button type="button" className="button ghost disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon name="caret" size={12} />
            {label}
          </button>
          {open ? (
            <ul className="chips skill-names">
              {rest.map((s) => (
                <li key={s.name} className="chip meta">
                  {s.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// A section body cut short for review: the first three bullets or lines, each at most three lines
// long, with "Show all" when anything is cut.
const SHORT = 3;

function ShortBody({ body }: { body: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cutLines, setCutLines] = useState(false);
  const blocks = parseBody(body);
  const short = firstEntries(blocks, SHORT);
  useLayoutEffect(() => {
    if (open || !box.current) return;
    setCutLines([...box.current.querySelectorAll(".clamp-3")].some((el) => el.scrollHeight > el.clientHeight + 1));
  }, [body, open]);
  return (
    <>
      <div ref={box}>
        <Body blocks={open ? blocks : short.blocks} clamp={!open} />
      </div>
      {open || short.more || cutLines ? (
        <button type="button" className="button ghost disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="caret" size={12} />
          {open ? "Show less" : short.more ? `Show all (${short.more} more)` : "Show all"}
        </button>
      ) : null}
    </>
  );
}

function Body({ blocks, clamp = false }: { blocks: Block[]; clamp?: boolean }) {
  return (
    <div className="prose">
      {blocks.map((block, i) =>
        block.kind === "list" ? (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{clamp ? <span className="clamp-3"><Inlines parts={item} /></span> : <Inlines parts={item} />}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {block.lines.map((line, j) =>
              clamp ? (
                <span className="clamp-3" key={j}>
                  <Inlines parts={line} />
                </span>
              ) : (
                <Fragment key={j}>
                  {j ? <br /> : null}
                  <Inlines parts={line} />
                </Fragment>
              ),
            )}
          </p>
        ),
      )}
    </div>
  );
}

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "code" ? (
          <code key={i}>{p.text}</code>
        ) : p.kind === "link" ? (
          <a key={i} href={p.href} target="_blank" rel="noreferrer">
            {p.text}
          </a>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

const ORDER = ["Use when", "Avoid when", "What it does", "How to use", "My notes", "Related"];
const rank = (name: string | null) => {
  const at = ORDER.indexOf(name ?? "");
  return at === -1 ? ORDER.length : at;
};
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
