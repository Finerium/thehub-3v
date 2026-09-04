// The one database client (ARCHITECTURE 3, 3.4). `db` is the HTTP driver over the pooled DATABASE_URL: one
// request, one query, no session, which is what every request-scoped read and single-statement write needs on
// fluid compute. `withTransaction` opens a WebSocket pool for the few places that need an interactive transaction
// (G3, the state machine, the seed): SELECT ... FOR UPDATE, then decide, then write, all on one connection.
// Migrations never come through here; drizzle-kit runs them over DATABASE_URL_UNPOOLED (drizzle.config.ts).
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { neon, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs, type NeonTransaction } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (blueprint 9.15: the pooled Neon URL)");
  return url;
}

export const db = drizzleHttp(neon(connectionString()), { schema });
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
