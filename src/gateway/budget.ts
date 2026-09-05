// The daily budget check (ARCHITECTURE 9.3, AC-NFR-15, AC-ANS-20): before a live call, today's gateway_call rows of
// the task's role are summed (input_tokens + output_tokens, UTC day) and priced with the constants of config.ts;
// at or above either cap the gateway returns outcome "budget_exhausted" without calling the provider.
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { gatewayCall } from "@/db/schema";
import { ROLE_TABLE, spendIdr, type ChatTask } from "./config";

export type BudgetStatus = {
  role: string;
  day: string; // YYYY-MM-DD, UTC
  tokens_used: number;
  tokens_per_day: number;
  spend_idr: number;
  spend_cap_idr_per_day: number;
  exhausted: boolean;
};

export function utcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function budgetStatus(task: ChatTask, now: Date = new Date()): Promise<BudgetStatus> {
  const cfg = ROLE_TABLE[task];
  const since = utcDayStart(now);
  const [row] = await db
    .select({
      input: sql<number>`coalesce(sum(${gatewayCall.inputTokens}), 0)::int`,
      output: sql<number>`coalesce(sum(${gatewayCall.outputTokens}), 0)::int`,
    })
    .from(gatewayCall)
    .where(and(eq(gatewayCall.role, cfg.role), gte(gatewayCall.createdAt, since)));
  const input = Number(row?.input ?? 0);
  const output = Number(row?.output ?? 0);
  const tokensUsed = input + output;
  const spend = spendIdr(input, output);
  return {
    role: cfg.role,
    day: since.toISOString().slice(0, 10),
    tokens_used: tokensUsed,
    tokens_per_day: cfg.budget.tokens_per_day,
    spend_idr: spend,
    spend_cap_idr_per_day: cfg.budget.spend_cap_idr_per_day,
    exhausted: tokensUsed >= cfg.budget.tokens_per_day || spend >= cfg.budget.spend_cap_idr_per_day,
  };
}
