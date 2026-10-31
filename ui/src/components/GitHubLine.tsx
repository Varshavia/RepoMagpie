// The GitHub connection on Discover and Import (decision 0053): where the token comes from, or, without
// one, how to connect. The words are core's, as repomagpie doctor prints them; never the token.
import { useId, useState } from "react";
import { CONNECT_STEPS, connectionText, type GitHubSource } from "../../../src/core/github-connection.ts";
import "./GitHubLine.css";

// `source` is undefined until the settings arrive: nothing is shown rather than a wrong state.
export function GitHubLine({ source }: { source: GitHubSource | null | undefined }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (source === undefined) return null;
  return (
    <div className="github-line">
      <p className="field-help">
        {connectionText(source)}
        {source ? null : (
          <>
            {" "}
            <button type="button" className="link-button" aria-expanded={open} aria-controls={`${id}-connect`} onClick={() => setOpen((o) => !o)}>
              How to connect
            </button>
          </>
        )}
      </p>
      {!source && open ? (
        <ol className="field-help github-connect" id={`${id}-connect`}>
          {CONNECT_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
