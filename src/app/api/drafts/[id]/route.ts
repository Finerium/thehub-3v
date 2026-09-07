// GET /api/drafts/:id (blueprint 9.6, 9.9; ARCHITECTURE 8.2, 8.5; AC-LOOP-13, AC-LOOP-14, AC-LOOP-15). The poll the
// client runs while the invocation drafts: the draft, its fields, its redline verdicts and its transitions, all in
// the spelling of section 9.6 and read within the visitor's sandbox scope, so one visitor never polls another's
// draft. The poll is also the lease watchdog: before it reads, it asks src/loop/lease.ts to block any draft of that
// id whose lease has run out, so a draft is never stranded by an invocation that died, and the blocked draft is
// re-proposable (ADR-004). Read-only apart from that watchdog transition.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { getSandbox } from "@/auth/sandbox";
import {
  readDraft,
  readFields,
  readTransitions,
  readVerdicts,
  toDraftDocument,
  toDraftField,
  toDraftTransition,
  toRedlineVerdict,
} from "@/db/queries/loop";
import { HttpError, NotFound } from "@/lib/errors";
import { REQUEST_ID_HEADER, requestIdOf } from "@/lib/request-id";
import { expireIfPastLease } from "@/loop/lease";
import { visibleScope } from "@/loop/scope";

export const dynamic = "force-dynamic";

const ROUTE = "/api/drafts/:id";
const Params = z.object({ id: z.string().min(1).max(200) });

type Context = { params: Promise<{ id: string }> };

export const GET = withRoute(ROUTE, "view_drafts", async (request: NextRequest, context: Context) => {
  const params = Params.safeParse(await context.params);
  if (!params.success) throw new HttpError(400, "invalid_params");
  const id = params.data.id;

  await expireIfPastLease(id); // the watchdog runs before the read, so this poll returns the blocked draft
  const box = await getSandbox(await cookies());
  const draft = await readDraft(id, visibleScope(box));
  if (!draft) throw new NotFound("draft", id);

  const fields = await readFields(id);
  const verdicts = await readVerdicts(id);
  const transitions = await readTransitions(id);

  return NextResponse.json(
    {
      draft: toDraftDocument(draft),
      fields: fields.map(toDraftField),
      verdicts: verdicts.map(toRedlineVerdict),
      transitions: transitions.map(toDraftTransition),
    },
    { headers: { [REQUEST_ID_HEADER]: requestIdOf(request), "cache-control": "private, no-store" } },
  );
});
