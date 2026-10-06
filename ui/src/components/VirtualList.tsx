// A virtualised listbox (decision 0022, docs/ui.md §10): fixed 52 px rows (72 px for Suggest's
// three-line rows), only the rows in view (plus a few) are in the DOM. Focus stays on the list; the
// selected row is aria-activedescendant, and is always rendered, because the list scrolls to it.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { scrollToShow, visibleRange } from "../logic/windowing.ts";

const ROW = 52; // --list-row-height in styles.css
export const TALL_ROW = 72; // list-row-tall-height in DESIGN.md
const OVERSCAN = 6;

interface Props<T> {
  id: string;
  label: string;
  items: T[];
  keyOf: (item: T) => string;
  selected: string | null;
  onSelect: (key: string) => void;
  onOpen: (key: string) => void;
  row: (item: T) => ReactNode;
  listRef?: Ref<HTMLDivElement>;
  rowHeight?: number;
}

export function VirtualList<T>({ id, label, items, keyOf, selected, onSelect, onOpen, row, listRef, rowHeight = ROW }: Props<T>) {
  const box = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setHeight(el.clientHeight);
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const index = selected === null ? -1 : items.findIndex((item) => keyOf(item) === selected);

  // Keep the selected row in view when the selection moves (j/k).
  useEffect(() => {
    const el = box.current;
    if (!el || index < 0) return;
    const to = scrollToShow({ index, scrollTop: el.scrollTop, viewportHeight: el.clientHeight, rowHeight });
    if (to !== null) el.scrollTop = to;
  }, [index]);

  const { start, end, totalHeight } = visibleRange({ scrollTop, viewportHeight: height, rowHeight, count: items.length, overscan: OVERSCAN });
  const rows: ReactNode[] = [];
  for (let i = start; i < end; i++) {
    const item = items[i];
    const key = keyOf(item);
    rows.push(
      <div
        key={key}
        id={`${id}-row-${i}`}
        role="option"
        aria-selected={key === selected}
        aria-setsize={items.length}
        aria-posinset={i + 1}
        className="list-row"
        style={rowHeight === ROW ? { top: i * ROW } : { top: i * rowHeight, height: rowHeight }}
        onClick={() => onSelect(key)}
        onDoubleClick={() => onOpen(key)}
      >
        {row(item)}
      </div>,
    );
  }

  return (
    <div
      ref={(el) => {
        box.current = el;
        if (typeof listRef === "function") listRef(el);
        else if (listRef) listRef.current = el;
      }}
      className="listbox"
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={index >= start && index < end ? `${id}-row-${index}` : undefined}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: "relative" }}>{rows}</div>
    </div>
  );
}
