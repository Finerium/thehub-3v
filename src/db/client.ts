// The one database client (ARCHITECTURE 3, 3.4). `db` is the HTTP driver over the pooled DATABASE_URL: one
// request, one query, no session, which is what every request-scoped read and single-statement write needs on
// fluid compute. `withTransaction` opens a WebSocket pool for the few places that need an interactive transaction
// (G3, the state machine, the seed): SELECT ... FOR UPDATE, then decide, then write, all on one connection.
// Migrations never come through here; drizzle-kit runs them over DATABASE_URL_UNPOOLED (drizzle.config.ts).
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs, type NeonTransaction } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// CI and the local docker pair run a plain Postgres behind a Neon HTTP and WebSocket proxy. The preload of
// tests/db/neon-local.mjs configures the copy in node_modules, which is the copy drizzle-kit, the seed and the
// integration tests load; a built Next server carries its own bundled copy, so the same redirection is applied
// here on the instance the application itself uses. Without NEON_LOCAL_PROXY nothing changes and no Neon
// connection can be redirected.
const localProxy = process.env.NEON_LOCAL_PROXY;
if (localProxy) {
  neonConfig.fetchEndpoint = `http://${localProxy}/sql`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.wsProxy = () => `${localProxy}/v1`;
  neonConfig.pipelineConnect = false;
}

function connectionString(): string {
  // D-20: the application connects as the dedicated role thehub_app through DATABASE_URL_APP (the pooled URL with
  // that role's credentials, assembled by tools/app-role-url.sh); DATABASE_URL (the integration's owner URL) is the
  // fallback so a checkout without the role still runs. Migrations, the seed and retention use the owner URL.
  const url = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_APP or DATABASE_URL is not set (blueprint 9.15: the pooled Neon URL)");
  return url;
}

// Built on first use, not at module load: a module that only imports a type or a table must not need a URL, and
// the database test lane skips itself without one (it cannot skip if the import already threw).
let handle: ReturnType<typeof drizzleHttp<typeof schema>> | null = null;
function client(): ReturnType<typeof drizzleHttp<typeof schema>> {
  if (handle === null) handle = drizzleHttp(neon(connectionString()), { schema });
  return handle;
}
export const db = new Proxy({} as ReturnType<typeof drizzleHttp<typeof schema>>, {
  get: (_t, prop, receiver) => Reflect.get(client(), prop, receiver),
  has: (_t, prop) => Reflect.has(client(), prop),
}) as ReturnType<typeof drizzleHttp<typeof schema>>;
export type Db = typeof db;

export type Tx = NeonTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

// ponytail: one pool per transaction, closed in finally; a module-scope pool if transaction throughput matters.
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (typeof WebSocket === "undefined") {
    throw new Error("withTransaction needs the WebSocket global (Node 22 or later)");
  }
  const pool = new Pool({ connectionString: connectionString() });
  try {
    return await drizzleWs(pool, { schema }).transaction((tx) => fn(tx));
  } finally {
    await pool.end();
  }
}
