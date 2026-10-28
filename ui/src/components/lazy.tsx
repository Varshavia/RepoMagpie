// Pages and dialogs the first screen doesn't show, each in its own chunk (docs/ui.md §10). One loads
// when it is first opened, or earlier: prefetch() loads them one by one after the first rows are on
// screen. A part already loaded renders at once, with no fallback. A chunk that can't load (offline,
// or a tab older than an upgrade) shows a Reload message in the part's own frame.
import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { EmptyState } from "./common.tsx";
import { Icon } from "../icons.tsx";

export interface LazyPart<P> { Part: ComponentType<P>; load: () => Promise<unknown> }

export function lazyPart<P extends object>(load: () => Promise<ComponentType<P>>): LazyPart<P> {
  let loaded: ComponentType<P> | null = null;
  const loadOnce = () => load().then((component) => (loaded = component));
  const Lazy = lazy(() => loadOnce().then((component) => ({ default: component })));
  function Part(props: P) {
    const Loaded = loaded;
    return Loaded ? <Loaded {...props} /> : <Lazy {...props} />;
  }
  return { Part, load: loadOnce };
}

// Loads the parts in order, each when the browser is idle (Safari has no requestIdleCallback: a
// timeout instead). One that fails is left for its first use, which shows the Reload message.
export function prefetch(parts: { load: () => Promise<unknown> }[]): void {
  const idle = (run: () => void) => ("requestIdleCallback" in window ? window.requestIdleCallback(run, { timeout: 2000 }) : setTimeout(run, 50));
  const next = (k: number) => {
    if (k < parts.length) idle(() => void parts[k].load().catch(() => {}).finally(() => next(k + 1)));
  };
  next(0);
}

interface Frame { pane?: boolean; onClose?: () => void }

class ChunkBoundary extends Component<Frame & { children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const { pane, onClose } = this.props;
    const message = (
      <EmptyState
        action={
          <button type="button" className="button secondary" onClick={() => location.reload()}>
            <Icon name="reload" />
            Reload
          </button>
        }
      >
        Couldn't load this part of RepoMagpie. If it was updated since this tab opened, reloading gets the new version.
      </EmptyState>
    );
    if (onClose) {
      return (
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Couldn't load">
            <div className="dialog-head">
              <span style={{ flex: 1 }} />
              <button type="button" className="button ghost icon-button" onClick={onClose} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>
            {message}
          </div>
        </div>
      );
    }
    return pane ? <section className="pane">{message}</section> : message;
  }
}

// A lazy part's frame: its fallback while it loads, and the Reload message if it can't. `pane`: the
// part is a pane of the workspace, so the message gets one too. `onClose`: the part is a dialog, so
// the message is one, which closes.
export function LazyFrame({ fallback, pane, onClose, children }: Frame & { fallback: ReactNode; children: ReactNode }) {
  return (
    <ChunkBoundary pane={pane} onClose={onClose}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ChunkBoundary>
  );
}
