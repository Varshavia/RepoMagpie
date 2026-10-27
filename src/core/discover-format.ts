// How Discover writes its numbers and ages (decision 0045), for the terminal and the app alike. Pure;
// no imports, so the app's bundle can load it.

// A count as people read it on GitHub: 950, 1.2k, 98.1k, 1.2M. One decimal below 100k or 100M, none
// above; a trailing ".0" is dropped.
export function compactCount(n: number): string {
  if (!Number.isFinite(n) || n < 1000) return String(Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));
  const [value, unit] = n < 1_000_000 ? [n / 1000, "k"] : [n / 1_000_000, "M"];
  const text = value < 100 ? (Math.floor(value * 10) / 10).toFixed(1) : String(Math.floor(value));
  return `${text.replace(/\.0$/, "")}${unit}`;
}

// How long ago a day was, from today (both YYYY-MM-DD, or an ISO time whose date is taken): "today",
// "yesterday", "5 days ago", "3 weeks ago", "4 months ago", "2 years ago". A date after today reads
// "today". Null when the date can't be read.
export function ageText(date: string, today: string): string | null {
  const day = (text: string) => Date.parse(`${text.slice(0, 10)}T00:00:00Z`);
  const from = day(date);
  const to = day(today);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  const days = Math.max(0, Math.round((to - from) / 86_400_000));
  const ago = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"} ago`;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return ago(days, "day");
  if (days < 60) return ago(Math.floor(days / 7), "week");
  if (days < 730) return ago(Math.floor(days / 30.44), "month");
  return ago(Math.floor((days + 1) / 365.25), "year"); // + 1: two calendar years of 365 days are 2 years
}

// Text on one line of at most `max` characters: whitespace and line breaks become single spaces, and
// longer text is cut at a word (or mid-word, when the last space is in the first half) with "…".
export function oneLine(text: string, max = 100): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  const space = line[max - 1] === " " ? cut.length : cut.lastIndexOf(" "); // a cut that ends a word keeps it
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// What a journal's note on a result says, for the line under it: the Verdict, or "What it does" when
// there is no Verdict, named and on one line; or that the note waits in the inbox.
export function journalSummary(entry: { verdict: string | null; what_it_does: string | null }, max = 100): string {
  if (entry.verdict) return `Verdict: ${oneLine(entry.verdict, max)}`;
  if (entry.what_it_does) return `What it does: ${oneLine(entry.what_it_does, max)}`;
  return "in the inbox, no Verdict yet";
}

// A licence for people: the SPDX id, "no licence" when GitHub found none, "licence unknown" for a
// licence file GitHub couldn't name (decision 0020's word).
export function licenceText(license: string): string {
  return license === "none" ? "no licence" : license === "unknown" ? "licence unknown" : license;
}
