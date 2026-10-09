// "Add GitHub topics as tags" in the All notes header (docs/ui.md §7, decision 0030). The first click
// asks core what it would do (a dry run) and shows it; a second button applies it. Nothing is written
// before that second click.
import { useEffect, useState } from "react";
import { api, type ApiError, type Scope, type TagsFromTopicsJson } from "../api.ts";
import { Icon } from "../icons.tsx";
import { fromTopicsSummary } from "../logic/edits.ts";

export function useFromTopics(journal: Scope, onApplied: (doc: TagsFromTopicsJson) => void, onError: (message: string) => void) {
  const [plan, setPlan] = useState<TagsFromTopicsJson | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPlan(null), [journal]);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const doc = await api.fromTopics(journal, dryRun);
      if (dryRun) setPlan(doc);
      else {
        setPlan(null);
        onApplied(doc);
      }
    } catch (e) {
      onError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return { plan, busy, check: () => void run(true), apply: () => void run(false), cancel: () => setPlan(null) };
}

export function FromTopicsButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button type="button" className="button ghost pane-action" onClick={onClick} disabled={busy}>
      <Icon name="tag" />
      Add GitHub topics as tags
    </button>
  );
}

export function FromTopicsBanner({ plan, busy, onApply, onCancel }: { plan: TagsFromTopicsJson; busy: boolean; onApply: () => void; onCancel: () => void }) {
  return (
    <div className="from-topics" role="region" aria-label="Add GitHub topics as tags">
      <p className="text">{fromTopicsSummary(plan)}</p>
      <div className="form-actions">
        {plan.notes.length ? (
          <button type="button" className="button primary" onClick={onApply} disabled={busy}>
            {busy ? "Adding…" : "Add the tags"}
          </button>
        ) : null}
        <button type="button" className="button secondary" onClick={onCancel} disabled={busy}>
          {plan.notes.length ? "Cancel" : "Close"}
        </button>
      </div>
    </div>
  );
}
