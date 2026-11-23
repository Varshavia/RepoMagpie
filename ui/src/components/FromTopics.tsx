// "Add GitHub topics as tags" in the All notes header (docs/ui.md §7, decision 0030). The first click
// asks core what it would do (a dry run) and shows it; a second button applies it. Nothing is written
// before that second click. What it will do shows in FromTopicsBanner.tsx, in the later chunk.
import { useEffect, useState } from "react";
import { api, type ApiError, type Scope, type TagsFromTopicsJson } from "../api.ts";
import { Icon } from "../icons.tsx";

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
