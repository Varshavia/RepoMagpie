// Domains (decision 0040, RFC 0001 §4): the concerns a note's package addresses, from a fixed
// vocabulary shared by every journal, team and agent. `domains` holds the ones the user confirmed,
// `domains_suggested` the ones RepoMagpie suggested from topics and tags. Pure; no imports, so the
// hook could load it, though it never does.

// The vocabulary, in RFC order, each with the one line shown to users and agents. Versioned: a later
// release may add a domain, never rename or remove one without a migration.
export const DOMAINS = [
  { id: "architecture", definition: "Structure, patterns, state management and application frameworks." },
  { id: "security", definition: "Vulnerabilities, secrets, hardening and input validation." },
  { id: "performance", definition: "Speed, caching, bundle size and profiling." },
  { id: "styling", definition: "CSS, design systems and UI components." },
  { id: "database", definition: "Databases, ORMs, migrations and storage." },
  { id: "testing", definition: "Unit tests, end-to-end tests and mocking." },
  { id: "auth", definition: "Sign-in, sessions and permissions." },
  { id: "api", definition: "HTTP, RPC, API clients and servers." },
  { id: "devops", definition: "Build, deploy, CI and containers." },
  { id: "observability", definition: "Logging, metrics, tracing and error tracking." },
  { id: "ai", definition: "LLMs, agents, embeddings and MCP." },
  { id: "tooling", definition: "Developer tools, CLIs, linters, formatters, docs and editors." },
] as const;

export type Domain = (typeof DOMAINS)[number]["id"];
export const DOMAIN_IDS: readonly Domain[] = DOMAINS.map((d) => d.id);
export const DOMAIN_LIMIT = 3; // more than 3 means the note is a platform (RFC §4.1)

export function isDomain(value: unknown): value is Domain {
  return typeof value === "string" && (DOMAIN_IDS as readonly string[]).includes(value);
}

// Topics and tags that clearly name a concern, and the domain each names. Conservative: a word that
// names a technology without naming what it is for (react, supabase, rust) maps to nothing; one that
// could mean two concerns (validation, session, node) maps to nothing. Each row has a test.
export const DOMAIN_MAP: Readonly<Record<string, Domain>> = {
  // architecture
  "architecture": "architecture", "software-architecture": "architecture", "clean-architecture": "architecture",
  "design-patterns": "architecture", "state-management": "architecture", "microservices": "architecture",
  "domain-driven-design": "architecture", "ddd": "architecture", "event-sourcing": "architecture", "cqrs": "architecture",
  // security
  "security": "security", "cybersecurity": "security", "appsec": "security", "vulnerability": "security",
  "vulnerabilities": "security", "vulnerability-scanner": "security", "secrets": "security", "secret-management": "security",
  "encryption": "security", "cryptography": "security", "owasp": "security", "sast": "security",
  "supply-chain-security": "security", "input-validation": "security", "sanitization": "security",
  // performance
  "performance": "performance", "web-performance": "performance", "caching": "performance", "cache": "performance",
  "profiling": "performance", "profiler": "performance", "optimization": "performance", "benchmark": "performance",
  "benchmarks": "performance", "bundle-size": "performance", "image-optimization": "performance", "lighthouse": "performance",
  // styling
  "css": "styling", "css-framework": "styling", "tailwind": "styling", "tailwindcss": "styling", "sass": "styling",
  "scss": "styling", "css-in-js": "styling", "styled-components": "styling", "design-system": "styling",
  "design-systems": "styling", "ui-components": "styling", "component-library": "styling", "ui-library": "styling",
  "shadcn": "styling", "shadcn-ui": "styling", "design": "styling", "ui-design": "styling", "web-design": "styling",
  "frontend-design": "styling", "ui-ux": "styling",
  // database
  "database": "database", "databases": "database", "db": "database", "orm": "database", "sql": "database",
  "nosql": "database", "postgres": "database", "postgresql": "database", "mysql": "database", "sqlite": "database",
  "mongodb": "database", "migrations": "database", "database-migrations": "database",
  "query-builder": "database", "vector-database": "database",
  // testing
  "testing": "testing", "test": "testing", "tests": "testing", "unit-testing": "testing", "test-automation": "testing",
  "testing-tools": "testing", "e2e": "testing", "e2e-testing": "testing", "end-to-end-testing": "testing",
  "integration-testing": "testing", "mocking": "testing", "mock": "testing", "test-runner": "testing",
  "jest": "testing", "vitest": "testing", "playwright": "testing", "cypress": "testing", "mocha": "testing",
  // auth
  "auth": "auth", "authentication": "auth", "authorization": "auth", "oauth": "auth", "oauth2": "auth",
  "openid-connect": "auth", "oidc": "auth", "sso": "auth", "jwt": "auth", "passkeys": "auth", "webauthn": "auth",
  "rbac": "auth", "permissions": "auth", "login": "auth",
  // api
  "api": "api", "rest": "api", "rest-api": "api", "restful": "api", "graphql": "api", "grpc": "api", "rpc": "api",
  "trpc": "api", "openapi": "api", "http-client": "api", "http-server": "api",
  "api-client": "api", "websocket": "api", "websockets": "api",
  // devops
  "devops": "devops", "containers": "devops", "kubernetes": "devops", "k8s": "devops",
  "ci": "devops", "ci-cd": "devops", "cicd": "devops", "continuous-integration": "devops", "continuous-delivery": "devops",
  "continuous-deployment": "devops", "deployment": "devops", "infrastructure": "devops",
  "github-actions": "devops", "terraform": "devops", "ansible": "devops", "infrastructure-as-code": "devops",
  "iac": "devops", "paas": "devops", "heroku": "devops", "build-tool": "devops",
  // observability
  "observability": "observability", "logging": "observability", "logger": "observability", "logs": "observability",
  "monitoring": "observability", "metrics": "observability", "tracing": "observability",
  "opentelemetry": "observability", "apm": "observability", "error-tracking": "observability",
  "error-monitoring": "observability", "uptime-monitoring": "observability", "status-page": "observability",
  // ai
  "ai": "ai", "artificial-intelligence": "ai", "llm": "ai", "llms": "ai", "large-language-models": "ai",
  "machine-learning": "ai", "ml": "ai", "deep-learning": "ai", "generative-ai": "ai", "genai": "ai",
  "ai-agents": "ai", "ai-agent": "ai", "agentic-ai": "ai", "mcp": "ai", "model-context-protocol": "ai",
  "embeddings": "ai", "rag": "ai", "openai": "ai", "chatgpt": "ai", "langchain": "ai", "ollama": "ai", "gpt": "ai",
  // tooling
  "cli": "tooling", "command-line": "tooling", "command-line-tool": "tooling", "developer-tools": "tooling",
  "devtools": "tooling", "dev-tools": "tooling", "linter": "tooling", "linting": "tooling", "eslint": "tooling",
  "formatter": "tooling", "code-formatter": "tooling", "prettier": "tooling", "vscode": "tooling",
  "vscode-extension": "tooling", "documentation-tool": "tooling",
};

// The word alone says a project touches AI, not that AI is what it's for: supabase has the topic "ai".
const GENERIC = new Set(["ai", "artificial-intelligence"]);
// Playwright drives browsers for tests and for automation: on a note about automation or scraping,
// it doesn't name testing. Scraping itself names no domain: none of the 12 is that concern.
const AUTOMATION = new Set([
  "browser-automation", "web-automation", "rpa", "robotic-process-automation", "crawler", "crawling", "web-crawler",
  "web-crawling", "scraper", "scraping", "web-scraper", "web-scraping", "webscraping", "data-extraction",
]);

// The domains a note's topics and tags suggest, at most DOMAIN_LIMIT, the best supported first: a
// domain named by more of the note's words comes before one named by fewer; on a tie, the one named
// first, tags before topics. A generic word ("ai") makes a domain a candidate but doesn't support it,
// and a domain named only by generic words is dropped when the note has another. Never includes a
// domain the note already has confirmed. `aliases` maps a spelling to its canonical tag, so
// "postgres" maps as "postgresql".
export function suggestDomains(note: { tags?: unknown; topics?: unknown; domains?: unknown }, aliases?: ReadonlyMap<string, string>): Domain[] {
  const texts = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  const confirmed = texts(note.domains);
  const words = new Set<string>();
  for (const raw of [...texts(note.tags), ...texts(note.topics)]) {
    const value = raw.toLowerCase();
    words.add(DOMAIN_MAP[value] ? value : (aliases?.get(value) ?? value));
  }
  const automation = [...words].some((word) => AUTOMATION.has(word));
  const support = new Map<Domain, number>(); // in the order first named
  for (const word of words) {
    const domain = DOMAIN_MAP[word];
    if (!domain || confirmed.includes(domain) || (word === "playwright" && automation)) continue;
    support.set(domain, (support.get(domain) ?? 0) + (GENERIC.has(word) ? 0 : 1));
  }
  for (const [domain, count] of support) if (count === 0 && support.size > 1) support.delete(domain);
  return [...support].sort((a, b) => b[1] - a[1]).slice(0, DOMAIN_LIMIT).map(([domain]) => domain);
}

// Why a list of domains given by the user (repomagpie note --domain, the MCP note tool, the app) can't
// be written, or null: each must be in the vocabulary, and there are at most DOMAIN_LIMIT.
export function domainsProblem(label: string, value: unknown): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || !value.every((d) => typeof d === "string")) return `${label} takes a list of domains.`;
  const bad = value.find((d) => !isDomain(d));
  if (bad !== undefined) return `${label} takes one of: ${DOMAIN_IDS.join(", ")}. Not a domain: ${JSON.stringify(bad.slice(0, 64))}.`;
  if (new Set(value).size > DOMAIN_LIMIT) return `${label} takes at most ${DOMAIN_LIMIT} domains; a note with more is a platform.`;
  return null;
}

// A note's two domain fields as written, each a list of text (anything else reads as empty), split
// into the known values and the unknown ones (kept in the file, reported by doctor).
export interface NoteDomains {
  domains: Domain[];
  suggested: Domain[]; // without the confirmed ones
  unknown: string[];
}

export function noteDomains(frontmatter: Record<string, unknown>): NoteDomains {
  const texts = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  const domains = [...new Set(texts(frontmatter.domains).filter(isDomain))];
  const suggested = [...new Set(texts(frontmatter.domains_suggested).filter(isDomain))].filter((d) => !domains.includes(d));
  const unknown = [...new Set([...texts(frontmatter.domains), ...texts(frontmatter.domains_suggested)].filter((d) => !isDomain(d)))];
  return { domains, suggested, unknown };
}
