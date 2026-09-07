// POST /api/drafts/:id/decision (blueprint 9.9 `decide`, 9.6 transitions; ARCHITECTURE 8.4; AC-LOOP-08). The human
// half of the loop: the Reviewing Supervisor accepts, edits or rejects a draft that is in review; the Manager may
// only reject one that is already accepted (the restriction inside the 9.9 `decide` column, canDecide()); the
// Engineer and the Admin hold no column at all and never reach this handler. A role acting outside its column is a
// 403 with `auth.role_violation` under the request id, and no transition.
//
// An edit is one transaction: the new text is written to draft_field, the diff of every element it touched is
// recorded on the transition row, and the draft stays in review (in_review -> in_review). src/loop/state.ts checks
// the pair and the actor a second time and writes the transition row and the audit event beside the state, so a
// decision that slipped past the matrix still cannot move a draft. egress: none
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AuthError, recordRoleViolation, withRoute } from "@/auth/authorize";
import { canDecide } from "@/auth/matrix";
import type { DraftState } from "@/contracts/generated/drafts";
import { withTransaction, type Tx } from "@/db/client";
import { readDraft, readFields, toDraftDocument, type FieldRow } from "@/db/queries/loop";
import { draftField } from "@/db/schema";
import { HttpError, NotFound } from "@/lib/errors";
import { REQUEST_ID_HEADER, requestIdOf } from "@/lib/request-id";
import { transition, type Actor } from "@/loop/state";

export const dynamic = "force-dynamic";

const ROUTE = "/api/drafts/:id/decision";

// 9.9 `{ decision, reason?, edits? }`. `edits` belongs to an edit and to nothing else, in both directions: edits
// carried on an accept would be silently dropped, which is worse than a refusal.
const Edit = z
  .object({
    field_id: z.string().min(1).max(200),
    text: z.string().min(1).max(4000),
    reason: z.string().min(1).max(1000),
  })
  .strict();

const Body = z
  .object({
    decision: z.enum(["accept", "edit", "reject"]),
    reason: z.string().min(1).max(1000).optional(),
    edits: z.array(Edit).min(1).optional(),
  })
  .strict()
  .refine((b) => (b.decision === "edit") === (b.edits !== undefined), {
    message: "edits belong to the edit decision and to no other",
    path: ["edits"],
  });

type Edit = z.infer<typeof Edit>;

/** 9.6: the state each decision moves the draft to; the pair and the actor are checked again by the state machine. */
const TARGET: Readonly<Record<z.infer<typeof Body>["decision"], DraftState>> = {
  accept: "accepted",
  edit: "in_review",
  reject: "rejected",
};

/** One line per element the supervisor rewrote: the id, the sentence it replaced, the new one and the reason. */
function diffLine(field: FieldRow, edit: Edit): string {
  return `${field.id}: - ${field.text} + ${edit.text} (${edit.reason})`;
}

async function diffOf(draftId: string, edits: readonly Edit[]): Promise<string> {
  const fields = new Map((await readFields(draftId)).map((f) => [f.id, f] as const));
  return edits
    .map((edit) => {
      const field = fields.get(edit.field_id);
      if (!field) throw new NotFound("draft_field", edit.field_id);
      // 9.6: a slot's text is the fixed literal and only an SME note fills it, so an edit may never rewrite one.
      if (field.isSlot) throw new HttpError(422, "slot_not_editable", { field_id: field.id });
      return diffLine(field, edit);
    })
    .join("\n");
}

async function applyEdits(tx: Tx, draftId: string, edits: readonly Edit[]): Promise<void> {
  for (const edit of edits) {
    await tx
      .update(draftField)
      .set({ text: edit.text })
      .where(and(eq(draftField.draftId, draftId), eq(draftField.id, edit.field_id)));
  }
}

type Context = { params: Promise<{ id: string }> };

export const POST = withRoute(ROUTE, "decide", async (request: NextRequest, context: Context, user) => {
  const requestId = requestIdOf(request);
  const { id } = await context.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body");
  const { decision, edits } = parsed.data;

  const draft = await readDraft(id);
  if (!draft) throw new NotFound("draft", id);
  if (!canDecide(user.role, decision, draft.state)) {
    await recordRoleViolation(user, "decide", ROUTE);
    throw new AuthError(403);
  }

  const actor: Actor = { alias: user.alias, role: user.role };
  const editDiff = edits === undefined ? null : await diffOf(id, edits);
  const moved = await withTransaction(async (tx) => {
    if (edits !== undefined) await applyEdits(tx, id, edits);
    return transition(tx, id, TARGET[decision], actor, parsed.data.reason ?? null, editDiff, {
      route: ROUTE,
      auditId: requestId,
    });
  });

  return NextResponse.json(toDraftDocument({ ...draft, state: moved.to }), {
    headers: { [REQUEST_ID_HEADER]: requestId, "cache-control": "private, no-store" },
  });
});
