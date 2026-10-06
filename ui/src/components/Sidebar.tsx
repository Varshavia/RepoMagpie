// The left pane (DESIGN.md, Layout): journal switcher, Inbox with its count, all notes, the other
// screens, then kinds and tags. Below 960 px only the icons show; each item keeps its name for
// screen readers and as a tooltip.
import { memo } from "react";
import type { Scope } from "../api.ts";
import { Icon, type IconName } from "../icons.tsx";
import type { Counts, TagListState } from "../logic/notes.ts";
import type { View } from "../view.ts";

interface Props {
  journal: Scope;
  hasProject: boolean;
  onJournal: (journal: Scope) => void;
  counts: Counts | null;
  tagList: TagListState; // no tags.md, or one without tags: an empty state
  onCreateTagList: () => void;
  onEditTagList: () => void;
  view: View;
  onView: (view: View) => void;
  inert: boolean; // behind an open dialog
}

function Item({ icon, label, count, current, onClick, hint }: { icon: IconName; label: string; count?: number; current: boolean; onClick: () => void; hint?: string }) {
  return (
    <button
      type="button"
      className="nav-item"
      aria-current={current ? "page" : undefined}
      aria-label={count === undefined ? label : `${label}, ${count} ${count === 1 ? "note" : "notes"}`}
      onClick={onClick}
      title={hint ? `${label} (${hint})` : label}
    >
      <Icon name={icon} size={20} />
      <span className="label">{label}</span>
      {count === undefined ? null : <span className="count">{count}</span>}
    </button>
  );
}

export const Sidebar = memo(function Sidebar({ journal, hasProject, onJournal, counts, tagList, onCreateTagList, onEditTagList, view, onView, inert }: Props) {
  const is = (page: View["page"], value?: string) => view.page === page && (value === undefined || ("value" in view && view.value === value));
  return (
    <nav className="sidebar" aria-label="Journals and screens" inert={inert}>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">magpie</span>
      </div>

      <div className="segmented" role="radiogroup" aria-label="Journal">
        <button type="button" role="radio" aria-checked={journal === "personal"} aria-label="Personal" onClick={() => onJournal("personal")} title="Personal journal">
          <Icon name="user" size={14} />
          <span className="label">Personal</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={journal === "project"}
          aria-label="Project"
          disabled={!hasProject}
          onClick={() => onJournal("project")}
          title={hasProject ? "Project journal" : "No project journal: start magpie ui inside a project"}
        >
          <Icon name="users" size={14} />
          <span className="label">Project</span>
        </button>
      </div>

      <div className="nav-group">
        <Item icon="tray" label="Inbox" count={counts?.inbox} current={is("inbox")} onClick={() => onView({ page: "inbox" })} hint="g i" />
        <Item icon="notebook" label="All notes" count={counts?.all} current={is("all")} onClick={() => onView({ page: "all" })} />
        <Item icon="search" label="Search" current={is("search")} onClick={() => onView({ page: "search" })} hint="/" />
        <Item icon="plus" label="Add" current={is("add")} onClick={() => onView({ page: "add" })} />
        <Item icon="import" label="Import" current={is("import")} onClick={() => onView({ page: "import" })} />
        <Item icon="package" label="Check a package" current={is("recall")} onClick={() => onView({ page: "recall" })} />
        <Item icon="folder" label="Suggest" current={is("suggest")} onClick={() => onView({ page: "suggest" })} hint="for this project" />
      </div>

      {counts && counts.kinds.length ? (
        <div className="nav-group taxonomy">
          <h2 className="nav-label">Kinds</h2>
          {counts.kinds.map((k) => (
            <button key={k.name} type="button" className="nav-item" aria-current={is("kind", k.name) ? "page" : undefined} onClick={() => onView({ page: "kind", value: k.name })}>
              <Icon name="cube" />
              <span className="label">{k.name}</span>
              <span className="count">{k.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {(counts && counts.tags.length) || tagList !== "ready" ? (
        <div className="nav-group taxonomy">
          <h2 className="nav-label">Tags</h2>
          {tagList === "missing" ? (
            <div className="nav-empty">
              <p className="label">No tag list yet.</p>
              <Item icon="plus" label="Create tag list" current={false} onClick={onCreateTagList} hint="writes the starter tags.md" />
            </div>
          ) : tagList === "empty" ? (
            <div className="nav-empty">
              <p className="label">Your tag list is empty.</p>
              <Item icon="pencil" label="Edit tag list" current={false} onClick={onEditTagList} hint="opens tags.md in your editor" />
            </div>
          ) : null}
          {(counts?.tags ?? []).map((t) => (
            <button key={t.name} type="button" className="nav-item" aria-current={is("tag", t.name) ? "page" : undefined} onClick={() => onView({ page: "tag", value: t.name })}>
              <Icon name="tag" />
              <span className="label">{t.name}</span>
              <span className="count">{t.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="nav-group sidebar-foot">
        <Item icon="gear" label="Settings" current={is("settings")} onClick={() => onView({ page: "settings" })} />
      </div>
    </nav>
  );
});
