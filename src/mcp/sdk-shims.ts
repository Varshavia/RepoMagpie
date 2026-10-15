// The MCP SDK's Node shims (`@modelcontextprotocol/server/_shims`), as the CLI's build bundles them
// (scripts/build-cli.ts aliases that import here). The SDK's own Node shim makes ajv the default JSON
// Schema validator, and ajv compiles schemas with `new Function`; here the default is the
// interpreting @cfworker/json-schema validator, which the server passes explicitly anyway
// (server.ts). Tests run on the source and get the SDK's shim; the explicit validator makes both the
// same.
export { CfWorkerJsonSchemaValidator as DefaultJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
export { default as process } from "node:process";
