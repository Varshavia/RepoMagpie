// Form fields shared by Add, Import and Check a package.
import { useId } from "react";
import type { PackageType, Scope } from "../api.ts";

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
