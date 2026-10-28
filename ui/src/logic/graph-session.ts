// The graph's positions for the rest of the session (decision 0049): when the page closes with a
// settled layout, where each node was is kept in memory, by journal. Opened again, every node drawn
// before starts there. When each one has its place, the graph is drawn at once and no layout runs;
// when some are new, they join next to a neighbour and a short layout runs with the others pinned,
// so nothing drawn before moves (as with a change while the page is open). Nothing is written
// anywhere; a reload starts again.

type Point = { x: number; y: number };

const session = new Map<string, Map<string, Point>>();

export function keepPositions(journal: string, positions: Map<string, Point>): void {
  session.set(journal, positions);
}

export function forgetPositions(journal?: string): void {
  if (journal === undefined) session.clear();
  else session.delete(journal);
}

// How the graph opens: "layout" from the seeds (nothing kept); "same" (every node has its place: no
// layout); "join" (the nodes in `pinned` have their place; the others join, and a short layout runs).
export type Reopening = { plan: "layout" } | { plan: "same"; positions: Map<string, Point> } | { plan: "join"; positions: Map<string, Point>; pinned: Set<string> };

export function reopening(journal: string, keys: readonly string[]): Reopening {
  const positions = session.get(journal);
  if (!positions) return { plan: "layout" };
  const pinned = new Set(keys.filter((key) => positions.has(key)));
  return pinned.size === keys.length ? { plan: "same", positions } : { plan: "join", positions, pinned };
}
