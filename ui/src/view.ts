// The screen in the centre and right panes (docs/ui.md §7).
import type { ListView } from "./logic/notes.ts";

export type View =
  | { page: "inbox" }
  | { page: "all" }
  | { page: "kind"; value: string }
  | { page: "tag"; value: string }
  | { page: "search" }
  | { page: "add" }
  | { page: "import" }
  | { page: "recall" }
  | { page: "settings" };

// The journal list a view shows, or null for the other screens.
export function listOf(view: View): ListView | null {
  switch (view.page) {
    case "inbox":
    case "all":
      return { list: view.page };
    case "kind":
    case "tag":
      return { list: view.page, value: view.value };
    default:
      return null;
  }
}

export function viewTitle(view: View): string {
  switch (view.page) {
    case "inbox":
      return "Inbox";
    case "all":
      return "All notes";
    case "kind":
      return `Kind: ${view.value}`;
    case "tag":
      return `Tag: ${view.value}`;
    case "search":
      return "Search";
    case "add":
      return "Add a note";
    case "import":
      return "Import";
    case "recall":
      return "Check a package";
    case "settings":
      return "Settings";
  }
}
