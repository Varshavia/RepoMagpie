// The local app (docs/ui.md §7): three panes, the command palette, the keyboard map, live updates
// and toasts. All data comes from magpie ui's API; the browser keeps only the theme.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ApiError, type NoteJson, type Scope, type SearchResult, type SettingsJson, type TagListJson } from "./api.ts";
import { AddPage } from "./components/AddPage.tsx";
import { EmptyState, SkeletonRows, Toasts, type ToastItem } from "./components/common.tsx";
import type { ProjectState } from "./components/fields.tsx";
import { ImportPage } from "./components/ImportPage.tsx";
import { KeyMapDialog } from "./components/KeyMapDialog.tsx";
import { NotePane, type NotePaneProps } from "./components/NotePane.tsx";
import { Palette, type Command } from "./components/Palette.tsx";
import { RecallPage } from "./components/RecallPage.tsx";
import { NoteRow } from "./components/rows.tsx";
import { NO_SEARCH, resultKey, SearchPane, type SearchState } from "./components/SearchPane.tsx";
import { SettingsPage } from "./components/SettingsPage.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { SuggestPane } from "./components/SuggestPane.tsx";
import { VirtualList } from "./components/VirtualList.tsx";
import { Icon } from "./icons.tsx";
import type { Form } from "./logic/edits.ts";
import { keyAction, type Action, type Pending } from "./logic/keys.ts";
import { filterNotes, nextAfter, noteKey, sidebarCounts, tagListState, type TagListState } from "./logic/notes.ts";
import { suggestKey, type SuggestItem } from "./logic/suggest.ts";
import { noteHash, parseNoteHash } from "./logic/links.ts";
import { homePath } from "./logic/text.ts";
import { applyTheme, IS_MAC, MOD, savedTheme, type Theme } from "./platform.ts";
import { listOf, viewTitle, type View } from "./view.ts";
import type { NoteSummary } from "../../src/core/documents.ts";

type ListState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; notes: NoteSummary[] };
type Live = { tick: number; files: string[] };

const SCOPES: Scope[] = ["personal", "project"];

// The graph page is its own chunk, with sigma and graphology; the other screens never load it.
const GraphPage = lazy(() => import("./components/GraphPage.tsx"));

export function App() {
  const [settings, setSettings] = useState<SettingsJson | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [journal, setJournal] = useState<Scope>("personal");
  const [lists, setLists] = useState<Record<Scope, ListState>>({ personal: { status: "loading" }, project: { status: "loading" } });
  const [tagLists, setTagLists] = useState<Record<Scope, string[]>>({ personal: [], project: [] });
  // No tags.md, or one without tags: the Tags section shows an empty state (docs/ui.md §7).
  const [tagState, setTagState] = useState<Record<Scope, TagListState>>({ personal: "ready", project: "ready" });
  const [view, setView] = useState<View>({ page: "inbox" });
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ key: string | null; n: number }>({ key: null, n: 0 });
  const [editRequest, setEditRequest] = useState(0);
  const [live, setLive] = useState<Record<Scope, Live>>({ personal: { tick: 0, files: [] }, project: { tick: 0, files: [] } });
  const [connection, setConnection] = useState<"ok" | "lost">("ok");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [help, setHelp] = useState(false);
  const [palette, setPalette] = useState(false);
  const [pane, setPane] = useState<"list" | "note">("list");
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [search, setSearch] = useState<SearchState>(NO_SEARCH);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hit, setHit] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const drafts = useRef(new Map<string, Form>()).current;
  const listRef = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const loadList = useCallback((scope: Scope, quiet = false) => {
    if (!quiet) setLists((l) => ({ ...l, [scope]: { status: "loading" } }));
    api.notes(scope).then(
      (doc) => setLists((l) => ({ ...l, [scope]: { status: "ready", notes: doc.notes } })),
      (error: ApiError) => setLists((l) => ({ ...l, [scope]: { status: "error", error: error.message } })),
    );
  }, []);

  const showTags = useCallback((doc: TagListJson) => {
    setTagLists((t) => ({ ...t, [doc.journal]: doc.tags }));
    setTagState((t) => ({ ...t, [doc.journal]: tagListState(doc) }));
  }, []);

  const loadTags = useCallback((scope: Scope) => {
    api.tags(scope).then(showTags, () => {});
  }, [showTags]);

  // Writes the starter list only now, on the user's click (spec §3).
  const createTagList = useCallback(
    (scope: Scope) => {
      api.createTagList(scope).then(
        (doc) => {
          showTags(doc);
          toast("Created tags.md with the starter list");
        },
        (error: ApiError) => toast(error.message),
      );
    },
    [showTags, toast],
  );

  // "Edit tag list" in the sidebar; the list is read again when you come back to the page.
  const editTagList = useCallback(
    (scope: Scope) => {
      api.openTagList(scope).then(
        () => toast("Opened tags.md in your editor"),
        (error: ApiError) => toast(error.message),
      );
    },
    [toast],
  );

  const loadSettings = useCallback(() => {
    api.settings().then(
      (doc) => {
        setSettings(doc);
        setSettingsError(null);
        if (doc.journals.project) {
          loadList("project", true);
          loadTags("project");
        }
      },
      (error: ApiError) => setSettingsError(error.message),
    );
  }, [loadList, loadTags]);

  // Start: settings, and the personal journal's notes and tags, at once.
  useEffect(() => {
    loadList("personal");
    loadTags("personal");
    loadSettings();
  }, [loadList, loadTags, loadSettings]);

  // Unsaved forms kept for other notes: the browser asks before the page closes.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (drafts.size) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts]);

  // tags.md isn't watched; read it again when you come back to the page (after "Edit tag list").
  useEffect(() => {
    const again = () => SCOPES.forEach(loadTags);
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [loadTags]);

  // Live updates (docs/ui.md §4): a note changed on disk reloads that journal's list, the open note
  // if it changed, and the search results.
  useEffect(() => {
    const events = new EventSource("/api/events");
    let lost = false;
    events.addEventListener("notes-changed", (event) => {
      const { journal: scope, files } = JSON.parse((event as MessageEvent<string>).data) as { journal: Scope; files: string[] };
      loadList(scope, true);
      setLive((l) => ({ ...l, [scope]: { tick: l[scope].tick + 1, files } }));
    });
    events.onopen = () => {
      if (!lost) return;
      lost = false;
      setConnection("ok");
      for (const scope of SCOPES) loadList(scope, true);
    };
    events.onerror = () => {
      lost = true;
      setConnection("lost");
    };
    return () => events.close();
  }, [loadList]);

  const projectState: ProjectState = !settings?.journals.project ? "none" : settings.journals.project.exists ? "exists" : "new";
  const hasProject = projectState !== "none";
  const list = listOf(view);
  const state = lists[journal];
  const notes = state.status === "ready" ? state.notes : null;
  const counts = useMemo(() => (notes ? sidebarCounts(notes) : null), [notes]);
  const listKey = list ? `${list.list} ${"value" in list ? list.value : ""}` : "";
  const items = useMemo(() => (notes && list ? filterNotes(notes, list) : []), [notes, listKey]);
  const keyOf = useCallback((n: NoteSummary) => noteKey(journal, n), [journal]);
  // The selection falls back to the first row when it isn't in the list.
  const current = items.find((n) => keyOf(n) === selected) ?? items[0] ?? null;
  const currentKey = current ? keyOf(current) : null;
  const shown = search.status ? results.filter((r) => r.status === search.status) : results;
  const currentHit = shown.find((r) => resultKey(r) === hit) ?? null;
  const currentSuggestion = suggestions.find((s) => suggestKey(s) === hit) ?? null;
  const home = settings?.home ?? null;
  const projectRoot = settings?.journals.project ? homePath(settings.journals.project.path.replace(/[\\/]\.magpie$/, ""), home) : null;
  const allTags = useMemo(() => [...new Set([...tagLists.personal, ...tagLists.project])].sort(), [tagLists]);

  const select = useCallback((key: string | null, opts: { focus?: boolean; pane?: boolean } = {}) => {
    setSelected(key);
    setFocus((f) => ({ key: opts.focus ? key : null, n: f.n + 1 }));
    if (opts.pane) setPane("note");
  }, []);

  const go = useCallback((next: View) => {
    setView(next);
    setSelected(null);
    setPane("list");
    requestAnimationFrame(() => (next.page === "search" ? searchInput.current : listRef.current)?.focus());
  }, []);

  const openNote = useCallback(
    (scope: Scope, id: string) => {
      setJournal(scope);
      setView({ page: "all" });
      select(`${scope} id ${id}`, { focus: true, pane: true });
    },
    [select],
  );

  // A followed [[link]] is a step in the browser's history: the note you left gets its address
  // first, so Back returns to it. A note's address also opens it on load (a link opened in a new tab).
  const followLink = useCallback(
    (scope: Scope, from: string | null, to: string) => {
      if (from) history.replaceState(null, "", noteHash(scope, from));
      history.pushState(null, "", noteHash(scope, to));
      openNote(scope, to);
    },
    [openNote],
  );

  useEffect(() => {
    const show = () => {
      const target = parseNoteHash(location.hash);
      if (target) openNote(target.journal, target.id);
    };
    show();
    window.addEventListener("popstate", show);
    return () => window.removeEventListener("popstate", show);
  }, [openNote]);

  const pickTheme = useCallback((t: Theme) => {
    setTheme(t);
    applyTheme(t);
  }, []);

  const afterWrite = useCallback(
    (scope: Scope) => {
      loadList(scope, true);
      if (scope === "project" && projectState !== "exists") loadSettings();
    },
    [loadList, loadSettings, projectState],
  );

  const onSaved = useCallback(
    (doc: NoteJson, message: string) => {
      toast(message);
      const key = noteKey(doc.journal, doc);
      const before = lists[doc.journal].status === "ready" ? (lists[doc.journal] as { notes: NoteSummary[] }).notes : [];
      const fm = doc.frontmatter;
      const updated = before.map((n) =>
        n.file === doc.file
          ? {
              ...n,
              status: doc.status ?? n.status,
              verdict: doc.verdict ?? "",
              kind: typeof fm.kind === "string" ? fm.kind : n.kind,
              tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : n.tags,
              tried: fm.tried === true,
              rating: typeof fm.rating === "number" ? fm.rating : null,
            }
          : n,
      );
      setLists((l) => ({ ...l, [doc.journal]: { status: "ready", notes: updated } }));
      // Inbox review: a saved Verdict moves the note to reviewed; the next inbox note opens.
      if (view.page === "inbox" && doc.status === "reviewed" && doc.journal === journal) {
        const next = nextAfter(items.map(keyOf), key);
        select(next, { focus: true });
        if (!next) requestAnimationFrame(() => listRef.current?.focus());
      }
    },
    [toast, lists, view.page, journal, items, keyOf, select],
  );

  const onAdopted = useCallback(() => {
    toast("Copied to the project journal");
    afterWrite("project");
  }, [toast, afterWrite]);

  const commands: Command[] = [
    { id: "inbox", label: "Go to Inbox", keywords: "review", icon: "tray", hint: "g i", run: () => go({ page: "inbox" }) },
    { id: "all", label: "Show all notes", keywords: "list", icon: "notebook", run: () => go({ page: "all" }) },
    { id: "search", label: "Search", keywords: "find", icon: "search", hint: "/", run: () => go({ page: "search" }) },
    { id: "add", label: "Add a note", keywords: "new url repository package", icon: "plus", run: () => go({ page: "add" }) },
    { id: "import", label: "Import lines", keywords: "bulk", icon: "import", run: () => go({ page: "import" }) },
    { id: "recall", label: "Check a package", keywords: "recall hook install", icon: "package", run: () => go({ page: "recall" }) },
    { id: "suggest", label: "Suggest for this project", keywords: "fit candidates dependencies manifest", icon: "folder", run: () => go({ page: "suggest" }) },
    { id: "graph", label: "Open graph", keywords: "map connections links tags network", icon: "graph", hint: "g g", run: () => go({ page: "graph" }) },
    { id: "settings", label: "Settings", keywords: "journal token version", icon: "gear", run: () => go({ page: "settings" }) },
    ...(journal === "personal" && hasProject
      ? [{ id: "project", label: "Switch to the project journal", keywords: "journal", icon: "users" as const, run: () => setJournal("project") }]
      : journal === "project"
        ? [{ id: "personal", label: "Switch to the personal journal", keywords: "journal", icon: "user" as const, run: () => setJournal("personal") }]
        : []),
    ...(["dark", "light", "system"] as const)
      .filter((t) => t !== theme)
      .map((t) => ({ id: `theme-${t}`, label: t === "system" ? "Use the system theme" : `Use the ${t} theme`, keywords: "appearance colour", icon: "gear" as const, run: () => pickTheme(t) })),
    { id: "keys", label: "Show the keyboard map", keywords: "shortcuts help", icon: "keyboard", hint: "?", run: () => setHelp(true) },
  ];

  // The keyboard map (docs/ui.md §7). One listener; it reads the latest state through a ref.
  const act = useRef<(action: Action) => void>(() => {});
  act.current = (action) => {
    // Search and Suggest: a list of results with the note beside it, selected by `hit`.
    const searching = view.page === "search" || view.page === "suggest";
    const keys = view.page === "search" ? shown.map(resultKey) : view.page === "suggest" ? suggestions.map(suggestKey) : items.map(keyOf);
    const at = searching ? hit : currentKey;
    switch (action) {
      case "next":
      case "previous": {
        if ((!list && !searching) || !keys.length) return;
        const index = at === null ? -1 : keys.indexOf(at);
        const to = Math.min(keys.length - 1, Math.max(0, index + (action === "next" ? 1 : -1)));
        if (searching) setHit(keys[to]);
        else select(keys[to]);
        listRef.current?.focus();
        return;
      }
      case "open":
        if (searching && at) {
          setHit(at);
          setPane("note");
          setFocus((f) => ({ key: at, n: f.n + 1 }));
        } else if (list && currentKey) select(currentKey, { focus: true, pane: true });
        return;
      case "edit":
        if ((list && currentKey) || (searching && at)) {
          setPane("note");
          setEditRequest((n) => n + 1);
        }
        return;
      case "escape":
        if (help) setHelp(false);
        else {
          setPane("list");
          // Back to the list; with no list, out of the text field, so single keys work again.
          if (listRef.current) listRef.current.focus();
          else (document.activeElement as HTMLElement | null)?.blur();
        }
        return;
      case "go-inbox":
        return go({ page: "inbox" });
      case "go-search":
      case "search":
        return go({ page: "search" });
      case "go-graph":
        return go({ page: "graph" });
      case "help":
        setHelp(true);
        return;
      case "palette":
        setPalette(true);
        return;
      case "save":
        return;
    }
  };

  useEffect(() => {
    let pending: Pending = null;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editable = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const result = keyAction({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, editable, mac: IS_MAC }, pending);
      pending = result.pending;
      if (!result.action) return;
      // Enter on a button or link presses it; it doesn't open the selected note.
      if (result.action === "open" && target?.closest("button, a")) return;
      e.preventDefault();
      act.current(result.action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const review = view.page === "inbox";

  // "Show in graph" in the note view: the graph, centred on that note, in local mode.
  const showInGraph = (scope: Scope, file: string) => {
    setJournal(scope);
    go({ page: "graph", focus: `note:${file}` });
  };

  // `over`: the graph's note pane, where a [[link]] selects the note in the graph.
  const notePane = (scope: Scope, address: { id: string } | { file: string }, key: string, over: Partial<NotePaneProps> = {}) => (
    <NotePane
      key={key}
      journal={scope}
      address={address}
      noteKey={key}
      home={home}
      review={review}
      focusRequest={focus.key === key ? focus.n : 0}
      editRequest={editRequest}
      live={live[scope]}
      tagList={tagLists[scope]}
      noTagList={tagState[scope] === "missing"}
      onCreateTagList={() => createTagList(scope)}
      drafts={drafts}
      onSaved={onSaved}
      onLeave={() => listRef.current?.focus()}
      onToast={toast}
      onBack={() => {
        setPane("list");
        listRef.current?.focus();
      }}
      project={projectState}
      onAdopted={onAdopted}
      onOpenNote={openNote}
      linkNotes={lists[scope].status === "ready" ? (lists[scope] as { notes: NoteSummary[] }).notes : []}
      onFollowLink={followLink}
      onAddNote={(target) => go({ page: "add", target })}
      onTagList={showTags}
      onShowInGraph={(file) => showInGraph(scope, file)}
      {...over}
    />
  );

  const openResult = (key: string, open: boolean) => {
    setHit(key);
    setPane("note");
    if (open) setFocus((f) => ({ key, n: f.n + 1 }));
  };

  let workspace;
  if (list) {
    workspace = (
      <>
        <section className="pane" aria-labelledby="list-title">
          <header className="pane-header">
            <h1 className="pane-title" id="list-title">
              {viewTitle(view)}
            </h1>
            {notes ? <span className="pane-count tabular">{items.length}</span> : null}
            {review && items.length ? (
              <span className="pane-count pane-hint">
                <kbd>j</kbd> <kbd>k</kbd> move · <kbd>Enter</kbd> review
              </span>
            ) : null}
          </header>
          {state.status === "loading" ? (
            <SkeletonRows label="Loading the notes" />
          ) : state.status === "error" ? (
            <EmptyState
              action={
                <button type="button" className="button secondary" onClick={() => loadList(journal)}>
                  <Icon name="reload" />
                  Retry
                </button>
              }
            >
              {`Couldn't load the notes. ${state.error}`}
            </EmptyState>
          ) : items.length ? (
            <VirtualList
              id="notes"
              label={viewTitle(view)}
              items={items}
              keyOf={keyOf}
              selected={currentKey}
              onSelect={(key) => select(key, { pane: true })}
              onOpen={(key) => select(key, { focus: true, pane: true })}
              row={(n) => <NoteRow note={n} showInbox={!review} />}
              listRef={listRef}
            />
          ) : review ? (
            <EmptyState action={<AddButton onClick={() => go({ page: "add" })} />}>{`Your inbox is empty. Add a repository here, or from the palette (${MOD}+K).`}</EmptyState>
          ) : (
            <EmptyState action={<AddButton onClick={() => go({ page: "add" })} />}>
              No notes in this journal yet. Add one here, or run <code>magpie note</code> in a terminal.
            </EmptyState>
          )}
        </section>
        <section className="pane" aria-label="Note">
          {current && currentKey ? (
            notePane(journal, current.id !== null ? { id: current.id } : { file: current.file }, currentKey)
          ) : state.status === "ready" ? (
            <EmptyState center>{review ? "Nothing to review. New notes without a Verdict appear here." : "Select a note to read it."}</EmptyState>
          ) : null}
        </section>
      </>
    );
  } else if (view.page === "search") {
    workspace = (
      <>
        <SearchPane
          search={search}
          onSearch={setSearch}
          results={results}
          onResults={setResults}
          selected={currentHit ? resultKey(currentHit) : null}
          onSelect={openResult}
          hasProject={hasProject}
          tags={allTags}
          inputRef={searchInput}
          listRef={listRef}
          refresh={live.personal.tick + live.project.tick}
        />
        <section className="pane" aria-label="Note">
          {currentHit?.id ? (
            notePane(currentHit.journal, { id: currentHit.id }, resultKey(currentHit))
          ) : (
            <EmptyState center>{shown.length ? "Select a result to read the note." : "Results open here."}</EmptyState>
          )}
        </section>
      </>
    );
  } else if (view.page === "suggest") {
    workspace = (
      <>
        <SuggestPane
          items={suggestions}
          onItems={setSuggestions}
          selected={currentSuggestion ? suggestKey(currentSuggestion) : null}
          onSelect={openResult}
          projectRoot={projectRoot}
          listRef={listRef}
          refresh={live.personal.tick + live.project.tick}
        />
        <section className="pane" aria-label="Note">
          {currentSuggestion?.id ? (
            notePane(currentSuggestion.journal, { id: currentSuggestion.id }, suggestKey(currentSuggestion))
          ) : (
            <EmptyState center>{suggestions.length ? "Select a suggestion to read the note. Your coding agent picks the fit." : "Notes open here."}</EmptyState>
          )}
        </section>
      </>
    );
  } else if (view.page === "graph") {
    workspace = (
      <Suspense
        fallback={
          <section className="pane" aria-label="Graph">
            <p className="graph-status" role="status">
              Loading the graph…
            </p>
          </section>
        }
      >
        <GraphPage
          key={journal}
          journal={journal}
          theme={theme}
          focus={view.focus ?? null}
          onAdd={() => go({ page: "add" })}
          renderNote={(note, open) =>
            notePane(journal, { id: note.id }, `${journal} id ${note.id}`, { onOpenNote: (_scope, id) => open(id), onFollowLink: (_scope, _from, to) => open(to), onShowInGraph: undefined })
          }
        />
      </Suspense>
    );
  } else {
    workspace = (
      <section className="pane page-pane">
        {view.page === "add" ? (
          <AddPage
            key={view.target ?? ""}
            project={projectState}
            defaultJournal={journal}
            initialTarget={view.target}
            onOpenNote={openNote}
            onSaved={afterWrite}
            noTagList={(scope) => tagState[scope] === "missing"}
            onCreateTagList={createTagList}
            onTagList={showTags}
          />
        ) : view.page === "import" ? (
          <ImportPage project={projectState} defaultJournal={journal} onImported={afterWrite} />
        ) : view.page === "recall" ? (
          <RecallPage home={home} />
        ) : (
          <SettingsPage settings={settings} error={settingsError} theme={theme} onTheme={pickTheme} onKeys={() => setHelp(true)} />
        )}
      </section>
    );
  }

  // A dialog is modal: what is behind it can't take focus.
  const behind = palette || help;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to the main pane
      </a>
      {connection === "lost" ? (
        <div className="banner-strip" role="alert">
          <Icon name="warning" />
          <span className="text">Lost the connection to magpie ui. Your notes are safe on disk. Start magpie ui again, then open the URL it prints.</span>
        </div>
      ) : null}
      <Sidebar
        journal={journal}
        hasProject={hasProject}
        onJournal={(j) => {
          setJournal(j);
          setSelected(null);
        }}
        counts={counts}
        tagList={tagState[journal]}
        onCreateTagList={() => createTagList(journal)}
        onEditTagList={() => editTagList(journal)}
        view={view}
        onView={go}
        inert={behind}
      />
      <main id="main" tabIndex={-1} inert={behind} className={list || view.page === "search" || view.page === "suggest" ? "workspace" : "workspace single"} data-pane={pane} aria-label={viewTitle(view)}>
        {workspace}
      </main>
      {palette ? <Palette actions={commands} onNote={(r) => r.id && openNote(r.journal, r.id)} onClose={() => setPalette(false)} /> : null}
      {help ? <KeyMapDialog onClose={() => setHelp(false)} /> : null}
      <Toasts toasts={toasts} />
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="button secondary" onClick={onClick}>
      <Icon name="plus" />
      Add a note
    </button>
  );
}
