// Domains (decision 0040, RFC 0001 §4): the concerns a note's package addresses, from a fixed
// vocabulary shared by every journal, team and agent. `domains` holds the ones the user confirmed,
// `domains_suggested` the ones RepoMagpie suggested from topics and tags. Pure; no imports, so the
// hook could load it, though it never does.

// The vocabulary, in RFC order, then the ones added later, each with the one line shown to users and
// agents. Versioned: a later release may add a domain, never rename or remove one without a migration.
export const DOMAINS = [
  { id: "architecture", definition: "Structure, patterns, state management and application frameworks." },
  { id: "security", definition: "Vulnerabilities, secrets, hardening and input validation." },
  { id: "performance", definition: "Speed, caching, bundle size and profiling." },
  { id: "frontend", definition: "UI frameworks, components, CSS and design systems." },
  { id: "database", definition: "Databases, ORMs, migrations and storage." },
  { id: "testing", definition: "Unit tests, end-to-end tests and mocking." },
  { id: "auth", definition: "Sign-in, sessions and permissions." },
  { id: "api", definition: "HTTP, RPC, API clients and servers." },
  { id: "devops", definition: "Build, deploy, CI and containers." },
  { id: "observability", definition: "Logging, metrics, tracing and error tracking." },
  { id: "ai", definition: "LLMs, agents, embeddings and MCP." },
  { id: "tooling", definition: "Developer tools, CLIs, linters, formatters and editors." },
  { id: "mobile", definition: "Android, iOS and cross-platform mobile apps." },
  { id: "data", definition: "Analytics, data visualization and ETL pipelines." },
  { id: "docs", definition: "Documentation sites, generators and API references." },
  { id: "payments", definition: "Payments, checkout and billing." },
] as const;

export type Domain = (typeof DOMAINS)[number]["id"];
export const DOMAIN_IDS: readonly Domain[] = DOMAINS.map((d) => d.id);
export const DOMAIN_LIMIT = 3; // more than 3 means the note is a platform (RFC §4.1)

// Old names (decision 0055): read as the domain they became, in notes, flags, API requests and
// links, and written as the new name whenever RepoMagpie writes a note's domains.
export const DOMAIN_ALIASES: Readonly<Record<string, Domain>> = { styling: "frontend" };

export function isDomain(value: unknown): value is Domain {
  return typeof value === "string" && (DOMAIN_IDS as readonly string[]).includes(value);
}

// A domain or an old name for one, as the domain; null for anything else.
export function canonicalDomain(value: unknown): Domain | null {
  if (isDomain(value)) return value;
  return typeof value === "string" && Object.hasOwn(DOMAIN_ALIASES, value) ? DOMAIN_ALIASES[value] : null;
}

// Topics and tags that clearly name a concern, and the domain each names. Conservative: a word that
// names a technology without naming what it is for (supabase, rust) maps to nothing; one that
// could mean two concerns (validation, session, node, profiling) maps to nothing. Each row has a test.
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
  "profiler": "performance", "optimization": "performance", "benchmark": "performance",
  "benchmarks": "performance", "bundle-size": "performance", "image-optimization": "performance", "lighthouse": "performance",
  // frontend (styling before decision 0055); react and vue name what a project is for here, unlike
  // most technology names
  "frontend": "frontend", "react": "frontend", "vue": "frontend", "ui": "frontend",
  "css": "frontend", "css-framework": "frontend", "tailwind": "frontend", "tailwindcss": "frontend", "sass": "frontend",
  "scss": "frontend", "css-in-js": "frontend", "styled-components": "frontend", "design-system": "frontend",
  "design-systems": "frontend", "ui-components": "frontend", "component-library": "frontend", "ui-library": "frontend",
  "shadcn": "frontend", "shadcn-ui": "frontend", "design": "frontend", "ui-design": "frontend", "web-design": "frontend",
  "frontend-design": "frontend", "ui-ux": "frontend",
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
  "iac": "devops", "paas": "devops", "heroku": "devops", "build-tool": "devops", "docker": "devops",
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
  "vscode-extension": "tooling",
  // mobile
  "mobile": "mobile", "mobile-app": "mobile", "mobile-development": "mobile", "android": "mobile", "ios": "mobile",
  "react-native": "mobile", "flutter": "mobile", "swiftui": "mobile", "jetpack-compose": "mobile",
  // data: analytics, visualization and ETL; databases stay in database
  "data-science": "data", "data-engineering": "data", "data-analysis": "data", "data-visualization": "data",
  "dataviz": "data", "analytics": "data", "etl": "data", "data-pipeline": "data", "pandas": "data",
  "dataframe": "data", "business-intelligence": "data",
  // docs
  "documentation": "docs", "docs": "docs", "documentation-tool": "docs", "documentation-generator": "docs",
  "api-documentation": "docs", "technical-writing": "docs",
  // payments
  "payments": "payments", "payment": "payments", "payment-gateway": "payments", "payment-processing": "payments",
  "stripe": "payments", "billing": "payments",
};

// The word alone says a project touches AI, not that AI is what it's for: supabase has the topic "ai".
const GENERIC = new Set(["ai", "artificial-intelligence"]);
// Playwright drives browsers for tests and for automation: on a note about automation or scraping,
// it doesn't name testing. Scraping itself names no domain: none of the domains is that concern.
const AUTOMATION = new Set([
  "browser-automation", "web-automation", "rpa", "robotic-process-automation", "crawler", "crawling", "web-crawler",
  "web-crawling", "scraper", "scraping", "web-scraper", "web-scraping", "webscraping", "data-extraction",
]);

// Phrases in a README that name a concern without doubt (decision 0046), matched as whole words,
// ignoring case, a space or a hyphen alike. Each is half a vote, counted once per README. Narrow on
// purpose: a README names many things a project isn't for ("run the unit tests", "deploy with
// Docker"). Measured with npm run eval:classification, phrases that READMEs use for what a project
// works with or offers on the side were taken out: "AI agents", "MCP server", "model context
// protocol", "REST API", "GraphQL API", "OpenAPI", "observability", "developer tools", "VS Code
// extension", "two-factor authentication", "bundle size".
export const README_TERMS: Readonly<Record<Domain, readonly string[]>> = {
  architecture: ["clean architecture", "hexagonal architecture", "domain-driven design", "event sourcing", "state management"],
  security: ["vulnerability scanner", "security scanner", "penetration testing", "secret scanning", "leaked credentials", "supply chain security"],
  performance: ["web performance", "core web vitals", "performance profiler"],
  frontend: ["design system", "design systems", "design tokens", "component library", "ui components", "css framework", "utility-first css"],
  database: ["row level security", "relational database", "vector database", "query builder", "database migrations", "sql database", "ORM"],
  testing: ["end-to-end tests", "end-to-end testing", "e2e tests", "e2e testing", "test runner", "testing framework", "unit testing", "api mocking"],
  auth: ["single sign-on", "openid connect", "multi-factor authentication", "passkeys", "identity and access management", "role-based access control"],
  api: ["http client", "api client", "rpc framework"],
  devops: ["continuous integration", "continuous deployment", "continuous delivery", "ci/cd", "infrastructure as code", "github action", "helm chart"],
  observability: ["distributed tracing", "error tracking", "log management", "opentelemetry", "uptime monitoring", "performance monitoring"],
  ai: ["large language model", "large language models", "llm", "llms", "retrieval-augmented generation"],
  tooling: ["command-line tool", "linter", "code formatter"],
  // None yet for the domains of decision 0055: a phrase is added only once npm run eval:classification
  // shows it helps.
  mobile: [],
  data: [],
  docs: [],
  payments: [],
};

const TERM_PATTERNS: [Domain, RegExp][] = Object.entries(README_TERMS).flatMap(([domain, terms]) =>
  terms.map((term): [Domain, RegExp] => {
    const body = term.split(/[\s-]+/).map((part) => part.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("[\\s-]+");
    return [domain as Domain, new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu")];
  }),
);

// The README terms each domain has in a text: how many of its terms appear, each once.
export function readmeTerms(readme: string): Map<Domain, number> {
  const counts = new Map<Domain, number>();
  for (const [domain, pattern] of TERM_PATTERNS) if (pattern.test(readme)) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  return counts;
}

// The domains a note's topics and tags suggest, at most DOMAIN_LIMIT, the best supported first: a
// domain named by more of the note's words comes before one named by fewer; on a tie, the one named
// first, tags before topics. A generic word ("ai") makes a domain a candidate but doesn't support it,
// and a domain named only by generic words is dropped when the note has another. Never includes a
// domain the note already has confirmed. `aliases` maps a spelling to its canonical tag, so
// "postgres" maps as "postgresql".
//
// When a note is created from GitHub (decision 0046), a manifest keyword counts as a topic. A README
// term and a hint (a GitHub Action's `devops`) are half a vote each; a domain with no full vote
// needs two halves.
export function suggestDomains(
  note: { tags?: unknown; topics?: unknown; domains?: unknown; keywords?: unknown; readme?: unknown; hints?: readonly Domain[] },
  aliases?: ReadonlyMap<string, string>,
): Domain[] {
  const texts = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  const confirmed: readonly string[] = canonicalDomains(texts(note.domains));
  const words = new Set<string>();
  for (const raw of [...texts(note.tags), ...texts(note.topics), ...texts(note.keywords)]) {
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
  const halves = typeof note.readme === "string" ? readmeTerms(note.readme) : new Map<Domain, number>();
  for (const domain of note.hints ?? []) halves.set(domain, (halves.get(domain) ?? 0) + 1);
  for (const [domain, count] of halves) {
    if (confirmed.includes(domain) || (!support.has(domain) && count < 2)) continue;
    support.set(domain, (support.get(domain) ?? 0) + count / 2);
  }
  for (const [domain, count] of support) if (count === 0 && support.size > 1) support.delete(domain);
  return [...support].sort((a, b) => b[1] - a[1]).slice(0, DOMAIN_LIMIT).map(([domain]) => domain);
}

// Why a list of domains given by the user (repomagpie note --domain, the MCP note tool, the app) can't
// be written, or null: each must be in the vocabulary (an old name counts), and there are at most
// DOMAIN_LIMIT.
export function domainsProblem(label: string, value: unknown): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || !value.every((d) => typeof d === "string")) return `${label} takes a list of domains.`;
  const bad = value.find((d) => !canonicalDomain(d));
  if (bad !== undefined) return `${label} takes one of: ${DOMAIN_IDS.join(", ")}. Not a domain: ${JSON.stringify(bad.slice(0, 64))}.`;
  if (canonicalDomains(value).length > DOMAIN_LIMIT) return `${label} takes at most ${DOMAIN_LIMIT} domains; a note with more is a platform.`;
  return null;
}

// The known domains of a list, old names as their new ones, each once, in order.
export function canonicalDomains(values: readonly unknown[]): Domain[] {
  return [...new Set(values.map(canonicalDomain).filter((d): d is Domain => d !== null))];
}

// A note's two domain fields as written, each a list of text (anything else reads as empty), split
// into the known values (an old name read as its new one) and the unknown ones (kept in the file,
// reported by doctor).
export interface NoteDomains {
  domains: Domain[];
  suggested: Domain[]; // without the confirmed ones
  unknown: string[];
}

export function noteDomains(frontmatter: Record<string, unknown>): NoteDomains {
  const texts = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  const domains = canonicalDomains(texts(frontmatter.domains));
  const suggested = canonicalDomains(texts(frontmatter.domains_suggested)).filter((d) => !domains.includes(d));
  const unknown = [...new Set([...texts(frontmatter.domains), ...texts(frontmatter.domains_suggested)].filter((d) => !canonicalDomain(d)))];
  return { domains, suggested, unknown };
}
