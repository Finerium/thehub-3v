// The AG-4 confirmation run of AC-EVAL-05 (blueprint 11.7), the live half of tests/unit/entailment.ts.
//
//   pnpm eval:confirm
//
// One call, the one the test file's header names: `runConfirmation(bundle, (claims, spans) => verify(claims,
// spans).then((r) => r.verdicts))`. The pair set, the resolution of each pair against bundle/claims.json and the
// scoring all live in tests/unit/entailment.ts and are imported, never re-implemented here, so the run measures
// the instrument the tests prove rather than a second copy of it. `verify` is the production AG-4 path of
// src/answer/verify.ts, so the call goes through the gateway on the AG-4 pin, is validated against the 9.16
// envelope before it leaves and writes its gateway_call row like any other role call.
//
// What this prints: the verdict tally, the pair count, the agreement against the labels, the AG-4 pin and the
// gateway rows and tokens this run added. What it never prints: a claim sentence, a span text, a question, a
// verifier reason or any environment value. Exit status is 0 only when the confirmation passes.
import path from "node:path";
import { and, eq, gte, sql } from "drizzle-orm";
import type { VerifyResult } from "@/answer/verify";
import { verify } from "@/answer/verify";
import { db } from "@/db/client";
import { gatewayCall } from "@/db/schema";
import { PROMPTS, ROLE_TABLE } from "@/gateway";
import { utcDayStart } from "@/gateway/budget";
import { MAX_FALSE_ACCEPTS, MIN_AGREEMENTS, PAIRS, runConfirmation } from "../../tests/unit/entailment";

const BUNDLE = path.join(process.cwd(), "bundle");

/** Today's AG-4 rows, read before and after the call so the difference is this run's own cost. */
async function ag4Today(): Promise<{ rows: number; tokens: number }> {
  const [row] = await db
    .select({
      rows: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${gatewayCall.inputTokens} + ${gatewayCall.outputTokens}), 0)::int`,
    })
    .from(gatewayCall)
    .where(and(eq(gatewayCall.role, "AG-4"), gte(gatewayCall.createdAt, utcDayStart())));
  return { rows: Number(row?.rows ?? 0), tokens: Number(row?.tokens ?? 0) };
}

async function main(): Promise<number> {
  const before = await ag4Today();
  // The call's own result is kept for its outcome; an array holds it because the verdict source's contract is to
  // return verdicts and nothing else (the test passes a stub of the same shape).
  const seen: VerifyResult[] = [];
  const result = await runConfirmation(BUNDLE, (claims, spans) =>
    verify(claims, spans).then((r) => {
      seen.push(r);
      return r.verdicts;
    }),
  );
  const after = await ag4Today();

  const call = seen[0];
  if (call === undefined) throw new Error("the verifier was never called: no confirmation was taken");
  const tally: Record<string, number> = { entailed: 0, not_entailed: 0, contradicted: 0 };
  for (const verdict of call.verdicts) tally[verdict.verdict] = (tally[verdict.verdict] ?? 0) + 1;
  const cfg = ROLE_TABLE["AG-4"];

  console.log(
    JSON.stringify(
      {
        criterion: "AC-EVAL-05",
        pairs: PAIRS.length,
        supported: PAIRS.filter((p) => p.label === "supported").length,
        unsupported: PAIRS.filter((p) => p.label === "unsupported").length,
        outcome: call.outcome,
        verdicts_returned: call.verdicts.length,
        verdict_tally: tally,
        agreements: result.agreements,
        acceptance: { min_agreements: MIN_AGREEMENTS, max_false_accepts: MAX_FALSE_ACCEPTS },
        false_accepts: result.false_accepts,
        false_rejects: result.false_rejects,
        missing: result.missing,
        disagreements: result.disagreements,
        passed: result.passed,
        pin: {
          role: cfg.role,
          model_id: cfg.model_id,
          effort: cfg.effort,
          max_tokens: cfg.max_tokens,
          prompt_file: PROMPTS["AG-4"].file,
          prompt_version: cfg.prompt_version,
        },
        gateway: {
          rows_written: after.rows - before.rows,
          tokens: after.tokens - before.tokens,
          input_tokens: call.call?.input_tokens ?? 0,
          output_tokens: call.call?.output_tokens ?? 0,
        },
      },
      null,
      2,
    ),
  );
  return result.passed ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`confirmation run failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
