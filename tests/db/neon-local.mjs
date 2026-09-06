// Points @neondatabase/serverless at a local proxy in front of a plain Postgres: the CI service pair of ci.yml
// (pgvector/pgvector:pg17 behind ghcr.io/timowilhelm/local-neon-http-proxy, which answers the SQL-over-HTTP
// endpoint at /sql and the WebSocket endpoint at /v1) and the same pair started locally with docker. Loaded
// through NODE_OPTIONS=--import so drizzle-kit, the seed script and the integration tests all see it; both module
// instances are configured, the ESM entry drizzle-kit imports and the CommonJS entry tsx-compiled modules require.
// Without NEON_LOCAL_PROXY it changes nothing, so it can never redirect a Neon connection.
import { createRequire } from "node:module";
import * as esm from "@neondatabase/serverless";

const proxy = process.env.NEON_LOCAL_PROXY;
if (proxy) {
  const cjs = createRequire(import.meta.url)("@neondatabase/serverless");
  for (const { neonConfig } of [esm, cjs]) {
    neonConfig.fetchEndpoint = `http://${proxy}/sql`;
    neonConfig.useSecureWebSocket = false;
    neonConfig.wsProxy = () => `${proxy}/v1`;
    // the proxy authenticates the client itself; the pipelined cleartext password of a Neon connection does not apply
    neonConfig.pipelineConnect = false;
  }
}
