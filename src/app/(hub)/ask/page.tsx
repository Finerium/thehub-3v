// Surface 2, Ask (blueprint 6.2; AC-ANS-*, AC-UI-02, AC-ANS-20): the server half reads what the sheet binds to at
// request time and hands it to the client half. The active corpus version names the sheet; a `?chip=<id>` link
// from Home resolves to its seeded_chip row (9.17) or to the designed "not seeded yet" state, never to a fake; the
// daily budget of the two live roles is read the way the route reads it, so an exhausted day is stated before the
// first keystroke (seeded chips and search mode keep working). Nothing here is prerendered.
import type { Metadata } from "next";
import { DesignedState } from "@/components/DesignedState";
import { seededChipById, type SeededChipRow } from "@/db/queries/traces";
import { activeVersion } from "@/db/versions";
import { budgetStatus, utcDayStart } from "@/gateway/budget";
import { AskClient, type LiveBudget } from "./AskClient";

export const metadata: Metadata = { title: "Ask" };
export const dynamic = "force-dynamic";

const DIGEST_PREFIX = 8;
const LIVE_TASKS = ["AG-2", "AG-4"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** The first live role whose daily budget is spent, as POST /api/ask would refuse it (AC-ANS-20), or null. */
async function liveBudget(): Promise<LiveBudget | null> {
  for (const task of LIVE_TASKS) {
    const status = await budgetStatus(task);
    if (status.exhausted) {
      return {
        role: status.role,
        tokens_per_day: status.tokens_per_day,
        spend_cap_idr_per_day: status.spend_cap_idr_per_day,
        resets_at: new Date(utcDayStart().getTime() + DAY_MS).toISOString(),
      };
    }
  }
  return null;
}

type AskData = {
  version: { label: string; digestPrefix: string } | null;
  chip: SeededChipRow | null;
  budget: LiveBudget | null;
};

async function readAsk(chipId: string | null): Promise<AskData> {
  const [version, chip, budget] = await Promise.all([activeVersion(), chipId ? seededChipById(chipId) : Promise.resolve(null), liveBudget()]);
  return {
    version: version ? { label: version.label, digestPrefix: version.corpus_sha256.slice(0, DIGEST_PREFIX) } : null,
    chip,
    budget,
  };
}

export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const params = await searchParams;
  const chipId = (first(params.chip) ?? "").slice(0, 200) || null;

  let data: AskData;
  try {
    data = await readAsk(chipId);
  } catch (error) {
    console.error(JSON.stringify({ route: "/ask", event: "ask.read_failed", message: error instanceof Error ? error.message : String(error) }));
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="Ask reads the active corpus version, the seeded chip a link names and the daily budget of the live roles at request time. The read failed, so nothing is shown in their place."
        next={{ href: "/ask", label: "Try again" }}
      />
    );
  }

  return <AskClient version={data.version} chip={data.chip} chipParam={chipId} budget={data.budget} />;
}
