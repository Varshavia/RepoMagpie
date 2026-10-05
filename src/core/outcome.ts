// How a command or an API request ended. The CLI turns it into an exit code (spec §1); the local
// app's server turns it into an HTTP status (docs/ui.md §6).
export type Outcome = "ok" | "usage" | "failed" | "not-found" | "conflict";

export function exitCode(outcome: Outcome): number {
  return outcome === "ok" ? 0 : outcome === "usage" ? 2 : 1;
}
