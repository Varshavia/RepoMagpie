// The Verdict editor with the human-owned fields next to it (docs/ui.md §7, inbox review): kind,
// tags from the journal's tags.md, tried, rating. Ctrl/Cmd+Enter saves; Esc leaves.
import { useId, type KeyboardEvent, type Ref } from "react";
import { IS_MAC, MOD } from "../platform.ts";
import type { Form } from "../logic/edits.ts";
import { KINDS } from "../logic/schema.ts";
import { Icon } from "../icons.tsx";
import { FieldError } from "./common.tsx";

interface Props {
  form: Form;
  onChange: (form: Form) => void;
  onSave: () => void;
  onLeave: () => void;
  onEditTags: () => void;
  tagList: string[];
  saving: boolean;
  dirty: boolean;
  error: string | null;
  verdictRef: Ref<HTMLTextAreaElement>;
  verdictChanged: boolean;
}

export function ReviewForm({ form, onChange, onSave, onLeave, onEditTags, tagList, saving, dirty, error, verdictRef, verdictChanged }: Props) {
  const id = useId();
  const keys = (e: KeyboardEvent) => {
    if ((IS_MAC ? e.metaKey : e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onLeave();
    }
  };
  // The note's own tags first (some may not be in tags.md), then the rest of the list.
  const tags = [...form.tags, ...tagList.filter((t) => !form.tags.includes(t))];
  const set = <K extends keyof Form>(key: K, value: Form[K]) => onChange({ ...form, [key]: value });

  return (
    <div className="review" onKeyDown={keys}>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-verdict`}>
          Verdict
        </label>
        <textarea
          ref={verdictRef}
          id={`${id}-verdict`}
          name="verdict"
          className="textarea verdict-editor"
          rows={2}
          value={form.verdict}
          onChange={(e) => set("verdict", e.target.value)}
          placeholder="Your own words: what you decided, and why…"
          autoComplete="off"
          aria-describedby={`${id}-verdict-help`}
          aria-invalid={error ? true : undefined}
          spellCheck
        />
        <p className="field-help" id={`${id}-verdict-help`}>
          One line, in your words. For example: avoid: async streams painful; use puppeteer.
        </p>
      </div>

      <div className="review-fields">
        <div className="field">
          <label className="field-label" htmlFor={`${id}-kind`}>
            Kind
          </label>
          <select id={`${id}-kind`} name="kind" className="select" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
            {form.kind ? null : <option value="">Choose a kind</option>}
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <span className="field-label" id={`${id}-rating`}>
            Rating
          </span>
          <div className="segmented rating" role="radiogroup" aria-labelledby={`${id}-rating`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={form.rating === n} aria-label={`${n} of 5`} onClick={() => set("rating", form.rating === n ? null : n)}>
                {n}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={form.rating === null} onClick={() => set("rating", null)}>
              None
            </button>
          </div>
        </div>

        <label className="check wide">
          <input type="checkbox" name="tried" checked={form.tried} onChange={(e) => set("tried", e.target.checked)} />
          Tried it
        </label>

        <div className="field wide">
          <div className="field-label-row">
            <span className="field-label" id={`${id}-tags`}>
              Tags
            </span>
            <button type="button" className="button ghost" onClick={onEditTags} title="Open the journal's tags.md in your editor">
              <Icon name="pencil" />
              Edit tag list
            </button>
          </div>
          {tags.length ? (
            <div className="chips" role="group" aria-labelledby={`${id}-tags`}>
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip tag"
                  aria-pressed={form.tags.includes(t)}
                  onClick={() => set("tags", form.tags.includes(t) ? form.tags.filter((x) => x !== t) : [...form.tags, t])}
                >
                  {form.tags.includes(t) ? <Icon name="check" size={12} /> : null}
                  {t}
                </button>
              ))}
            </div>
          ) : (
            <p className="field-help">No tags yet. Edit the tag list to add one.</p>
          )}
        </div>
      </div>

      {error ? <FieldError>{error}</FieldError> : null}

      <div className="form-actions">
        <button type="button" className="button primary" onClick={onSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : verdictChanged ? "Save Verdict" : "Save"}
          <kbd>{MOD}+Enter</kbd>
        </button>
        <span className="hint">
          <kbd>Esc</kbd> back to the list
        </span>
      </div>
    </div>
  );
}
