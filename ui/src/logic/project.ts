// The Project view's words for the repository (docs/ui.md §7): the button that turns shared notes
// on, and the identity line. RepoMagpie never creates a project: the repository exists, and shared
// notes are a .magpie/ folder in it.
import type { Repository } from "../../../src/core/repository.ts";

// "for owner/repo" with a remote; "for this repository" without one, or before git has answered.
export function turnOnLabel(repository: Repository | null): string {
  return `Turn on shared notes for ${repository?.host ? repository.name : "this repository"}`;
}

// After the name: the host, or that there is no remote.
export const hostLabel = (repository: Repository) => repository.host ?? "no remote";
