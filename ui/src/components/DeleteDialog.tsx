// "Delete note" (decision 0037, docs/ui.md §7): a dry run says where the note goes and which notes
// link to it; "Move to trash" moves it, with the version the note was read with. Cancel is the
// default; Esc cancels. Modal: the app makes what is behind it inert (the note pane's onModal), so
// it is drawn on document.body. A changed note (409) closes it; the note view shows the conflict banner.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiError, type Address, type DeleteJson, type Scope } from "../api.ts";
import { backlinkGroups, noteHash } from "../logic/links.ts";
import { readablePurl } from "../logic/schema.ts";
import { homePath, visible } from "../logic/text.ts";
import { FieldError, plainClick } from "./common.tsx";

export interface DeleteDialogProps {
  journal: Scope;
  address: Address;
  version: string;
  name: string; // as shown, markers in place
  home: string | null;
  onCancel: () => void;
  onDeleted: (doc: DeleteJson) => void;
  onConflict: () => void;
  onOpenNote: (journal: Scope, id: string) => void;
}

type State = { step: "checking" } | { step: "ready" | "moving"; plan: DeleteJson; error: string | null } | { step: "failed"; error: string };

export function DeleteDialog({ journal, address, version, name, home, onCancel, onDeleted, onConflict, onOpenNote }: DeleteDialogProps) {
  const [state, setState] = useState<State>({ step: "checking" });
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => before?.focus();
  }, []);

  useEffect(() => {
    let current = true;
    api.deleteNote(journal, address, version, true).then(
      (plan) => current && setState({ step: "ready", plan, error: null }),
      (error: ApiError) => {
        if (!current) return;
        if (error.status === 409) onConflict();
        else setState({ step: "failed", error: error.message });
      },
    );
    return () => {
      current = false;
    };
  }, []);

  async function move() {
    if (state.step !== "ready") return;
    setState({ ...state, step: "moving" });
    try {
      // The version the dry run checked: a live update behind the dialog never changes what moves.
      onDeleted(await api.deleteNote(journal, address, state.plan.version ?? version, false));
    } catch (error) {
      const e = error as ApiError;
      if (e.status === 409) onConflict();
      else setState({ step: "ready", plan: state.plan, error: e.message });
    }
  }

  const plan = state.step === "ready" || state.step === "moving" ? state.plan : null;
  const folder = plan?.trash ? homePath(plan.trash.replace(/[\\/][^\\/]*$/, ""), home) : null;
  const linked = plan ? backlinkGroups(plan.backlinks) : [];
  const where = journal === "personal" ? "your personal journal" : "the project journal";

  return createPortal(
    <div
      className="scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      onKeyDown={(e) => {
        // The app's keys stay with the dialog: j, k or g g would change the note behind it.
        e.stopPropagation();
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="dialog delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-body">
        <div className="dialog-head">
          <h2 className="pane-title" id="delete-title" translate="no">
            {`Move ${name} to the trash?`}
          </h2>
        </div>
        <div className="dialog-body" id="delete-body">
          {state.step === "checking" ? (
            <p role="status">Checking which notes link to it…</p>
          ) : state.step === "failed" ? (
            <FieldError>{state.error}</FieldError>
          ) : (
            <>
              <p>
                {`It moves from ${where} to its trash folder, `}
                <span className="mono" translate="no">
                  {visible(folder ?? "")}
                </span>
                . Nothing empties the trash on its own; delete the file there to remove it for good.
              </p>
              {linked.length ? (
                <>
                  <p>{`${linked.length} ${linked.length === 1 ? "note links" : "notes link"} to it. Those links will show as unresolved; the notes stay as they are.`}</p>
                  <ul className="backlinks">
                    {linked.map((g) => (
                      <li key={g.id}>
                        <a
                          className="wikilink"
                          href={noteHash(journal, g.id)}
                          onClick={(e) => {
                            if (!plainClick(e)) return;
                            e.preventDefault();
                            onCancel();
                            onOpenNote(journal, g.id);
                          }}
                        >
                          <span translate="no">{visible(g.name ?? readablePurl(g.id))}</span>
                        </a>
                        <span className="backlink-places">{visible(g.places.join(", "))}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {state.error ? <FieldError>{state.error}</FieldError> : null}
            </>
          )}
        </div>
        <div className="form-actions dialog-actions">
          <button type="button" className="button danger" onClick={move} disabled={state.step !== "ready"}>
            {state.step === "moving" ? "Moving…" : "Move to trash"}
          </button>
          <button ref={cancel} type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
