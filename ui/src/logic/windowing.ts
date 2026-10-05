// List windowing (decision 0022): fixed row heights, so the rows in view follow from the scroll
// position alone. Only rows start..end-1 are rendered, placed offsetTop from the list's top.

export interface Range {
  start: number;
  end: number; // exclusive
  offsetTop: number;
  totalHeight: number;
}

export function visibleRange(o: { scrollTop: number; viewportHeight: number; rowHeight: number; count: number; overscan: number }): Range {
  const totalHeight = o.count * o.rowHeight;
  if (!o.count) return { start: 0, end: 0, offsetTop: 0, totalHeight };
  const first = Math.min(o.count - 1, Math.max(0, Math.floor(o.scrollTop / o.rowHeight)));
  const last = Math.ceil((o.scrollTop + o.viewportHeight) / o.rowHeight); // exclusive
  const start = Math.max(0, first - o.overscan);
  const end = Math.min(o.count, last + o.overscan);
  return { start, end, offsetTop: start * o.rowHeight, totalHeight };
}

// The scroll position that brings row `index` fully into view with the least movement, or null when
// it is already in view.
export function scrollToShow(o: { index: number; scrollTop: number; viewportHeight: number; rowHeight: number }): number | null {
  const top = o.index * o.rowHeight;
  const bottom = top + o.rowHeight;
  if (top < o.scrollTop) return top;
  if (bottom > o.scrollTop + o.viewportHeight) return bottom - o.viewportHeight;
  return null;
}
