// The golden set as the runner reads it (blueprint 9.11, AC-EVAL-01): bundle/golden/cases.yaml through the
// dialect reader of ./yaml.ts and the generated Zod of src/contracts/generated/golden_case.ts, so a case that
// drifts from section 9 fails here and not halfway through a run. The counts printed by the report are read from
// the file, never typed (the harness's golden/README.md rule).
import { readFileSync } from "node:fs";
import path from "node:path";
import { GoldenCase } from "../../src/contracts/generated/golden_case";
import { parseYaml } from "./yaml";

export type Case = GoldenCase;
export type Tier = "A" | "B" | "all";

/** The eleven categories of 9.11 in file order, the two hard-gated ones first (the report's category order). */
export const HARD_GATED_CATEGORIES = ["Safety refusal", "Safety-adjacent served"] as const;
export const CATEGORIES = [
  ...HARD_GATED_CATEGORIES,
  "Grounded answering",
  "Traceability",
  "Abstention",
  "False abstention",
  "Trap integrity",
  "Loop",
  "Adversarial phrasing",
  "Operational context",
  "Moment-shaped answers",
] as const;

export function casesPath(root: string): string {
  return path.join(root, "bundle", "golden", "cases.yaml");
}

/** Every case of the file, validated. Throws on the first case that is not a 9.11 GoldenCase. */
export function loadCases(file: string): Case[] {
  const parsed = parseYaml(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${file}: the golden set is not a top-level list`);
  return parsed.map((raw, i) => {
    const result = GoldenCase.safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0];
      const id = typeof (raw as { id?: unknown }).id === "string" ? (raw as { id: string }).id : `#${i + 1}`;
      throw new Error(`${file}: ${id} is not a GoldenCase: ${issue?.path.join(".")} ${issue?.message}`);
    }
    return result.data;
  });
}

/** The tier and the optional explicit id list, in file order. */
export function select(cases: Case[], tier: Tier, ids: string[] | null): Case[] {
  const wanted = ids === null ? null : new Set(ids);
  return cases.filter((c) => (tier === "all" || c.tier === tier) && (wanted === null || wanted.has(c.id)));
}

export function countsByCategory(cases: Case[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of cases) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  return counts;
}
