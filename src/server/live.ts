// Live updates (docs/ui.md §4): watch each journal's notes/ folder and report which notes changed.
// fs.watch is lossy on some platforms and may not name the file, so every event only triggers a
// comparison of the folder's signature (each note's modification time and size); the same
// comparison also runs every 5 seconds, which catches missed events, a recreated folder and
// watchers that never fire. If fs.watch throws or fails, the periodic check works alone.
import { watch as fsWatch } from "node:fs";
import { join } from "node:path";
import { noteSignature, type Signature } from "../core/note-cache.ts";

export interface LiveOptions {
  debounceMs?: number; // default 150
  pollMs?: number; // default 5000
  watch?: typeof fsWatch; // tests replace it
}

export interface Watched {
  scope: "personal" | "project";
  path: string; // the journal
}

// Calls onChange with the journal and the changed note files (added, removed or modified), sorted.
// Returns a function that stops watching.
export function watchJournals(journals: Watched[], onChange: (scope: Watched["scope"], files: string[]) => void, options: LiveOptions = {}): () => void {
  const stops = journals.map((journal) => {
    let last = signature(journal.path) ?? {};
    let timer: NodeJS.Timeout | undefined;
    const check = () => {
      const now = signature(journal.path);
      if (!now) return; // a note vanished while it was read: the next check sees the result
      const files = changedFiles(last, now);
      last = now;
      if (files.length) onChange(journal.scope, files);
    };

    let watcher: ReturnType<typeof fsWatch> | null = null;
    try {
      // notes/ is flat, so no recursive watch is needed.
      watcher = (options.watch ?? fsWatch)(join(journal.path, "notes"), () => {
        clearTimeout(timer);
        timer = setTimeout(check, options.debounceMs ?? 150);
        timer.unref();
      });
      watcher.on("error", () => {
        watcher?.close();
        watcher = null;
      });
    } catch {
      watcher = null; // no notes/ folder yet, or no watching here: the periodic check alone
    }
    const interval = setInterval(check, options.pollMs ?? 5000);
    interval.unref();
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      watcher?.close();
    };
  });
  return () => {
    for (const stop of stops) stop();
  };
}

export function changedFiles(before: Signature, after: Signature): string[] {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...names].filter((name) => JSON.stringify(before[name]) !== JSON.stringify(after[name])).sort();
}

function signature(journal: string): Signature | null {
  try {
    return noteSignature(journal).signature;
  } catch {
    return null;
  }
}
