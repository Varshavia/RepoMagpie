// Identity of a note's subject: inputs to Package URLs (PURLs) and PURLs to file names.
// Spec sections 4 and 5, note schema "File location and name", decision 0017.
import { PackageURL } from "packageurl-js";

export type PackageType = "npm" | "pypi" | "cargo";
export type Manifest = "package.json" | "pyproject.toml" | "Cargo.toml";

export type Resolution =
  | { kind: "ok"; purl: string; skillPath?: string }
  | { kind: "ambiguous"; candidates: PackageType[] } // a bare name that needs --type or a prompt
  | { kind: "rejected"; reason: string };

// The package type each manifest implies.
const MANIFEST_TYPES: Record<Manifest, PackageType> = {
  "package.json": "npm",
  "pyproject.toml": "pypi",
  "Cargo.toml": "cargo",
};

// PURL types v0.1 supports.
const SUPPORTED_TYPES = new Set(["github", "npm", "pypi", "cargo"]);

const UNSUPPORTED =
  "Not a supported input. v0.1 takes a GitHub repository or skill URL, an npm, PyPI or crates.io package URL, a PURL, or a package name.";

// Resolves what the user typed to a PURL without a version.
// `manifests` are the manifest files found nearest to the working directory; the caller finds them.
export function resolveTarget(input: string, options: { manifests?: Manifest[]; type?: PackageType } = {}): Resolution {
  const text = input.trim();
  if (text.startsWith("pkg:")) return fromPurl(text);
  if (/^https?:\/\//i.test(text)) return fromUrl(text);
  if (!/^(@[^\s/@]+\/)?[^\s/@][^\s/]*$/.test(text)) return { kind: "rejected", reason: UNSUPPORTED };

  const candidates = [...new Set((options.manifests ?? []).map((m) => MANIFEST_TYPES[m]))];
  const type = options.type ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (!type) return { kind: "ambiguous", candidates };
  const name = normalizePackage(text, type);
  return name ? { kind: "ok", purl: packagePurl(type, name) } : { kind: "rejected", reason: UNSUPPORTED };
}

// Drops the version and extras from a package as written in an install command (spec section 5).
export function normalizePackage(spec: string, type: PackageType): string {
  const text = spec.trim();
  if (type === "pypi") return text.match(/^[A-Za-z0-9._-]+/)?.[0] ?? "";
  const at = text.indexOf("@", text.startsWith("@") ? 1 : 0); // npm scopes start with "@"
  return at === -1 ? text : text.slice(0, at);
}

// The note's file name: type, namespace without a leading "@", and name, joined with "--" (note schema).
export function fileNameFor(purl: string): string {
  const p = PackageURL.fromString(purl);
  const parts = [p.type, p.namespace?.replace(/^@/, ""), p.name].filter((part) => part);
  return `${parts.join("--").toLowerCase().replace(/[^a-z0-9._-]/g, "-")}.md`;
}

// Cargo names are case-sensitive (npm and PyPI PURLs are lowercased), but file names are lowercase, so two subjects can map
// to one file. v0.1 rejects the second: returns an error message, or null when there is no clash.
// `existing` is the id of the note already at that file name, if any.
export function fileNameClash(purl: string, existing: string | undefined): string | null {
  if (existing === undefined || existing === purl) return null;
  return `${purl} and ${existing} map to the same file, ${fileNameFor(purl)}. v0.1 can't keep notes for both; edit the existing note instead.`;
}

function packagePurl(type: PackageType, name: string): string {
  const slash = type === "npm" && name.startsWith("@") ? name.indexOf("/") : -1;
  const namespace = slash === -1 ? undefined : name.slice(0, slash);
  return new PackageURL(type, namespace, slash === -1 ? name : name.slice(slash + 1), undefined, undefined, undefined).toString();
}

function fromPurl(text: string): Resolution {
  let p: PackageURL;
  try {
    p = PackageURL.fromString(text);
  } catch {
    return { kind: "rejected", reason: `Not a valid PURL: ${text}` };
  }
  if (!SUPPORTED_TYPES.has(p.type)) return { kind: "rejected", reason: UNSUPPORTED };
  return { kind: "ok", purl: new PackageURL(p.type, p.namespace, p.name, undefined, p.qualifiers, p.subpath).toString() };
}

function fromUrl(text: string): Resolution {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { kind: "rejected", reason: UNSUPPORTED };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter((part) => part).map(decodeURIComponent);

  if (host === "github.com" && parts.length >= 2) {
    const purl = new PackageURL("github", parts[0], parts[1].replace(/\.git$/, ""), undefined, undefined, undefined).toString();
    if (parts.length === 2) return { kind: "ok", purl };
    // A skill: .../tree/<ref>/<path> (a folder) or .../blob/<ref>/<path>/SKILL.md (the file).
    if ((parts[2] === "tree" || parts[2] === "blob") && parts.length >= 4) {
      const path = parts.slice(4);
      if (path.at(-1) === "SKILL.md") path.pop();
      return path.length ? { kind: "ok", purl, skillPath: path.join("/") } : { kind: "ok", purl };
    }
  }
  if (host === "npmjs.com" && parts[0] === "package" && parts[1]) {
    return { kind: "ok", purl: packagePurl("npm", parts[1].startsWith("@") ? `${parts[1]}/${parts[2] ?? ""}` : parts[1]) };
  }
  if (host === "pypi.org" && parts[0] === "project" && parts[1]) return { kind: "ok", purl: packagePurl("pypi", parts[1]) };
  if (host === "crates.io" && parts[0] === "crates" && parts[1]) return { kind: "ok", purl: packagePurl("cargo", parts[1]) };
  return { kind: "rejected", reason: UNSUPPORTED };
}
