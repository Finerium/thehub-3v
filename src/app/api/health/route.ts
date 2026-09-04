// GET /api/health (9.9, 6.2 surface 14, AC-M0-01): public, no session, no data. SELECT 1 through the one client,
// the active corpus version's label and the build commit; { ok: false } with 503 when the database does not
// answer or no version is active. The keep-alive of D-15 calls this every 30 minutes.
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRoute } from "@/auth/authorize";
import { db } from "@/db/client";
import { activeCorpusVersion } from "@/lib/audit";
import { logError } from "@/lib/log";
import { requestIdOf } from "@/lib/request-id";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export const GET = withRoute("/api/health", null, async (request) => {
  try {
    await db.execute(sql`select 1`);
    const active = await activeCorpusVersion();
    if (!active) {
      return NextResponse.json({ ok: false, reason: "no_active_version" }, { status: 503, headers: NO_STORE });
    }
    // T3 adds waitUntil(embedder.warm()) here once src/gateway/embedding.ts exists (ARCHITECTURE section 6).
    return NextResponse.json(
      { ok: true, corpus_version: active.label, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" },
      { headers: NO_STORE },
    );
  } catch (error) {
    logError(requestIdOf(request), "/api/health", error);
    return NextResponse.json({ ok: false, reason: "database" }, { status: 503, headers: NO_STORE });
  }
});
