// The Inbox's Inbox and Starred tabs (decision 0068, docs/ui.md §7). Nothing until a journal has
// starred notes without a Verdict; the tabs stay while the Starred tab is open, so its last note's
// Verdict leaves a way back. In the later chunk, with the decision when to show them: a journal
// without stars never needs them, and the first files stay under decision 0048's line.
import type { Counts } from "../logic/notes.ts";
import type { View } from "../view.ts";

export function InboxTabs({ view, counts, onView }: { view: View; counts: Counts | null; onView: (view: View) => void }) {
  const tab = view.page === "inbox" && view.tab ? "starred" : "inbox";
  if (!counts || (!counts.starred && tab === "inbox")) return null;
  return (
    <div className="segmented inbox-tabs" role="radiogroup" aria-label="Inbox">
      {([["inbox", "Inbox", counts.inbox], ["starred", "Starred", counts.starred]] as const).map(([value, label, count]) => (
        <button key={value} type="button" role="radio" aria-checked={tab === value} onClick={() => onView(value === "starred" ? { page: "inbox", tab: value } : { page: "inbox" })}>
          {label} <span className="tabular">{count}</span>
        </button>
      ))}
    </div>
  );
}
