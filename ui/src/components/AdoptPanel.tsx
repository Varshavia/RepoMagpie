// Copy to this project (magpie adopt): the confirm, then the install command. Shown only after the
// note view's "Copy to this project", so it loads with the other later parts (docs/ui.md §10).
// It copies the note into the project journal and names the install command; it never installs anything.
import { useState } from "react";
import { api, type ApiError, type AdoptJson, type Scope } from "../api.ts";
import { Icon } from "../icons.tsx";
import { FieldError } from "./common.tsx";
import { SharedNotesSentence } from "./ProjectHeader.tsx";

export interface AdoptPanelProps {
  id: string; // the personal note's PURL
  name: string;
  avoid: boolean; // its Verdict says to avoid the package: no install command
  start: boolean; // the project has no journal yet: the confirm starts it, then copies
  onAdopted: (started: boolean) => void;
  onOpenNote: (journal: Scope, id: string) => void;
  onToast: (text: string) => void;
  onActionError: (text: string) => void;
  onClose: () => void;
}

type Step = { step: "confirm"; busy: boolean; error: string | null } | { step: "done"; doc: AdoptJson };

export function AdoptPanel({ id, name, avoid, start, onAdopted, onOpenNote, onToast, onActionError, onClose }: AdoptPanelProps) {
  const [state, setState] = useState<Step>({ step: "confirm", busy: false, error: null });

  // Only after the confirm, which says who can read the project journal. Starting it again is
  // harmless (created: false), so a failed copy can be retried as is.
  async function adopt() {
    setState({ step: "confirm", busy: true, error: null });
    try {
      if (start) await api.startProject();
      const doc = await api.adopt(id);
      setState({ step: "done", doc });
      onAdopted(start);
    } catch (error) {
      setState({ step: "confirm", busy: false, error: (error as ApiError).message });
    }
  }

  async function copyInstall(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      onToast("Install command copied");
    } catch {
      onActionError("Couldn't copy the command. Select it and copy it yourself.");
    }
  }

  if (state.step === "confirm") {
    return (
      <div className="adopt-panel" role="group" aria-label="Copy to this project">
        {start ? (
          <p>
            <SharedNotesSentence />
          </p>
        ) : null}
        <p>
          {start ? "Turn them on, then copy this note into them" : "Copy this note into the project journal"}, with today's date as <code translate="no">adopted</code>. RepoMagpie names the install command; it installs nothing.
        </p>
        <p>The project journal is committed with the code; anyone who can read this repository can read this note.</p>
        {state.error ? <FieldError>{state.error}</FieldError> : null}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={adopt} disabled={state.busy}>
            {state.busy ? "Copying…" : start ? "Turn on shared notes and copy" : "Copy to the project journal"}
          </button>
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  const { doc } = state;
  return (
    <div className="adopt-panel" role="group" aria-label="Adopted">
      <p>Copied to the project journal.</p>
      {avoid ? (
        <p className="field-help">{`Your note says to avoid ${name}; no install command.`}</p>
      ) : doc.install || doc.install_choices.length ? (
        <>
          {doc.install_choices.length ? <p>{`This repository publishes ${doc.install_choices.length} packages; install the one you need:`}</p> : null}
          {(doc.install ? [doc.install] : doc.install_choices).map((command) => (
            <p className="install-line" key={command}>
              <code translate="no">{command}</code>
              <button type="button" className="button ghost icon-button" onClick={() => copyInstall(command)} aria-label={`Copy ${command}`} title="Copy the install command">
                <Icon name="copy" />
              </button>
            </p>
          ))}
          <p className="field-help">Run it yourself when you are ready; RepoMagpie never installs anything.</p>
        </>
      ) : (
        <p className="field-help">No install command for a GitHub repository.</p>
      )}
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={() => doc.id && onOpenNote("project", doc.id)}>
          Open the project's note
        </button>
        <button type="button" className="button ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
