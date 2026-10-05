// Settings (docs/ui.md §7; read-only in v0.1): the journals, whether GITHUB_TOKEN is set (never its
// value), the version, links to the docs. The theme is this browser's choice, not a journal setting.
import type { SettingsJson } from "../api.ts";
import type { Theme } from "../platform.ts";
import { EmptyState, SkeletonRows } from "./common.tsx";

const DOCS = "https://github.com/Varshavia/RepoMagpie";

interface Props {
  settings: SettingsJson | null;
  error: string | null;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onKeys: () => void;
}

export function SettingsPage({ settings, error, theme, onTheme, onKeys }: Props) {
  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-lede">
        The journals and settings this <code>magpie ui</code> uses. To change a journal, start <code>magpie ui</code> with <code>--home</code> or <code>--project</code>, or set <code>MAGPIE_HOME</code>.
      </p>

      <section className="page-section" aria-labelledby="settings-journals">
        <h2 className="section-label" id="settings-journals">
          Journals
        </h2>
        {settings ? (
          <dl className="facts">
            <dt>Personal</dt>
            <dd>
              <span className="mono">{settings.journals.personal.path}</span>
              {settings.journals.personal.exists ? null : <span className="field-help"> (created by the first note)</span>}
            </dd>
            <dt>Project</dt>
            <dd>
              {settings.journals.project ? (
                <>
                  <span className="mono">{settings.journals.project.path}</span>
                  {settings.journals.project.exists ? null : <span className="field-help"> (created by the first note saved to it)</span>}
                </>
              ) : (
                "None: magpie ui was not started inside a project."
              )}
            </dd>
            <dt>GitHub token</dt>
            <dd>{settings.github_token_set ? "Set (GITHUB_TOKEN)" : "Not set. Without GITHUB_TOKEN, GitHub allows 60 requests an hour."}</dd>
            <dt>Version</dt>
            <dd className="mono">{settings.version}</dd>
          </dl>
        ) : error ? (
          <EmptyState>{`Couldn't load the settings. ${error}`}</EmptyState>
        ) : (
          <SkeletonRows count={4} label="Loading the settings" />
        )}
      </section>

      <section className="page-section" aria-labelledby="settings-theme">
        <h2 className="section-label" id="settings-theme">
          Theme
        </h2>
        <div className="segmented theme-choice" role="radiogroup" aria-labelledby="settings-theme">
          {(["system", "dark", "light"] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => onTheme(t)}>
              {t === "system" ? "Same as the system" : t === "dark" ? "Dark" : "Light"}
            </button>
          ))}
        </div>
        <p className="field-help">Saved in this browser only.</p>
      </section>

      <section className="page-section" aria-labelledby="settings-help">
        <h2 className="section-label" id="settings-help">
          Help
        </h2>
        <ul className="link-list">
          <li>
            <button type="button" className="button secondary" onClick={onKeys}>
              Keyboard map <kbd>?</kbd>
            </button>
          </li>
          <li>
            <a href={`${DOCS}#readme`} target="_blank" rel="noreferrer">
              README
            </a>
          </li>
          <li>
            <a href={`${DOCS}/blob/main/docs/ui.md`} target="_blank" rel="noreferrer">
              The local app (docs/ui.md)
            </a>
          </li>
          <li>
            <a href={`${DOCS}/blob/main/docs/note-schema.md`} target="_blank" rel="noreferrer">
              The note format (docs/note-schema.md)
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
