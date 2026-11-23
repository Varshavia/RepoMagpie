// What "Add GitHub topics as tags" will do (docs/ui.md §7, decision 0030), under the All notes header
// after the first click, with the button that applies it. In the later chunk: it shows only after a
// click (FromTopics.tsx holds the button and the hook).
import type { TagsFromTopicsJson } from "../api.ts";
import { fromTopicsSummary } from "../logic/edits.ts";

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
