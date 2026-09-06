// GET /api/trace/:id (blueprint 9.9, 9.7; AC-ANS-11): under ask_read through authorize(), the stored AnswerTrace
// with its packet and gate decisions, read from the immutable answer_trace row and validated by the generated Zod on
// the way out; a trace computed against a later version stays readable. 404 designed JSON for an unknown id, 400
// for a malformed one. No write path exists here.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readTrace } from "@/answer/trace";
import { withRoute } from "@/auth/authorize";
import { HttpError, NotFound } from "@/lib/errors";

const Params = z.object({ id: z.string().min(1).max(200) });

type Context = { params: Promise<{ id: string }> };

export const GET = withRoute("/api/trace/:id", "ask_read", async (_request: NextRequest, context: Context) => {
  const params = Params.safeParse(await context.params);
  if (!params.success) throw new HttpError(400, "invalid_params");
  const trace = await readTrace(params.data.id);
  if (!trace) throw new NotFound("answer_trace", params.data.id);
  return NextResponse.json(trace, { headers: { "cache-control": "private, no-store" } });
});
