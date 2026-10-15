// zod, which the MCP SDK uses for its protocol messages, compiles fast object parsers with
// `new Function` unless its `jitless` option is on (zod's z.config({ jitless: true }), kept in this
// global so every copy of zod shares it). It is read when a schema is created, so this module is
// imported before the SDK: the server then generates no code at all. Imported first by cli/mcp.ts.
const shared = globalThis as { __zod_globalConfig?: Record<string, unknown> };
shared.__zod_globalConfig = { ...shared.__zod_globalConfig, jitless: true };
