// The graph page (decision 0028, docs/ui.md §7): one journal's notes, the tags they carry and the
// connections between them, drawn with sigma (WebGL) and laid out by ForceAtlas2 in a worker. Loaded
// on demand, in its own chunk, so the other screens never load sigma or graphology. The canvas is a
// visual aid, hidden from assistive technology; the status line, the search box, the filters, the
// neighbours list and the legend say in words what it shows.
import Graph from "graphology";
import { assignLayoutChanges, graphToByteArrays } from "graphology-layout-forceatlas2/helpers.js";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Sigma from "sigma";
import type { NodeHoverDrawingFunction, NodeLabelDrawingFunction } from "sigma/rendering";
import type { Settings } from "sigma/settings";
import { api, type ApiError, type GraphJson, type Scope } from "../api.ts";
import { Icon } from "../icons.tsx";
import {
  allLabels,
  around,
  DEFAULT_SOURCES,
  drawable,
  edgeStyle,
  filtersActive,
  graphState,
  joinPosition,
  KIND_COLOR,
  KIND_GROUP_LABEL,
  largest,
  LAYOUT,
  layoutSettings,
  mixRgb,
  neighbourGroups,
  neighbours,
  NO_FILTERS,
  nodeDetail,
  nodeLabel,
  nodeSize,
  notice,
  searchNodes,
  seedPosition,
  statusLine,
  type Filters,
  type GraphEdge,
  type GraphNode,
  type KindGroup,
  type Shown,
  type Sources,
} from "../logic/graph.ts";
import type { LayoutReply, LayoutRequest } from "../layout.worker.ts";
import { MOD, type Theme } from "../platform.ts";
import { EmptyState } from "./common.tsx";
import "./GraphPage.css";

type Load = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; doc: GraphJson };
type Colors = Record<(typeof TOKENS)[number], string>;
type Depth = 0 | 1 | 2; // local mode: 0 shows everything
type Point = { x: number; y: number };

const TOKENS = [
  "--graph-skill-pack",
  "--graph-tool",
  "--graph-resource",
  "--graph-other",
  "--graph-tag",
  "--graph-edge-tagged",
  "--graph-edge-link",
  "--graph-edge-alternative",
  "--graph-edge-similar",
  "--canvas",
  "--surface-2",
  "--ink",
] as const;

const KIND_GROUPS = Object.entries(KIND_GROUP_LABEL) as [KindGroup, string][];

const SOURCE_TOGGLES: [keyof Sources, string][] = [
  ["tagged", "Tags"],
  ["link", "Links"],
  ["alternative", "Alternatives"],
  ["similar", "Similar"],
  ["ghosts", "Missing notes"],
];

const INBOX_FADE = 0.55; // toward the canvas
const DIM = 0.7; // what isn't around the hovered or selected node, toward the canvas
const LABEL_THRESHOLD = 12; // a larger graph: labels of nodes at least this size on screen
const LARGEST = 20; // the neighbours list with nothing selected
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// What the reducers read on every frame: kept in a ref, so a hover doesn't re-render React.
interface Focus {
  hovered: string | null;
  selected: string | null;
  near: Set<string> | null; // the lit node and its neighbours
  visible: Set<string> | null; // local mode
  colors: Colors | null;
}

// What is drawn: sigma, its graph, what the graph mirrors, and where nodes that left it were.
interface View {
  sigma: Sigma;
  graph: Graph;
  fitted: boolean;
  shown: Shown;
  left: Map<string, Point>;
}

interface Props {
  journal: Scope;
  theme: Theme;
  focus: string | null; // "Show in graph": the node to select, in local mode
  refresh: number; // grows when the journal's notes change on disk (notes-changed)
  onAdd:(target?: string) => void; // a missing note: Add, with its target filled in
  onSearch: (name: string) => void; // an ambiguous one: Search, with its name
  // The note pane beside the graph; `open` selects another note of the graph (a [[link]] in it).
  renderNote: (note: { id: string; file: string }, open: (id: string) => void) => ReactNode;
}

export default function GraphPage({ journal, theme, focus: focusOn, refresh, onAdd, onSearch, renderNote }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [webgl, setWebgl] = useState(hasWebGL);
  const [settled, setSettled] = useState(false);
  const [scheme, setScheme] = useState(0); // the system's colour scheme changed
  const [selected, setSelected] = useState<string | null>(null);
  const [depth, setDepth] = useState<Depth>(0);
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Sources>(DEFAULT_SOURCES);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const container = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const notePaneRef = useRef<HTMLElement>(null);
  const drawn = useRef<View | null>(null);
  const worker = useRef<Worker | null>(null);
  const focus = useRef<Focus>({ hovered: null, selected: null, near: null, visible: null, colors: null });
  const focusHandled = useRef<string | null>(null);
  const reduced = useMemo(() => matchMedia(REDUCED_MOTION).matches, []);

  // Missing notes are always fetched; their toggle only decides whether they are drawn. A change on
  // disk (`refresh`) fetches again while the graph stays on screen; the new data is synced into it,
  // so what is drawn keeps its place. A failed refetch keeps what is shown; the next change tries again.
  useEffect(() => {
    let current = true;
    setLoad((l) => (l.status === "ready" ? l : { status: "loading" }));
    performance.mark("graph:fetch");
    api.graph(journal, true).then(
      (doc) => {
        if (!current) return;
        performance.mark("graph:data");
        setLoad({ status: "ready", doc });
      },
      (error: ApiError) => current && setLoad((l) => (l.status === "ready" ? l : { status: "error", error: error.message })),
    );
    return () => {
      current = false;
    };
  }, [journal, attempt, refresh]);

  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const changed = () => setScheme((n) => n + 1);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);

  const doc = load.status === "ready" ? load.doc : null;
  const shown = useMemo(() => (doc ? drawable(doc, sources, filters) : null), [doc, sources, filters]);
  const latest = useRef(shown);
  latest.current = shown;
  const state = doc ? graphState(doc, sources) : null;
  const byKey = useMemo(() => new Map((shown?.nodes ?? []).map((n) => [n.key, n])), [shown]);
  const current = selected ? (byKey.get(selected) ?? null) : null;
  const local = useMemo(() => (current && depth && shown ? around(shown, current.key, depth) : null), [current, depth, shown]);
  const counted = local ?? shown;
  const drawing = Boolean(shown) && state !== "empty" && webgl;

  // The reducers' view of the selection, local mode and hover; then a redraw.
  const refocus = useCallback(() => {
    const f = focus.current;
    const lit = f.hovered ?? f.selected;
    f.near = lit && latest.current ? neighbours(latest.current.edges, lit, 1) : null;
    drawn.current?.sigma.refresh();
  }, []);

  useEffect(() => {
    focus.current.selected = current?.key ?? null;
    focus.current.visible = local ? new Set(local.nodes.map((n) => n.key)) : null;
    refocus();
  }, [current, local, shown, refocus]);

  const centre = useCallback(
    (key: string) => {
      const view = drawn.current;
      if (!view || !view.graph.hasNode(key)) return;
      // From the node's graph position, not sigma.getNodeDisplayData: after a change to the graph
      // (a toggle, a filter, a live update) sigma's display data holds raw positions until its next
      // frame, and a camera aimed at them points far off the graph, leaving the canvas blank.
      const { sigma } = view;
      const { x, y } = sigma.viewportToFramedGraph(sigma.graphToViewport(view.graph.getNodeAttributes(key) as Point));
      const camera = sigma.getCamera();
      const target = { x, y, ratio: camera.ratio, angle: 0 }; // pans; the zoom stays yours
      if (reduced) camera.setState(target);
      else void camera.animate(target, { duration: 300 });
    },
    [reduced],
  );

  const select = useCallback((key: string | null) => {
    setSelected(key);
    if (!key) setDepth(0);
  }, []);

  // ForceAtlas2 for a fixed number of iterations, from the positions the nodes have now. Under
  // reduced motion only the settled layout is drawn. While it runs, the view follows the graph's
  // bounds; once it settles, the bounds are kept, and the first time the camera fits them.
  const runLayout = useCallback(() => {
    const view = drawn.current;
    if (!view) return;
    worker.current?.terminate();
    const layout = new Worker(new URL("../layout.worker.ts", import.meta.url), { type: "module" });
    worker.current = layout;
    setSettled(false);
    view.sigma.setCustomBBox(null);
    layout.onmessage = (event: MessageEvent<LayoutReply>) => {
      if (worker.current !== layout) return;
      assignLayoutChanges(view.graph, event.data.nodes, null);
      if (!event.data.done) return;
      layout.terminate();
      worker.current = null;
      // Performance marks for the page's budget (data, layout settled, first frame after it; docs/ui.md §10).
      performance.mark("graph:settled");
      view.sigma.once("afterRender", () => performance.mark("graph:drawn"));
      keepBounds(view.sigma);
      if (!view.fitted) {
        view.sigma.getCamera().setState(FITTED);
        view.fitted = true;
      }
      setSettled(true);
    };
    const { nodes, edges } = graphToByteArrays(view.graph, () => 1);
    const request: LayoutRequest = { nodes, edges, settings: layoutSettings(view.graph.order), iterations: LAYOUT.iterations, every: LAYOUT.progressEvery, progress: !reduced };
    layout.postMessage(request, [nodes.buffer, edges.buffer]);
  }, [reduced]);

  // Sigma, once per journal: from the nodes' seed positions, then the layout. Later changes (a
  // filter, a toggle) are synced into the same graph below; nothing already drawn moves.
  useEffect(() => {
    const first = latest.current;
    if (!drawing || !first || !container.current || !probe.current) return;
    const colors = palette(probe.current);
    focus.current.colors = colors;
    const graph = new Graph({ type: "undirected", multi: true });
    syncGraph(graph, first, seedPosition, colors);
    let sigma: Sigma;
    try {
      sigma = new Sigma(graph, container.current, {
        ...sigmaSettings(colors, getComputedStyle(container.current).fontFamily, reduced, allLabels(graph.order)),
        nodeReducer: (key, data) => {
          const f = focus.current;
          if (f.visible && !f.visible.has(key)) return { ...data, hidden: true };
          if (key === f.hovered || key === f.selected) return { ...data, forceLabel: true, highlighted: key === f.selected, zIndex: 3 };
          if (f.near && !f.near.has(key)) return { ...data, color: mixRgb(data.color, f.colors?.["--canvas"] ?? "", DIM), label: null, forceLabel: false, zIndex: 0 };
          // Local mode shows a small part of the graph: every label in it, as in a small graph.
          if (f.visible && allLabels(f.visible.size)) return { ...data, forceLabel: true };
          return data;
        },
        edgeReducer: (key, data) => {
          const f = focus.current;
          const [source, target] = graph.extremities(key);
          if (f.visible && !(f.visible.has(source) && f.visible.has(target))) return { ...data, hidden: true };
          const lit = f.hovered ?? f.selected;
          if (lit && source !== lit && target !== lit) return { ...data, color: mixRgb(data.color, f.colors?.["--canvas"] ?? "", DIM) };
          return data;
        },
      });
    } catch {
      setWebgl(false);
      return;
    }
    drawn.current = { sigma, graph, fitted: false, shown: first, left: new Map() };
    // For the end-to-end tests: where a node is on screen, so a test can hover and click it as a person would.
    Object.assign(container.current, { nodePosition: (key: string) => sigma.graphToViewport(graph.getNodeAttributes(key) as Point) });
    // Hover: written to the container directly (no React render on every move); tests read data-hovered.
    sigma.on("enterNode", ({ node }) => {
      focus.current.hovered = node;
      Object.assign(sigma.getContainer().dataset, { hovered: node });
      sigma.getContainer().style.cursor = "pointer";
      refocus();
    });
    sigma.on("leaveNode", () => {
      focus.current.hovered = null;
      Object.assign(sigma.getContainer().dataset, { hovered: "" });
      sigma.getContainer().style.cursor = "";
      refocus();
    });
    sigma.on("clickNode", ({ node }) => select(node));
    sigma.on("clickStage", () => select(null));
    const resized = new ResizeObserver(() => {
      sigma.resize();
      sigma.refresh();
    });
    resized.observe(container.current);
    runLayout();
    return () => {
      resized.disconnect();
      worker.current?.terminate();
      worker.current = null;
      sigma.kill();
      drawn.current = null;
    };
  }, [drawing, reduced, runLayout, refocus, select]);

  // A filter, a toggle or a change on disk: the graph drops what is no longer drawn and adds what
  // now is, where it was before, or next to a neighbour. The view keeps its bounds, so the camera
  // doesn't jump. A layout still running starts again from the new graph. No bulk edge update here:
  // after a dropped or added node or edge, sigma rebuilds its edge indices only on its next frame,
  // and until then one throws ("can't be repaint"); new edges get their colour as they are added.
  useEffect(() => {
    const view = drawn.current;
    const colors = focus.current.colors;
    if (!view || !shown || !colors || view.shown === shown) return;
    view.shown = shown;
    const at = (key: string) => (view.graph.hasNode(key) ? (view.graph.getNodeAttributes(key) as Point) : view.left.get(key));
    const spread = 0.03 * extent(view.graph);
    syncGraph(view.graph, shown, (key) => joinPosition(key, shown.edges, at, spread), colors, view.left);
    if (focus.current.hovered && !view.graph.hasNode(focus.current.hovered)) {
      focus.current.hovered = null;
      Object.assign(view.sigma.getContainer().dataset, { hovered: "" });
    }
    view.sigma.setSettings({ labelRenderedSizeThreshold: allLabels(view.graph.order) ? 0 : LABEL_THRESHOLD });
    if (worker.current) runLayout();
  }, [shown, runLayout]);

  // "Show in graph": once the layout has settled, select the note, show its neighbours, centre it.
  useEffect(() => {
    if (!settled || !focusOn || focusHandled.current === focusOn || !byKey.has(focusOn)) return;
    focusHandled.current = focusOn;
    select(focusOn);
    setDepth(1);
    requestAnimationFrame(() => centre(focusOn));
  }, [settled, focusOn, byKey, select, centre]);

  // A theme change recolours what is drawn; nothing moves.
  useEffect(() => {
    const view = drawn.current;
    if (!view || !probe.current) return;
    const colors = palette(probe.current);
    focus.current.colors = colors;
    paint(view.graph, colors);
    view.sigma.setSettings(sigmaSettings(colors, view.sigma.getSettings().labelFont, reduced, allLabels(view.graph.order)));
  }, [theme, scheme, reduced]);

  // Esc clears the selection, then the search; not while a dialog or the note pane has the key.
  const keys = useRef({ selected, query });
  keys.current = { selected, query };
  const escape = useCallback(() => {
    if (keys.current.selected) select(null);
    else if (keys.current.query) setQuery("");
    else return false;
    return true;
  }, [select]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== "Escape" || target?.closest('[role="dialog"]') || (target && notePaneRef.current?.contains(target))) return;
      escape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [escape]);

  // Fit to screen: the graph's bounds as they are now, with the stage padding around them.
  const fit = () => {
    const view = drawn.current;
    if (!view) return;
    keepBounds(view.sigma);
    if (reduced) view.sigma.getCamera().setState(FITTED);
    else void view.sigma.getCamera().animate(FITTED, { duration: 300 });
  };

  // A node from the neighbours list: selected and centred.
  const go = (node: GraphNode) => {
    select(node.key);
    centre(node.key);
  };

  const pick = (node: GraphNode) => {
    go(node);
    setQuery(nodeLabel(node));
  };

  const openNote = (id: string) => {
    const node = shown?.nodes.find((n) => n.type === "note" && n.id === id);
    if (node) pick(node);
  };

  const noteOpen = current?.type === "note" ? current : null;

  return (
    <section className="pane graph-page" aria-labelledby="graph-title">
      <header className="pane-header">
        <h1 className="pane-title" id="graph-title">
          Graph
        </h1>
        <p className="graph-status" role="status">
          {counted ? statusLine(counted.counts) : load.status === "loading" ? "Loading the graph…" : ""}
        </p>
        {drawing ? (
          <div className="graph-actions">
            <button type="button" className="button ghost" onClick={runLayout} disabled={!settled}>
              <Icon name="reload" />
              Re-run layout
            </button>
            <button type="button" className="button ghost" onClick={fit}>
              Fit to screen
            </button>
          </div>
        ) : null}
      </header>
      <span ref={probe} className="graph-probe" aria-hidden="true" />

      {load.status === "error" ? (
        <EmptyState
          action={
            <button type="button" className="button secondary" onClick={() => setAttempt((n) => n + 1)}>
              <Icon name="reload" />
              Retry
            </button>
          }
        >
          {`Couldn't load the graph. ${load.error}`}
        </EmptyState>
      ) : state === "empty" ? (
        <EmptyState
          center
          action={
            <button type="button" className="button secondary" onClick={() => onAdd()}>
              <Icon name="plus" />
              Add a note
            </button>
          }
        >
          {`Nothing to draw yet. Add a repository here, or from the palette (${MOD}+K).`}
        </EmptyState>
      ) : doc && shown ? (
        <>
          <div className="graph-toolbar">
            <GraphSearch nodes={shown.nodes} query={query} onQuery={setQuery} onPick={pick} onEscape={escape} />
            {current ? (
              <div className="graph-selection">
                <span className="graph-selected">
                  Selected: <strong translate="no">{nodeLabel(current)}</strong>
                </span>
                {current.type === "ghost" && current.reason === "ambiguous" ? (
                  <button type="button" className="button secondary" onClick={() => onSearch(current.target)}>
                    <Icon name="search" />
                    Search notes
                  </button>
                ) : current.type === "ghost" ? (
                  <button type="button" className="button secondary" onClick={() => onAdd(current.target)}>
                    <Icon name="plus" />
                    Add a note
                  </button>
                ) : null}
                <div className="segmented" role="radiogroup" aria-label={`Show around ${nodeLabel(current)}`}>
                  {([0, 1, 2] as const).map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={depth === d} onClick={() => setDepth(d)}>
                      {d === 0 ? "Everything" : d === 1 ? "1 step" : "2 steps"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <GraphFilters doc={doc} filters={filters} onFilters={setFilters} sources={sources} onSources={setSources} />
          <div className="graph-body" data-note={noteOpen !== null}>
            <Neighbours shown={shown} current={current} onOpen={go} />
            <div className="graph-stage">
              {/* Under reduced motion the canvas stays invisible (it keeps its size, which sigma needs) until the layout settles. */}
              {drawing ? <div className="graph-canvas" ref={container} aria-hidden="true" data-settled={settled} data-waiting={reduced && !settled} data-selected={current?.key ?? ""} /> : <div className="graph-blank" />}
              {/* Over the top of the canvas, so a notice never resizes it or moves the view. */}
              <div className="graph-notices">
                {!webgl ? <p className="graph-notice">This browser can't draw the graph: WebGL is off or not available. The counts above and the neighbours list still hold.</p> : null}
                {!shown.counts.notes && filtersActive(filters) ? (
                  <p className="graph-notice">
                    No notes match these filters.{" "}
                    <button type="button" className="button ghost" onClick={() => setFilters(NO_FILTERS)}>
                      Clear the filters
                    </button>
                  </p>
                ) : state && notice(state) ? (
                  <p className="graph-notice">{notice(state)}</p>
                ) : null}
              </div>
              {drawing && reduced && !settled ? <p className="graph-arranging">Arranging the graph…</p> : null}
              <Legend shown={shown} />
            </div>
            {noteOpen ? (
              <aside className="graph-note" ref={notePaneRef} aria-label="Note">
                <button type="button" className="button ghost icon-button graph-note-close" onClick={() => select(null)} aria-label="Close the note" title="Close the note (Esc)">
                  <Icon name="x" />
                </button>
                {renderNote({ id: noteOpen.id, file: noteOpen.file }, openNote)}
              </aside>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

// The filters (which notes) and the toggles (which connections, and missing notes).
function GraphFilters({ doc, filters, onFilters, sources, onSources }: { doc: GraphJson; filters: Filters; onFilters: (f: Filters) => void; sources: Sources; onSources: (s: Sources) => void }) {
  const id = useId();
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onFilters({ ...filters, [key]: value });
  const tags = doc.nodes.flatMap((n) => (n.type === "tag" ? [n] : [])).sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  return (
    <div className="filters graph-filters">
      <div className="graph-filter-group" role="group" aria-label="Filters">
        <select className="select" value={filters.kindGroup} onChange={(e) => set("kindGroup", e.target.value as KindGroup | "")} aria-label="Kind group">
          <option value="">Any kind</option>
          {KIND_GROUPS.map(([group, label]) => (
            <option key={group} value={group}>
              {label}
            </option>
          ))}
        </select>
        <div className="segmented" role="radiogroup" aria-label="Status">
          {(["", "reviewed", "inbox"] as const).map((s) => (
            <button key={s || "any"} type="button" role="radio" aria-checked={filters.status === s} onClick={() => set("status", s)}>
              {s === "" ? "Any" : s === "reviewed" ? "Reviewed" : "Inbox"}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={filters.tried} onChange={(e) => set("tried", e.target.checked)} />
          Tried only
        </label>
        <select
          className="select"
          value=""
          onChange={(e) => e.target.value && set("tags", [...filters.tags, e.target.value])}
          aria-label="Add a tag filter (notes with any of the chosen tags)"
          disabled={tags.length === filters.tags.length}
        >
          <option value="">{filters.tags.length ? "Or with tag…" : "With tag…"}</option>
          {tags
            .filter((t) => !filters.tags.includes(t.tag))
            .map((t) => (
              <option key={t.tag} value={t.tag}>
                {`${t.tag} (${t.count})`}
              </option>
            ))}
        </select>
        {filters.tags.length ? (
          <ul className="chips" aria-label="Chosen tags">
            {filters.tags.map((tag) => (
              <li key={tag}>
                <button type="button" className="chip chosen" aria-label={`Remove the #${tag} filter`} onClick={() => set("tags", filters.tags.filter((t) => t !== tag))}>
                  #{tag}
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {filtersActive(filters) ? (
          <button type="button" className="button ghost" onClick={() => onFilters(NO_FILTERS)}>
            Clear the filters
          </button>
        ) : null}
      </div>
      <div className="graph-filter-group" role="group" aria-labelledby={`${id}-draw`}>
        <span className="section-label" id={`${id}-draw`}>
          Draw
        </span>
        {SOURCE_TOGGLES.map(([source, label]) => (
          <label key={source} className="check">
            <input type="checkbox" checked={sources[source]} onChange={(e) => onSources({ ...sources, [source]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

// The accessible path (docs/ui.md §7): the selected node's neighbours by edge type, or the nodes
// with the most connections. A listbox: the arrows move, Enter opens.
function Neighbours({ shown, current, onOpen }: { shown: Shown; current: GraphNode | null; onOpen: (node: GraphNode) => void }) {
  const id = useId();
  const groups: { label: string; nodes: GraphNode[] }[] = current ? neighbourGroups(shown, current.key) : [{ label: "Most connected", nodes: largest(shown, LARGEST) }];
  const options = groups.flatMap((g) => g.nodes);
  const [active, setActive] = useState(0);
  const at = Math.min(active, options.length - 1);
  const title = current ? `Around ${nodeLabel(current)}` : "Most connected";
  useEffect(() => setActive(0), [current]);
  useEffect(() => {
    if (at >= 0) document.getElementById(`${id}-${at}`)?.scrollIntoView({ block: "nearest" });
  }, [id, at]);
  let index = 0;
  return (
    <section className="graph-neighbours" aria-labelledby={`${id}-title`}>
      <h2 className="graph-neighbours-title" id={`${id}-title`} translate="no">
        {title}
      </h2>
      {options.length ? (
        <div
          className="graph-neighbour-list"
          role="listbox"
          tabIndex={0}
          aria-label={current ? `Neighbours of ${nodeLabel(current)}` : "The nodes with the most connections"}
          aria-activedescendant={`${id}-${at}`}
          onKeyDown={(e) => {
            const move = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: options.length - 1 }[e.key];
            if (move !== undefined) setActive(Math.max(0, Math.min(options.length - 1, move)));
            else if (e.key === "Enter") onOpen(options[at]);
            else return;
            e.preventDefault();
            e.stopPropagation(); // not the app's j/k and Enter
          }}
        >
          {groups.map((group, g) => (
            <ul key={group.label} role="group" aria-labelledby={current ? `${id}-group-${g}` : undefined} aria-label={current ? undefined : group.label}>
              {current ? (
                <li role="presentation" className="graph-neighbour-group" id={`${id}-group-${g}`}>
                  {group.label}
                </li>
              ) : null}
              {group.nodes.map((node) => {
                const i = index++;
                return (
                  <li
                    key={`${group.label} ${node.key}`}
                    id={`${id}-${i}`}
                    role="option"
                    aria-selected={i === at}
                    className="link-option"
                    onClick={() => {
                      setActive(i);
                      onOpen(node);
                    }}
                  >
                    <span className="label" translate="no" title={nodeLabel(node)}>
                      {nodeLabel(node)}
                    </span>
                    <span className="detail">{nodeDetail(node)}</span>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
      ) : (
        <p className="graph-neighbour-none">{current ? "No connections drawn." : "Nothing drawn."}</p>
      )}
    </section>
  );
}

// The search box: type a name, pick from up to 8 matches (the [[ autocomplete's pattern); the graph
// selects the node and centres on it.
function GraphSearch({ nodes, query, onQuery, onPick, onEscape }: { nodes: GraphNode[]; query: string; onQuery: (q: string) => void; onPick: (node: GraphNode) => void; onEscape: () => boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = open ? searchNodes(nodes, query) : [];
  const at = Math.min(active, options.length - 1);
  const pick = (node: GraphNode) => {
    setOpen(false);
    onPick(node);
  };
  return (
    <div className="link-input graph-search">
      <input
        className="input"
        name="graph-search"
        type="search"
        role="combobox"
        aria-label="Find a note or tag in the graph"
        aria-expanded={options.length > 0}
        aria-controls={options.length ? `${id}-options` : undefined}
        aria-activedescendant={options.length ? `${id}-option-${at}` : undefined}
        aria-autocomplete="list"
        placeholder="Find a note or #tag…"
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (options.length) setActive((at + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
          } else if (e.key === "Enter" && options.length) {
            e.preventDefault();
            pick(options[at]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            if (options.length) setOpen(false);
            else if (!onEscape()) e.currentTarget.blur();
          }
          // Every key stays here: no single-key shortcuts while you type a name.
          e.stopPropagation();
        }}
        onBlur={() => setOpen(false)}
        autoComplete="off"
        spellCheck={false}
      />
      {options.length ? (
        <ul className="link-options" id={`${id}-options`} role="listbox" aria-label="Matching notes and tags">
          {options.map((node, i) => (
            <li
              key={node.key}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === at}
              className="link-option"
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => i !== at && setActive(i)}
              onClick={() => pick(node)}
            >
              <span className="label" translate="no">
                {nodeLabel(node)}
              </span>
              <span className="detail">{nodeDetail(node)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Every colour the graph uses, also in words (docs/ui.md §9).
function Legend({ shown }: { shown: Shown }) {
  const edgeTypes = new Set(shown.edges.map((e) => e.type));
  return (
    <div className="graph-legend" aria-label="Legend" role="group">
      <ul>
        {KIND_GROUPS.map(([group, label]) => (
          <li key={group}>
            <span className="swatch dot" style={{ background: `var(${KIND_COLOR[group]})` }} aria-hidden="true" />
            {label}
          </li>
        ))}
        <li>
          <span className="swatch dot small" style={{ background: "var(--graph-tag)" }} aria-hidden="true" />
          #tag
        </li>
        <li>
          <span className="swatch dot faded" aria-hidden="true" />
          Faded: in the inbox
        </li>
        {shown.nodes.some((n) => n.type === "ghost") ? (
          <li>
            <span className="swatch dot faded ghost" aria-hidden="true" />
            Faded grey: no note yet
          </li>
        ) : null}
      </ul>
      <ul>
        {(["tagged", "link", "alternative", "similar"] as const)
          .filter((type) => edgeTypes.has(type))
          .map((type) => (
            <li key={type}>
              <span className={`swatch line ${type}`} style={{ background: `var(${edgeStyle(type).color})` }} aria-hidden="true" />
              {{ tagged: "Tagged", link: "Link", alternative: "Alternative", similar: "Similar" }[type]}
            </li>
          ))}
      </ul>
    </div>
  );
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// The tokens as the browser resolves them for the current theme ("rgb(r, g, b)").
function palette(probe: HTMLElement): Colors {
  const colors = {} as Colors;
  for (const token of TOKENS) {
    probe.style.color = `var(${token})`;
    colors[token] = getComputedStyle(probe).color;
  }
  return colors;
}

// Bounds that stay put once the layout has settled, so a later change doesn't rescale the view.
function keepBounds(sigma: Sigma): void {
  sigma.setCustomBBox(null);
  sigma.refresh();
  sigma.setCustomBBox(sigma.getBBox());
}

const FITTED = { x: 0.5, y: 0.5, ratio: 1, angle: 0 };

// The larger side of the graph's bounds, in graph coordinates.
function extent(graph: Graph): number {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  graph.forEachNode((_key, { x, y }) => {
    [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
  });
  return graph.order > 1 ? Math.max(maxX - minX, maxY - minY) : 100;
}

const edgeKey = (edge: GraphEdge) => `${edge.type} ${edge.source} ${edge.target}`;

// Makes `graph` hold what is shown: drops the rest (remembering where nodes were, in `left`), adds
// what is missing at `place`, and sets every node's size, labels and colour for the graph's new
// size. Every node and edge has its colour from the moment sigma sees it: sigma runs the reducers
// at once, and a node dimmed around a selection is mixed from its colour.
// Labels: a small graph forces every one; a larger one leaves them to sigma's label grid, which
// keeps at most one per cell, the largest node first. The hovered and selected nodes are forced by
// the reducer.
function syncGraph(graph: Graph, shown: Shown, place: (key: string) => Point, colors: Colors, left?: Map<string, Point>): void {
  const nodes = new Map(shown.nodes.map((n) => [n.key, n]));
  const edges = new Map(shown.edges.map((e) => [edgeKey(e), e]));
  const every = allLabels(shown.nodes.length);
  for (const key of graph.filterEdges((key) => !edges.has(key))) graph.dropEdge(key);
  for (const key of graph.filterNodes((key) => !nodes.has(key))) {
    left?.set(key, { x: graph.getNodeAttribute(key, "x"), y: graph.getNodeAttribute(key, "y") });
    graph.dropNode(key);
  }
  for (const node of shown.nodes) if (!graph.hasNode(node.key)) graph.addNode(node.key, { ...place(node.key), ...nodeAttributes(node, every, colors) });
  for (const [key, edge] of edges) {
    if (!graph.hasEdge(key)) graph.addEdgeWithKey(key, edge.source, edge.target, { type: "line", edgeType: edge.type, size: edgeStyle(edge.type).size, color: edgeColor(edge.type, colors) });
  }
  graph.updateEachNodeAttributes((key, { x, y }) => ({ x, y, ...nodeAttributes(nodes.get(key) as GraphNode, every, colors) }));
}

function nodeAttributes(node: GraphNode, every: boolean, colors: Colors) {
  const common = { label: nodeLabel(node), forceLabel: every };
  if (node.type === "note") return { ...common, size: nodeSize("note", node.degree), kindGroup: node.kind_group, inbox: node.status === "inbox", zIndex: 1, color: nodeColor({ kindGroup: node.kind_group, inbox: node.status === "inbox" }, colors) };
  if (node.type === "tag") return { ...common, size: nodeSize("tag", node.count, !every), tag: true, zIndex: 2, color: nodeColor({ tag: true }, colors) };
  return { ...common, size: nodeSize("ghost", 0), ghost: true, zIndex: 0, color: nodeColor({ ghost: true }, colors) };
}

// A note's kind colour (faded toward the canvas in the inbox), a tag's, or a missing note's (faded grey).
function nodeColor(attr: { tag?: unknown; ghost?: unknown; inbox?: unknown; kindGroup?: unknown }, colors: Colors): string {
  const base = attr.tag ? colors["--graph-tag"] : attr.ghost ? colors["--graph-other"] : colors[KIND_COLOR[attr.kindGroup as string] as keyof Colors];
  return attr.inbox || attr.ghost ? mixRgb(base, colors["--canvas"], INBOX_FADE) : base;
}

const edgeColor = (type: GraphEdge["type"], colors: Colors) => colors[edgeStyle(type).color as keyof Colors];

// A theme change: every colour again, nothing moved.
function paint(graph: Graph, colors: Colors): void {
  graph.updateEachNodeAttributes((_key, attr) => ({ ...attr, color: nodeColor(attr, colors) }));
  graph.updateEachEdgeAttributes((_key, attr) => ({ ...attr, color: edgeColor(attr.edgeType, colors) }));
}

function sigmaSettings(colors: Colors, font: string, reduced: boolean, everyLabel: boolean): Partial<Settings> {
  return {
    labelFont: font,
    labelSize: 12,
    labelWeight: "500",
    labelColor: { color: colors["--ink"] },
    // A larger graph: one label per grid cell of 160 px, the largest node there, if it is at least
    // LABEL_THRESHOLD on screen; more cells hold a label as you zoom in.
    labelRenderedSizeThreshold: everyLabel ? 0 : LABEL_THRESHOLD,
    labelGridCellSize: 160,
    labelDensity: 1,
    minEdgeThickness: 1,
    zIndex: true,
    stagePadding: 64, // room for the labels of the outermost nodes
    // A very short window can leave the canvas 0 px tall for a moment; sigma would then throw on
    // every render until it grows again. The ResizeObserver tells it the new size.
    allowInvalidContainer: true,
    renderEdgeLabels: false,
    zoomDuration: reduced ? 0 : 250,
    inertiaDuration: reduced ? 0 : 150,
    doubleClickZoomingDuration: reduced ? 0 : 200,
    defaultDrawNodeLabel: drawLabel(colors),
    defaultDrawNodeHover: drawHover(colors),
  };
}

// A label in the theme's ink with a halo in the canvas colour, so it stays readable where it
// crosses nodes and edges.
function drawLabel(colors: Colors): NodeLabelDrawingFunction {
  return (context, data, settings) => {
    if (!data.label) return;
    const size = settings.labelSize;
    context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
    const x = data.x + data.size + 3;
    const y = data.y + size / 3;
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = colors["--canvas"];
    context.strokeText(data.label, x, y);
    context.fillStyle = colors["--ink"];
    context.fillText(data.label, x, y);
  };
}

// The hovered or selected node's label on a surface-2 plate, in the theme's ink, with a ring around
// the node (sigma's default plate is white).
function drawHover(colors: Colors): NodeHoverDrawingFunction {
  return (context, data, settings) => {
    const size = settings.labelSize;
    context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
    const label = data.label ?? "";
    const width = context.measureText(label).width;
    const x = data.x + data.size + 4;
    context.strokeStyle = colors["--ink"];
    context.lineWidth = 2;
    context.beginPath();
    context.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
    context.stroke();
    if (!label) return;
    context.fillStyle = colors["--surface-2"];
    context.beginPath();
    context.roundRect(x, data.y - size / 2 - 4, width + 8, size + 8, 4);
    context.fill();
    context.fillStyle = colors["--ink"];
    context.fillText(label, x + 4, data.y + size / 3);
  };
}
