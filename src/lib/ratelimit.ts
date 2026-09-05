// Rate limits in Postgres (blueprint 9.9, ARCHITECTURE 3.4, ADR-011, AC-NFR-11, AC-NFR-18): fixed 60 s windows on
// the database clock, one upsert per hit (ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count), so the count
// holds across function instances and no memory is load-bearing. Keys: ask:<user_id>, draft:<user_id>, addr:<ip>.
// Windows older than an hour are deleted by scripts/db/retention.ts. A hit above the limit is answered with the
// designed 429 of src/lib/errors.ts (RateLimited), which names the limit and window_start + 60 s.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimitCounter } from "@/db/schema";

export const WINDOW_SECONDS = 60;

// 9.9: 30 asks and 5 draft creations per minute per account, 120 requests per minute per address.
export const LIMITS = { ask: 30, draft: 5, addr: 120 } as const;
export type Scope = keyof typeof LIMITS;

export type RateLimitResult = { allowed: boolean; count: number; limit: number; resets_at: Date };

// One hit on <scope>:<key> in the current window; `allowed` is false from hit limit + 1 on.
export async function limit(scope: Scope, key: string, max: number = LIMITS[scope]): Promise<RateLimitResult> {
  const [row] = await db
    .insert(rateLimitCounter)
    .values({ scope, key, windowStart: sql`date_trunc('minute', now())`, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitCounter.scope, rateLimitCounter.key, rateLimitCounter.windowStart],
      set: { count: sql`${rateLimitCounter.count} + 1` },
    })
    .returning({ count: rateLimitCounter.count, windowStart: rateLimitCounter.windowStart });
  if (!row) throw new Error("rate_limit_counter upsert returned no row");
  const windowStart = new Date(row.windowStart);
  return {
    allowed: row.count <= max,
    count: row.count,
    limit: max,
    resets_at: new Date(windowStart.getTime() + WINDOW_SECONDS * 1000),
  };
}

// The client's public address for addr:<ip>. Vercel overwrites x-forwarded-for with the requester's public IP and
// forwards no external proxy value (Vercel request-headers reference), so the first entry is the client.
export function clientAddress(request: Request): string {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first : "unknown";
}
