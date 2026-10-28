// Every part the first screen doesn't show, in one chunk with its styles (docs/ui.md §10). One
// chunk, not one each: alone, eight small chunks gzip to 6.3 kB more than inside the first script;
// together, 2.3 kB. App.tsx and NotePane.tsx load it with lazyPart() and prefetch it after first paint.
import "./later.css";

export { AddPage } from "./AddPage.tsx";
export { DeleteDialog } from "./DeleteDialog.tsx";
export { ImportPage } from "./ImportPage.tsx";
export { KeyMapDialog } from "./KeyMapDialog.tsx";
export { Palette } from "./Palette.tsx";
export { RecallPage } from "./RecallPage.tsx";
export { SettingsPage } from "./SettingsPage.tsx";
export { SuggestPane } from "./SuggestPane.tsx";
