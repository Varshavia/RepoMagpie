// What RepoMagpie says about its GitHub connection (decision 0053), on Discover, Import, Settings and
// in repomagpie doctor. Pure, no imports, so the app shows the same words. Never the token itself.

// Where the token came from: an environment variable, or the GitHub CLI's login. null: none.
export type GitHubSource = "GITHUB_TOKEN" | "GH_TOKEN" | "gh";

export function connectionText(source: GitHubSource | null): string {
  if (source === "gh") return "GitHub: using your GitHub CLI login";
  if (source) return `GitHub: using ${source}`;
  return "GitHub: not connected, limited to 10 searches a minute.";
}

// How to connect, one step each.
export const CONNECT_STEPS: readonly string[] = [
  "Install the GitHub CLI (cli.github.com) and run gh auth login.",
  "Or set GITHUB_TOKEN to a token before you start RepoMagpie.",
  "Then start repomagpie ui again: it reads the token once, when it starts, and keeps it in memory only.",
];

// A search that left topics out without a token: "Searched 2 of 3 security topics to stay within
// GitHub's limit. Connect GitHub to search all." Named by the domain, else the kind. The app finds
// this warning among the others by building it again from the same document.
export function partialSearchWarning(query: { domain: string | null; kind: string | null }, partial: { searched: string[]; left_out: string[] }): string {
  const of = partial.searched.length + partial.left_out.length;
  return `Searched ${partial.searched.length} of ${of} ${query.domain ?? query.kind} topics to stay within GitHub's limit. Connect GitHub to search all.`;
}
