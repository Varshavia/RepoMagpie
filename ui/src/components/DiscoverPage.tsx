// Discover (decision 0045, docs/ui.md §7): search GitHub's repositories by words, a domain, a kind and
// a few filters, see stars, activity and licence, and add the chosen ones to the inbox. The search
// runs in magpie ui's server (GET /api/discover); each add is Add's POST /api/note with the URL.
// Loaded on demand, in its own chunk, like the graph. A search runs on Enter or the Search button,
// never on a keystroke or a filter change.
import { useEffect, useId, useRef, useState, type MutableRefObject } from "react";
import type { DiscoverResult } from "../../../src/core/discover.ts";
import { DOMAINS } from "../../../src/core/domains.ts";
import { partialSearchWarning, type GitHubSource } from "../../../src/core/github-connection.ts";
import { api, type ApiError, type DiscoverJson, type Scope } from "../api.ts";
import { Icon } from "../icons.tsx";
import {
  appendResults,
  APPROXIMATE_KINDS,
  badgeText,
  bulkPlan,
  bulkSummary,
  cardMeta,
  DEFAULT_FILTERS,
  discoverParams,
  inJournal,
  LANGUAGES,
  listsHiddenText,
  looserFilters,
  matchedLine,
  needsTokenWarning,
  resetSentence,
  shownResults,
  SORT_LABELS,
  sortFor,
  STAR_STEPS,
  toggle,
  UPDATED_STEPS,
  type AddState,
  type BulkOutcome,
  type Filters,
} from "../logic/discover.ts";
import { oneLine, withItem } from "../logic/edits.ts";
import { noteHash } from "../logic/links.ts";
import { KINDS } from "../logic/schema.ts";
import { externalHref, visible } from "../logic/text.ts";
import { Banner, EmptyState, FieldError, plainClick, SkeletonRows } from "./common.tsx";
import { ItemsField } from "./fields.tsx";
import { GitHubLine } from "./GitHubLine.tsx";
import "./DiscoverPage.css";

const EXAMPLE = "design system";
// The partial-search warning, once dismissed, stays hidden until the tab closes (decision 0053).
const PARTIAL_DISMISSED = "magpie-partial-search-dismissed";

// Storage can be missing or blocked; the warning then shows again on the next search.
function dismissedBefore(): boolean {
  try {
    return sessionStorage.getItem(PARTIAL_DISMISSED) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    sessionStorage.setItem(PARTIAL_DISMISSED, "1");
  } catch {
    // Hidden on this page only.
  }
}

type Failure = { kind: "rate-limit" | "offline" | "error"; message: string; reset: string | null };
type Searched = { text: string; filters: Filters };

// What the page keeps while another screen is open (App holds it), so coming back shows the same
// search, results and adds.
export interface DiscoverMemory {
  text: string;
  filters: Filters;
  searched: Searched | null;
  doc: DiscoverJson | null;
  results: DiscoverResult[];
  listsHidden: number; // over every page shown
  adds: Map<string, AddState>;
  selected: Set<string>;
}

interface Props {
  journal: Scope;
  github: GitHubSource | null | undefined; // undefined until the settings arrive
  memory: MutableRefObject<DiscoverMemory | null>;
  onOpenNote: (journal: Scope, id: string) => void;
  onSaved: (journal: Scope) => void;
}

function failureOf(e: unknown): Failure {
  const error = e as ApiError;
  const problem = (error.document as DiscoverJson | null)?.problem;
  if (problem?.kind === "rate-limit" || problem?.kind === "search-rate-limit" || problem?.kind === "secondary-rate-limit") return { kind: "rate-limit", message: problem.message, reset: resetSentence(problem.reset) };
  if (problem?.kind === "offline" || problem?.kind === "timeout") return { kind: "offline", message: problem.message, reset: null };
  return { kind: "error", message: error.message, reset: null };
}

export default function DiscoverPage({ journal, github, memory, onOpenNote, onSaved }: Props) {
  const id = useId();
  const tokenSet = Boolean(github);
  const kept = memory.current;
  const [text, setText] = useState(kept?.text ?? "");
  const [filters, setFilters] = useState<Filters>(kept?.filters ?? DEFAULT_FILTERS);
  const [searched, setSearched] = useState<Searched | null>(kept?.searched ?? null);
  const [doc, setDoc] = useState<DiscoverJson | null>(kept?.doc ?? null);
  const [results, setResults] = useState<DiscoverResult[]>(kept?.results ?? []);
  const [listsHidden, setListsHidden] = useState(kept?.listsHidden ?? 0);
  const [adds, setAdds] = useState<Map<string, AddState>>(() => new Map([...(kept?.adds ?? [])].filter(([, s]) => s.status !== "adding")));
  const [selected, setSelected] = useState<Set<string>>(kept?.selected ?? new Set());
  const [loading, setLoading] = useState<"" | "search" | "more">("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [moreFailure, setMoreFailure] = useState<Failure | null>(null);
  const [verdictFor, setVerdictFor] = useState<string | null>(null); // the card with "Add with a Verdict…" open
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null); // adds waiting for the token warning's answer
  const [partialDismissed, setPartialDismissed] = useState(dismissedBefore);
  const latest = useRef(0); // the last search asked for; older replies are dropped
  const focusAdded = useRef<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    memory.current = { text, filters, searched, doc, results, listsHidden, adds, selected };
  }, [memory, text, filters, searched, doc, results, listsHidden, adds, selected]);

  useEffect(() => {
    if (outcome) summaryRef.current?.focus();
  }, [outcome]);

  const setAdd = (name: string, state: AddState) => setAdds((m) => new Map(m).set(name, state));
  // An add counts for the journal it went to; switching journals shows the other one's state.
  const addsHere = new Map([...adds].filter(([, s]) => s.status !== "added" || s.journal === journal));
  const busy = progress !== null;

  async function search(next: Searched, page = 1) {
    const ask = ++latest.current;
    setLoading(page === 1 ? "search" : "more");
    if (page === 1) {
      setFailure(null);
      setOutcome(null);
    }
    setMoreFailure(null);
    try {
      const answer = await api.discover(discoverParams(next.text, next.filters, page));
      if (ask !== latest.current) return;
      setDoc(answer);
      setSearched(next);
      setResults((shown) => (page === 1 ? answer.results : appendResults(shown, answer.results)));
      setListsHidden((n) => (page === 1 ? answer.lists_hidden : n + answer.lists_hidden));
      if (page === 1) setSelected(new Set());
    } catch (e) {
      if (ask !== latest.current) return;
      if (page === 1) {
        setFailure(failureOf(e));
        setDoc(null);
        setResults([]);
        setListsHidden(0);
        setSearched(next);
      } else setMoreFailure(failureOf(e));
    } finally {
      if (ask === latest.current) setLoading("");
    }
  }

  // One add, as Add's Save note does it. "there" when the journal had the note already.
  async function add(result: DiscoverResult, extra: { text?: string; use_when?: string[] } = {}): Promise<"added" | "there" | { error: string }> {
    setAdd(result.name, { status: "adding" });
    try {
      const saved = await api.save({ target: result.url, to: journal, ...extra });
      setAdd(result.name, { status: "added", journal: saved.journal, id: saved.id });
      return saved.created ? "added" : "there";
    } catch (e) {
      const error = (e as ApiError).message;
      setAdd(result.name, { status: "failed", error });
      return { error };
    }
  }

  async function addOne(result: DiscoverResult, extra?: { text?: string; use_when?: string[] }) {
    focusAdded.current = result.name;
    const done = await add(result, extra);
    if (done !== "added" && done !== "there") focusAdded.current = null;
    else setVerdictFor(null);
    onSaved(journal);
  }

  async function addSelected(confirmed = false) {
    const plan = bulkPlan(results, selected, addsHere, journal);
    if (!confirmed && needsTokenWarning(plan.add.length, tokenSet)) return setConfirm(plan.add.length);
    setConfirm(null);
    setOutcome(null);
    const result: BulkOutcome = { added: 0, there: plan.there.length, failed: [] };
    setProgress({ done: 0, total: plan.add.length });
    for (const [i, r] of plan.add.entries()) {
      setProgress({ done: i + 1, total: plan.add.length });
      const done = await add(r); // one at a time: GitHub's limits, and the order the person sees
      if (done === "added") result.added++;
      else if (done === "there") result.there++;
      else result.failed.push({ name: r.name, error: done.error });
    }
    setProgress(null);
    setSelected(new Set());
    setOutcome(result);
    if (plan.add.length) onSaved(journal);
  }

  const submit = () => {
    setConfirm(null);
    void search({ text, filters });
  };
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const domain = DOMAINS.find((d) => d.id === filters.domain);
  const chosen = bulkPlan(results, selected, addsHere, journal);
  const partial = doc?.partial_search ? partialSearchWarning(doc.query, doc.partial_search) : null;
  // Hiding the ones a journal has applies at once: it filters what is shown, not GitHub's search.
  const shown = shownResults(results, filters.hideOwned);
  const owned = results.length - shown.length;
  // Show: the same search with lists; its requests are the same, so the cache answers.
  const showLists = () => {
    if (!searched) return;
    set("lists", true);
    void search({ ...searched, filters: { ...searched.filters, lists: true } });
  };
  const listsLine =
    listsHidden && searched && !searched.filters.lists ? (
      <p className="field-help">
        {`${listsHiddenText(listsHidden)} `}
        <button type="button" className="link-button" onClick={showLists}>
          Show
        </button>
      </p>
    ) : null;

  return (
    <div className="page discover-page">
      <h1 className="page-title">Discover</h1>
      <p className="page-lede">Find repositories on GitHub by words, concern and kind, and add the ones you pick to your inbox.</p>
      <p className="field-help">Discover sends your words and filters to GitHub's search API, nothing from your journals.</p>
      <GitHubLine source={github} />

      <form
        className="page-section"
        role="search"
        aria-label="Search GitHub"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor={`${id}-q`}>
            Words
          </label>
          <div className="input-row">
            <input
              id={`${id}-q`}
              name="q"
              type="search"
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="pdf invoice, browser testing, design system…"
              autoComplete="off"
              autoFocus={!searched}
            />
            <button type="submit" className="button primary" disabled={loading === "search"}>
              {loading === "search" ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        <div className="discover-filters">
          <div className="field">
            <label className="field-label" htmlFor={`${id}-domain`}>
              Domain
            </label>
            <select id={`${id}-domain`} className="select" value={filters.domain} onChange={(e) => set("domain", e.target.value)} aria-describedby={`${id}-domain-help`}>
              <option value="">Any</option>
              {DOMAINS.map((d) => (
                <option key={d.id} value={d.id} title={d.definition}>
                  {d.id}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-kind`}>
              Kind
            </label>
            <select id={`${id}-kind`} className="select" value={filters.kind} onChange={(e) => set("kind", e.target.value)}>
              <option value="">Any</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {APPROXIMATE_KINDS.includes(k) ? `${k} (approximate)` : k}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-language`}>
              Language
            </label>
            <input id={`${id}-language`} className="input" list={`${id}-languages`} value={filters.language} onChange={(e) => set("language", e.target.value)} placeholder="Any" autoComplete="off" spellCheck={false} />
            <datalist id={`${id}-languages`}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-stars`}>
              Min stars
            </label>
            <select id={`${id}-stars`} className="select" value={filters.minStars} onChange={(e) => set("minStars", Number(e.target.value))}>
              {STAR_STEPS.map((n) => (
                <option key={n} value={n}>
                  {n >= 1000 ? `${n / 1000}k` : n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-updated`}>
              Updated within
            </label>
            <select id={`${id}-updated`} className="select" value={filters.updatedWithin} onChange={(e) => set("updatedWithin", Number(e.target.value))}>
              {UPDATED_STEPS.map((s) => (
                <option key={s.months} value={s.months}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-sort`}>
              Sort
            </label>
            <select id={`${id}-sort`} className="select" value={sortFor(text, filters.sort)} onChange={(e) => set("sort", e.target.value as Filters["sort"])}>
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <label className="check">
            <input type="checkbox" checked={filters.archived} onChange={(e) => set("archived", e.target.checked)} />
            Show archived
          </label>
          <label className="check">
            <input type="checkbox" checked={filters.lists} onChange={(e) => set("lists", e.target.checked)} />
            Show lists and courses
          </label>
        </div>
        <p className="field-help" id={`${id}-domain-help`}>
          {domain ? `${domain.id}: ${domain.definition}` : "Domain: the concern a repository addresses, such as testing or frontend."} Filters apply when you search.
        </p>
      </form>

      {loading === "search" ? (
        <div className="page-section">
          <SkeletonRows count={6} label="Searching GitHub" />
        </div>
      ) : failure ? (
        <div className="page-section">
          <FailureBanner failure={failure} onRetry={() => searched && void search(searched)} />
        </div>
      ) : !doc ? (
        <div className="page-section">
          <EmptyState
            action={
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setText(EXAMPLE);
                  void search({ text: EXAMPLE, filters });
                }}
              >
                {`Try “${EXAMPLE}”`}
              </button>
            }
          >
            Type what you need and choose Search. Results show stars, the last push and the licence, and whether a journal has a note on the repository already.
          </EmptyState>
        </div>
      ) : (
        <div className="page-section">
          {doc.approximate ? <Banner tone="muted">{visible(doc.approximate)}</Banner> : null}
          {doc.incomplete ? <Banner tone="warning">GitHub stopped this search early, so some matches may be missing.</Banner> : null}
          {doc.warnings.map((w) =>
            w !== partial ? (
              <Banner tone="warning" key={w}>
                {visible(w)}
              </Banner>
            ) : partialDismissed ? null : (
              <Banner
                tone="warning"
                key={w}
                action={
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => {
                      rememberDismissed();
                      setPartialDismissed(true);
                    }}
                  >
                    Dismiss
                  </button>
                }
              >
                {visible(w)}
              </Banner>
            ),
          )}

          {results.length === 0 ? (
            listsLine ?? (
              <EmptyState>
                {looserFilters(doc.query).length ? `No repositories match. Try loosening: ${looserFilters(doc.query).join("; ")}.` : "No repositories match. Try other words."}
              </EmptyState>
            )
          ) : (
            <>
              <div className="discover-bar">
                <p className="field-help" role="status">
                  {`${shown.length} shown of ${doc.total.toLocaleString("en-US")} on GitHub.${owned ? ` ${owned} you already have ${owned === 1 ? "is" : "are"} hidden.` : ""}`}
                </p>
                <label className="check">
                  <input type="checkbox" checked={filters.hideOwned} onChange={(e) => set("hideOwned", e.target.checked)} />
                  Hide ones I already have
                </label>
                {selected.size ? (
                  <div className="form-actions">
                    <span className="field-help">{`${selected.size} selected`}</span>
                    <button type="button" className="button secondary" onClick={() => setSelected(new Set())} disabled={busy}>
                      Clear selection
                    </button>
                    <button type="button" className="button primary" onClick={() => void addSelected()} disabled={busy || chosen.add.length === 0}>
                      {`Add ${chosen.add.length} to inbox`}
                    </button>
                  </div>
                ) : null}
              </div>
              {listsLine}

              {confirm !== null ? (
                <Banner
                  tone="warning"
                  action={
                    <span className="form-actions">
                      <button type="button" className="button secondary" onClick={() => setConfirm(null)}>
                        Cancel
                      </button>
                      <button type="button" className="button primary" onClick={() => void addSelected(true)}>
                        {`Add ${confirm} anyway`}
                      </button>
                    </span>
                  }
                >
                  {`Without a GitHub token, GitHub allows 60 requests an hour, and each add uses about 3 to 5. Adding ${confirm} may reach the limit; the rest would then fail until it resets.`}
                </Banner>
              ) : null}
              {progress ? <p className="field-help" role="status">{`Adding ${progress.done} of ${progress.total}…`}</p> : null}
              {outcome ? (
                <div className="banner muted discover-summary" role="status" tabIndex={-1} ref={summaryRef}>
                  <Icon name={outcome.failed.length ? "warning" : "check"} />
                  <div className="text">
                    <p>{bulkSummary(outcome)}</p>
                    {outcome.failed.length ? (
                      <ul aria-label="Failed">
                        {outcome.failed.map((f) => (
                          <li key={f.name}>
                            <span translate="no">{visible(f.name)}</span>
                            {`: ${visible(f.error)}`}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <ul className="discover-results" aria-label="Results">
                {shown.map((r) => (
                  <Card
                    key={r.name}
                    result={r}
                    journal={journal}
                    state={addsHere.get(r.name)}
                    selected={selected.has(r.name)}
                    onSelect={() => setSelected((s) => toggle(s, r.name))}
                    busy={busy}
                    verdictOpen={verdictFor === r.name}
                    onVerdict={(open) => setVerdictFor(open ? r.name : null)}
                    onAdd={(extra) => void addOne(r, extra)}
                    focusAdded={focusAdded}
                    onOpenNote={onOpenNote}
                  />
                ))}
              </ul>

              {moreFailure ? <FailureBanner failure={moreFailure} onRetry={() => searched && doc.next_page && void search(searched, doc.next_page)} /> : null}
              {doc.next_page && searched ? (
                <div className="form-actions">
                  <button type="button" className="button secondary" onClick={() => void search(searched, doc.next_page as number)} disabled={loading !== ""}>
                    {loading === "more" ? "Loading…" : "More results"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// A rate limit's message says how to connect GitHub; the line at the top of the page has the steps.
function FailureBanner({ failure, onRetry }: { failure: Failure; onRetry: () => void }) {
  if (failure.kind === "rate-limit") {
    return (
      <Banner tone="warning">
        {visible(failure.message)}
        {failure.reset ? ` ${failure.reset}` : ""}
      </Banner>
    );
  }
  return (
    <Banner
      tone={failure.kind === "offline" ? "warning" : "danger"}
      action={
        <button type="button" className="button secondary" onClick={onRetry}>
          <Icon name="reload" />
          Try again
        </button>
      }
    >
      {visible(failure.message)}
    </Banner>
  );
}

function Card(props: {
  result: DiscoverResult;
  journal: Scope;
  state: AddState | undefined;
  selected: boolean;
  onSelect: () => void;
  busy: boolean;
  verdictOpen: boolean;
  onVerdict: (open: boolean) => void;
  onAdd: (extra?: { text?: string; use_when?: string[] }) => void;
  focusAdded: MutableRefObject<string | null>;
  onOpenNote: (journal: Scope, id: string) => void;
}) {
  const { result: r, journal, state, selected, onSelect, busy, verdictOpen, onVerdict, onAdd, focusAdded, onOpenNote } = props;
  const meta = cardMeta(r);
  const matched = matchedLine(r);
  const name = visible(r.name);
  const here = inJournal(r, journal);
  const href = externalHref(r.url);
  const noteLink = (j: Scope, noteId: string, label: string, ref?: (el: HTMLAnchorElement | null) => void) => (
    <a
      href={noteHash(j, noteId)}
      ref={ref}
      onClick={(e) => {
        if (!plainClick(e)) return;
        e.preventDefault();
        onOpenNote(j, noteId);
      }}
    >
      {label}
    </a>
  );
  return (
    <li className="discover-card" aria-label={name}>
      <div className="discover-head">
        {here ? null : (
          <input type="checkbox" className="discover-select" checked={selected} onChange={onSelect} disabled={busy || state?.status === "added"} aria-label={`Select ${name}`} />
        )}
        {href ? (
          <a className="discover-name" href={href} target="_blank" rel="noreferrer" translate="no">
            {name}
            <Icon name="external" size={14} />
          </a>
        ) : (
          <span className="discover-name" translate="no">
            {name}
          </span>
        )}
        {r.archived ? <span className="badge plain">Archived</span> : null}
      </div>

      <p className="discover-meta">
        <span aria-hidden="true">{`${meta.stars} stars`}</span>
        <span className="visually-hidden">{meta.starsLabel}</span>
        <span aria-hidden="true">{`${meta.forks} forks`}</span>
        <span className="visually-hidden">{meta.forksLabel}</span>
        {meta.age ? <span title={meta.date ?? undefined}>{`Pushed ${meta.age}`}</span> : null}
        <span className={meta.noLicence ? "discover-no-licence" : undefined}>{meta.licence}</span>
        {r.language ? <span translate="no">{visible(r.language)}</span> : null}
      </p>

      {r.description ? <p className="discover-description">{visible(r.description)}</p> : null}

      {r.topics.length ? (
        <ul className="chips" aria-label="Topics">
          {r.topics.map((t) => (
            <li key={t}>
              <span className="chip tag" translate="no">
                {visible(t)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {matched ? <p className="discover-matched">{matched}</p> : null}

      {r.estimated_kind || r.suggested_domains.length ? (
        <p className="discover-estimated">
          {[r.estimated_kind ? `kind ${r.estimated_kind}` : null, r.suggested_domains.length ? `domains ${r.suggested_domains.join(", ")}` : null].filter(Boolean).join(" · ")}
          <span className="badge draft">estimated</span>
        </p>
      ) : null}

      {r.in_journal.map((entry) => (
        <p className="discover-in-journal" key={entry.journal}>
          <span className="badge plain">{`In your ${entry.journal} journal`}</span>
          {noteLink(entry.journal, entry.id, badgeText(entry))}
        </p>
      ))}

      {here ? null : state?.status === "added" ? (
        <p className="discover-added">
          <Icon name="check" size={14} />
          {state.id
            ? noteLink(state.journal, state.id, "Added", (el) => {
                if (el && focusAdded.current === r.name) {
                  focusAdded.current = null;
                  el.focus();
                }
              })
            : "Added"}
        </p>
      ) : verdictOpen ? (
        <VerdictForm name={name} disabled={state?.status === "adding"} onCancel={() => onVerdict(false)} onSave={onAdd} />
      ) : (
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={() => onAdd()} disabled={busy || state?.status === "adding"} aria-label={`Add ${name} to your inbox`}>
            {state?.status === "adding" ? "Adding…" : "Add to inbox"}
          </button>
          <button type="button" className="button ghost" onClick={() => onVerdict(true)} disabled={busy || state?.status === "adding"} aria-label={`Add ${name} with a Verdict`}>
            Add with a Verdict…
          </button>
        </div>
      )}
      {state?.status === "failed" ? <FieldError>{visible(state.error)}</FieldError> : null}
    </li>
  );
}

function VerdictForm({ name, disabled, onCancel, onSave }: { name: string; disabled: boolean; onCancel: () => void; onSave: (extra: { text?: string; use_when?: string[] }) => void }) {
  const id = useId();
  const [verdict, setVerdict] = useState("");
  const [useWhen, setUseWhen] = useState<{ items: string[]; text: string }>({ items: [], text: "" });
  const save = () => {
    const items = withItem(useWhen.items, useWhen.text);
    onSave({ text: oneLine(verdict) || undefined, use_when: items.length ? items : undefined });
  };
  return (
    <div className="discover-verdict" role="group" aria-label={`Verdict for ${name}`}>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-verdict`}>
          Verdict <span className="field-help">(optional; without one the note goes to the Inbox)</span>
        </label>
        <textarea
          id={`${id}-verdict`}
          className="textarea"
          rows={2}
          value={verdict}
          onChange={(e) => setVerdict(e.target.value)}
          placeholder="Your own words: what you decided, and why…"
          autoComplete="off"
          autoFocus
          disabled={disabled}
        />
      </div>
      <ItemsField label="Use when" items={useWhen.items} text={useWhen.text} onChange={(items, text) => setUseWhen({ items, text })} disabled={disabled} />
      <div className="form-actions">
        <button type="button" className="button primary" onClick={save} disabled={disabled}>
          {disabled ? "Saving…" : "Save note"}
        </button>
        <button type="button" className="button ghost" onClick={onCancel} disabled={disabled}>
          Cancel
        </button>
      </div>
    </div>
  );
}
