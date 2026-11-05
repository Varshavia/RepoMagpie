// The Project view's repository (docs/ui.md §7): which repository the shared notes belong to, whether
// they are committed and pushed, and, before there are any, the button that turns them on. In the
// later chunk: only the Project view shows them.
import type { ProjectInfoJson } from "../api.ts";
import { hostLabel, pullFirstLine, turnOnLabel } from "../logic/project.ts";
import { visible } from "../logic/text.ts";
import { EmptyState } from "./common.tsx";

// The repository's name, linked to its web page when there is one, its host, and the sharing line.
export function RepositoryLine({ info }: { info: ProjectInfoJson | null }) {
  const repository = info?.repository;
  if (!repository) return null;
  const name = visible(repository.name);
  return (
    <div className="repository" aria-label="Repository">
      <p className="repository-name">
        {repository.url ? (
          <a href={repository.url} target="_blank" rel="noopener noreferrer">
            {name}
          </a>
        ) : (
          <span>{name}</span>
        )}
        <span className="repository-host">{visible(hostLabel(repository))}</span>
      </p>
      {info.sharing ? <p className="repository-sharing">{info.sharing}</p> : null}
    </div>
  );
}

// Also the confirm's first line when copying a note before shared notes are on (AdoptPanel).
export function SharedNotesSentence() {
  return (
    <>
      This repository has no shared notes yet. Shared notes live in <code translate="no">.magpie/</code> inside the repository, so once you commit and push it, everyone who clones it, and their agents, sees them.
    </>
  );
}

export function SharedNotesOff({ info, onTurnOn }: { info: ProjectInfoJson | null; onTurnOn: () => void }) {
  const pullFirst = pullFirstLine(info);
  return (
    <EmptyState
      action={
        <button type="button" className="button primary" onClick={onTurnOn}>
          {visible(turnOnLabel(info?.repository ?? null))}
        </button>
      }
    >
      <SharedNotesSentence />
      {pullFirst ? ` ${pullFirst}` : null}
    </EmptyState>
  );
}
