// Form fields shared by Add, Import, Check a package and the tag editor.
import { useId } from "react";
import type { PackageType, Scope } from "../api.ts";
import { Icon } from "../icons.tsx";

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
      {project === "none" ? <p className="field-help">No project here: start magpie ui inside a project to use its journal.</p> : null}
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
