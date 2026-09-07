// POST /api/drafts/:id/repropose (blueprint 9.6 "blocked -> proposed" and "rejected -> proposed", 9.9; AC-LOOP-14,
// AC-LOOP-15). A blocked or rejected draft is never edited back to life: it re-proposes as a new draft in
// `proposed` linked through `previous_draft_id`, carrying the same evidence (the cluster, the asset, the corpus
// version and the sandbox) and the reasons the old one was blocked for, and reserving a lesson id of its own
// because `opl_id_reserved` is unique. 201 { draft_id }, and the drafting goes to runDraft through the invocation's
// waitUntil exactly as POST /api/drafts does; a draft in any other state, a published one first of all, is a 409
// and creates nothing. The new draft is inserted in `proposed`, so no state is written here and src/loop/state.ts
// stays the one writer of `draft_document.state`; the transition row is the new draft's own history.
// egress: none (the provider is reached only from src/gateway/, inside runDraft)
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { getSandbox } from "@/auth/sandbox";
import type { SessionUser } from "@/auth/session";
import { db } from "@/db/client";
import { readDraft, readVerdicts } from "@/db/queries/loop";
import { draftDocument, draftTransition } from "@/db/schema";
import { MODEL_ID, PROMPTS } from "@/gateway";
import { writeAudit } from "@/lib/audit";
import { HttpError, NotFound, RateLimited } from "@/lib/errors";
import { limit } from "@/lib/ratelimit";
import { REQUEST_ID_HEADER, requestIdOf } from "@/lib/request-id";
import { runDraft } from "@/loop/draft";
import { leaseExpiry, nextOplId, REPROPOSABLE, usedOplIds } from "@/loop/queries";
import { draftScope, visibleScope } from "@/loop/scope";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ROUTE = "/api/drafts/:id/repropose";
const Params = z.object({ id: z.string().min(1).max(200) });

type Context = { params: Promise<{ id: string }> };

export const POST = withRoute(ROUTE, "create_draft", async (request: NextRequest, context: Context, user: SessionUser) => {
  const requestId = requestIdOf(request);
  const params = Params.safeParse(await context.params);
  if (!params.success) throw new HttpError(400, "invalid_params");

  const hit = await limit("draft", user.id);
  if (!hit.allowed) throw new RateLimited("draft", hit.limit, hit.resets_at);

  const box = await getSandbox(await cookies());
  const previous = await readDraft(params.data.id, visibleScope(box));
  if (!previous) throw new NotFound("draft", params.data.id);
  if (!REPROPOSABLE.includes(previous.state)) throw new HttpError(409, "conflict", { state: previous.state });

  // the reasons of the last redline round, which the new draft's first transition carries
  const reasons = (await readVerdicts(previous.id)).at(-1)?.reasons ?? [];
  const oplIdReserved = nextOplId(previous.equipmentTag, await usedOplIds(previous.equipmentTag));
  const id = randomUUID();

  await db.insert(draftDocument).values({
    id,
    clusterId: previous.clusterId,
    equipmentTag: previous.equipmentTag,
    state: "proposed",
    leaseExpiresAt: leaseExpiry(),
    corpusVersionId: previous.corpusVersionId,
    oplIdReserved,
    title: previous.title,
    classification: previous.classification,
    aspect: previous.aspect,
    createdByAlias: user.alias,
    modelId: MODEL_ID,
    promptVersion: PROMPTS["AG-3"].version,
    previousDraftId: previous.id,
    sessionScope: draftScope(box),
  });

  const why = reasons.map((reason) => reason.text).join(" ");
  await db.insert(draftTransition).values({
    id: randomUUID(),
    draftId: id,
    fromState: previous.state,
    toState: "proposed",
    actorAlias: user.alias,
    actorRole: user.role,
    reason: why === "" ? null : why,
    editDiff: null,
    serverTs: new Date(),
  });

  await writeAudit({
    id: requestId,
    actor_alias: user.alias,
    actor_role: user.role,
    action: "draft.reproposed",
    entity: "draft",
    entity_id: id,
    payload: { draft_id: id, previous_draft_id: previous.id, from_state: previous.state, to_state: "proposed" },
    trace_id: null,
    route: ROUTE,
    corpus_version_id: previous.corpusVersionId,
  });

  const response = NextResponse.json(
    { draft_id: id },
    { status: 201, headers: { [REQUEST_ID_HEADER]: requestId, "cache-control": "private, no-store" } },
  );
  after(() => runDraft(id));
  return response;
});
