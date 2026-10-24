// Form fields shared by Add, Import, Check a package and the tag editor.
import { useId } from "react";
import type { PackageType, Scope } from "../api.ts";
import { Icon } from "../icons.tsx";
import { withItem } from "../logic/edits.ts";
import { visible } from "../logic/text.ts";

// "From GitHub topics" (docs/ui.md §7): topics that aren't tags yet. A click adds the tag; a tag the
// journal's tags.md doesn't list is appended to it. Without tags.md: "Create tag list" first.
export function TopicChips({ topics, noTagList, busy, onAdd, onCreateTagList }: { topics: string[]; noTagList: boolean; busy: boolean; onAdd: (tag: string) => void; onCreateTagList?: () => void }) {
  const id = useId();
  if (!topics.length) return null;
  return (
    <div className="topic-chips">
      <span className="field-label" id={id}>
        From GitHub topics
      </span>
      <div className="chips" role="group" aria-labelledby={id}>
        {topics.map((t) => (
          <button key={t} type="button" className="chip tag suggestion" onClick={() => onAdd(t)} disabled={noTagList || busy} aria-label={`Add tag ${t}`}>
            <Icon name="plus" size={12} />
            <span translate="no">{t}</span>
          </button>
        ))}
      </div>
      {noTagList ? (
        <p className="field-help">
          This journal has no tag list yet. Create it first; a topic you pick is then added to it.
          {onCreateTagList ? (
            <>
              {" "}
              <button type="button" className="link-button" onClick={onCreateTagList}>
                Create tag list
              </button>
            </>
          ) : null}
        </p>
      ) : (
        <p className="field-help">A topic you pick becomes a tag, and is added to tags.md if the list doesn't have it.</p>
      )}
    </div>
  );
}

// The project journal: none (no project root to make one in), new (not created yet) or there.
export type ProjectState = "none" | "new" | "exists";

export function JournalChoice({ value, onChange, project }: { value: Scope; onChange: (journal: Scope) => void; project: ProjectState }) {
  const id = useId();
  return (
    <div className="field">
      <span className="field-label" id={id}>
        Journal
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        <button type="button" role="radio" aria-checked={value === "personal"} onClick={() => onChange("personal")}>
          Personal
        </button>
        <button type="button" role="radio" aria-checked={value === "project"} disabled={project === "none"} onClick={() => onChange("project")}>
          Project
        </button>
      </div>
      {project === "none" ? <p className="field-help">No project here: start repomagpie ui inside a project to use its journal.</p> : null}
      {value === "project" && project === "new" ? <p className="field-help">This project has no journal yet; saving creates .magpie/ at its root.</p> : null}
    </div>
  );
}

export function TypeChoice({ value, onChange }: { value: PackageType | ""; onChange: (type: PackageType | "") => void }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        Type of a bare name
      </label>
      <select id={id} name="type" className="select" value={value} onChange={(e) => onChange(e.target.value as PackageType | "")}>
        <option value="">From the project's manifests</option>
        <option value="npm">npm</option>
        <option value="pypi">pypi</option>
        <option value="cargo">cargo</option>
      </select>
    </div>
  );
}

// "Use when" or "Avoid when" at capture (the inbox review and Add, docs/ui.md §7): one line per item,
// in the person's words. Enter or Add puts the typed line in the list; each item can be removed before
// saving, and a line still typed is saved with the rest. Never required.
export function ItemsField(props: {
  label: "Use when" | "Avoid when";
  items: string[];
  text: string;
  onChange: (items: string[], text: string) => void;
  draft?: boolean; // the section holds a draft, which the items replace
  asks?: string | null; // Avoid when: the package's name, for "RepoMagpie will ask before … is installed."
  disabled?: boolean;
}) {
  const id = useId();
  const { label, items, text, onChange, draft, asks, disabled } = props;
  const add = () => onChange(withItem(items, text), "");
  const help = draft
    ? `This section holds a draft. Items you add here replace it.`
    : label === "Use when"
      ? "Optional. When you'd use it, in your words, one line each. Notes are found later by what you need, not only by name."
      : "Optional. When you'd avoid it, in your words, one line each.";
  return (
    <div className="field">
      <label className="field-label" htmlFor={`${id}-input`}>
        {label}
      </label>
      <div className="input-row">
        <input
          id={`${id}-input`}
          name={label === "Use when" ? "use-when" : "avoid-when"}
          className="input"
          value={text}
          maxLength={500}
          disabled={disabled}
          onChange={(e) => onChange(items, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              add();
            }
          }}
          placeholder={label === "Use when" ? "a short invoice from a script" : "big PDFs with many images"}
          autoComplete="off"
          aria-describedby={`${id}-help`}
          spellCheck
        />
        <button type="button" className="button secondary" onClick={add} disabled={disabled || !text.trim()} aria-label={`Add to ${label}`}>
          Add
        </button>
      </div>
      {items.length ? (
        <ul className="items-to-add" aria-label={`${label}: items to add`}>
          {items.map((item) => (
            <li key={item}>
              <span>{visible(item)}</span>
              <button type="button" className="chip-remove" onClick={() => onChange(items.filter((i) => i !== item), text)} aria-label={`Remove ${visible(item)}`} title="Remove" disabled={disabled}>
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="field-help" id={`${id}-help`}>
        {help}
      </p>
      {asks && (items.length || text.trim()) ? <p className="field-help">{`RepoMagpie will ask before ${asks} is installed.`}</p> : null}
    </div>
  );
}
