// POST /api/drafts and GET /api/drafts (blueprint 9.6, 9.9, ADR-004; ARCHITECTURE 8.2, 8.5; AC-LOOP-13,
// AC-LOOP-15). POST is the only entry to the drafting loop: under `create_draft` and the `draft:<user_id>` limit of
// five a minute it inserts the draft in `proposed` with a 240 s lease taken from the database clock, the asset's
// next lesson id reserved and the visitor's sandbox as `session_scope`, answers 202 { draft_id, state } inside the
// handler and hands the drafting to runDraft through the invocation's waitUntil (`after`), so nothing waits on a
// provider call. GET is the review queue read within the same scope: the seeded drafts (`session_scope IS NULL`)
// and the visitor's own, never another browser's. No draft body ever reaches an audit payload (9.7).
// egress: none (the provider is reached only from src/gateway/, inside runDraft)
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { getSandbox } from "@/auth/sandbox";
import type { SessionUser } from "@/auth/session";
import { db } from "@/db/client";
import { toDraftDocument } from "@/db/queries/loop";
import { debtCluster, draftDocument } from "@/db/schema";
import { MODEL_ID, PROMPTS } from "@/gateway";
import { writeAudit } from "@/lib/audit";
import { HttpError, NotFound, RateLimited } from "@/lib/errors";
import { limit } from "@/lib/ratelimit";
import { REQUEST_ID_HEADER, requestIdOf } from "@/lib/request-id";
import { runDraft } from "@/loop/draft";
import { leaseExpiry, nextOplId, queueInScope, usedOplIds } from "@/loop/queries";
import { draftScope } from "@/loop/scope";
import { PROVISIONAL_HEADER } from "@/loop/template";

// ADR-004: the invocation drafts inside its own 300 s, the verified Vercel maximum, with a 240 s lease inside it.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ROUTE = "/api/drafts";
const NO_STORE = "private, no-store";

const Body = z.object({ cluster_id: z.string().min(1).max(200) }).strict();

export const POST = withRoute(ROUTE, "create_draft", async (request: NextRequest, _context: unknown, user: SessionUser) => {
  const requestId = requestIdOf(request);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) throw new HttpError(400, "invalid_body");

  const hit = await limit("draft", user.id);
  if (!hit.allowed) throw new RateLimited("draft", hit.limit, hit.resets_at);

  const box = await getSandbox(await cookies());
  const [cluster] = await db
    .select({ id: debtCluster.id, equipmentTag: debtCluster.equipmentTag, corpusVersionId: debtCluster.corpusVersionId })
    .from(debtCluster)
    .where(eq(debtCluster.id, body.data.cluster_id))
    .limit(1);
  if (!cluster) throw new NotFound("debt_cluster", body.data.cluster_id);

  const oplIdReserved = nextOplId(cluster.equipmentTag, await usedOplIds(cluster.equipmentTag));
  const id = randomUUID();
  await db.insert(draftDocument).values({
    id,
    clusterId: cluster.id,
    equipmentTag: cluster.equipmentTag,
    state: "proposed",
    leaseExpiresAt: leaseExpiry(),
    corpusVersionId: cluster.corpusVersionId,
    oplIdReserved,
    // provisional until AG-3 returns its header, which the review surface shows beside the drafted sections
    title: PROVISIONAL_HEADER.title(cluster.equipmentTag),
    classification: PROVISIONAL_HEADER.classification,
    aspect: PROVISIONAL_HEADER.aspect,
    createdByAlias: user.alias,
    modelId: MODEL_ID,
    promptVersion: PROMPTS["AG-3"].version,
    previousDraftId: null,
    sessionScope: draftScope(box),
  });

  await writeAudit({
    id: requestId,
    actor_alias: user.alias,
    actor_role: user.role,
    action: "draft.created",
    entity: "draft",
    entity_id: id,
    payload: { draft_id: id, cluster_id: cluster.id, equipment_tag: cluster.equipmentTag, state: "proposed" },
    trace_id: null,
    route: ROUTE,
    corpus_version_id: cluster.corpusVersionId,
  });

  const response = NextResponse.json(
    { draft_id: id, state: "proposed" },
    { status: 202, headers: { [REQUEST_ID_HEADER]: requestId, "cache-control": NO_STORE } },
  );
  after(() => runDraft(id)); // the same invocation drafts after the response, never before it (ADR-004)
  return response;
});

export const GET = withRoute(ROUTE, "view_drafts", async (request: NextRequest) => {
  const box = await getSandbox(await cookies());
  const drafts = await queueInScope(box);
  return NextResponse.json(
    { drafts: drafts.map(toDraftDocument) },
    { headers: { [REQUEST_ID_HEADER]: requestIdOf(request), "cache-control": NO_STORE } },
  );
});
