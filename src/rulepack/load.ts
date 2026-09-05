// The rule pack of blueprint 9.10, read once from the tracked bundle copy (the public part of the harness bundle,
// ADR-002: "read by pointer") and validated against the contract's Zod. A mismatch throws while the module loads,
// so a build or a cold start fails closed before any request can be classified against an unvalidated pack
// (invariant 1: safety intent is classified in deterministic code, and that code reads one validated file).
import { RulePack } from "../contracts/generated/rulepack";
import raw from "../../bundle/rulepack/v1.json";

export type { RulePack };
export type ProtectiveRow = RulePack["protective_vocabulary"][number];
export type DocumentedBypassEntity = RulePack["documented_bypass_entities"][number];

function loadPack(): RulePack {
  const parsed = RulePack.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`bundle/rulepack/v1.json does not match the RulePack contract (blueprint 9.10): ${issues}`);
  }
  return parsed.data;
}

/** The validated pack; every matcher call reads it, never the database. */
export const pack: RulePack = loadPack();
/** The pack's own version string ("1"), the value the trace and the packet record as `rulepack.version`. */
export const packVersion: string = pack.version;
