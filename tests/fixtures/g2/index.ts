// Synthetic fixtures for the G2 gate tests (src/gates/g2/*.test.ts; ARCHITECTURE section 7 step 11, blueprint 8.4,
// AC-ANS-02 to 07, 17 and 19). Every span, claim, typed fact and verdict here is written for the tests: the document
// numbers carry the SYN- prefix and no sentence is corpus text. Each JSON file is parsed against the generated
// contracts on load (Zod at the boundary), so a fixture that drifts from 9.8 fails before any gate test runs. Quote
// hashes were computed as sha256(utf8(canonical(text))) through the application's canonical form; the two spans
// that deliberately do not hash to their text are named in spans.json by their ids (sp-tampered) and here.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Citation, Claim, TypedFact } from "@/contracts/generated/evidence_packet";
import { AG4VerifyOutput } from "@/contracts/generated/gateway";
import { canonical, pack, type OutboundScreen, type RulePack } from "@/rulepack";

export { Citation, Claim, TypedFact };

/** A retrieved span as G2 receives it: the Citation of 9.8 with the span text beside it. */
export const EvidenceSpan = Citation.extend({ text: z.string() }).strict();
export type EvidenceSpan = z.infer<typeof EvidenceSpan>;

/** An AG-2 claim with the sentence id the lane assigned before AG-4 saw it (AG2Output.claims plus id). */
export const ComposerClaim = z.object({ id: z.string(), text: z.string(), span_ids: z.array(z.string()) }).strict();
export type ComposerClaim = z.infer<typeof ComposerClaim>;

/** One AG-4 verdict, the element of AG4VerifyOutput.verdicts (9.16). */
export const VerifierVerdict = AG4VerifyOutput.shape.verdicts.element;
export type VerifierVerdict = z.infer<typeof VerifierVerdict>;

export type GateCheck = "C1" | "C2" | "C3" | "C4" | "C5" | "C6";

/** The input of runG2 as the tests build it; the builder's G2Input must accept this shape (checked by tsc). */
export interface GateInput {
  claims: ComposerClaim[];
  evidence: EvidenceSpan[];
  typed_facts: TypedFact[];
  verdicts: VerifierVerdict[];
  pack: RulePack;
  whitelisted_spans: string[];
  /** Only true when the labelled history toggle was traced (AC-ANS-14); omitted means false. */
  include_superseded?: boolean;
}

/** The result of runG2 as the tests read it. */
export interface GateResult {
  kept: Claim[];
  dropped: Array<{ claim: ComposerClaim; check: GateCheck; reason: string }>;
  outbound: OutboundScreen;
}

const here = path.dirname(fileURLToPath(import.meta.url));
function load<T>(file: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(readFileSync(path.join(here, file), "utf8")));
}

export const spans: EvidenceSpan[] = load("spans.json", z.array(EvidenceSpan));
export const claims: ComposerClaim[] = load("claims.json", z.array(ComposerClaim));
export const typedFacts: TypedFact[] = load("typed_facts.json", z.array(TypedFact));
export const verdicts = load(
  "verdicts.json",
  z.object({ entailed: z.array(VerifierVerdict), parse_failed: z.array(VerifierVerdict).length(0) }).strict(),
);

/** The span ids whose stored quote_hash is, on purpose, not the hash of their text. */
export const TAMPERED_SPAN_IDS: readonly string[] = ["sp-tampered"];

/** sha256 hex over the UTF-8 bytes of the canonical form, the span identity of 9.2 (quote_hash). */
export function quoteHashOf(text: string): string {
  return createHash("sha256").update(Buffer.from(canonical(text), "utf8")).digest("hex");
}

export function span(id: string): EvidenceSpan {
  const found = spans.find((s) => s.span_id === id);
  if (found === undefined) throw new Error(`no fixture span ${id}`);
  return structuredClone(found);
}

/** The Citation of a fixture span (the span without its text), parsed against the strict 9.8 Citation. */
export function citation(id: string): Citation {
  return Citation.parse(Object.fromEntries(Object.entries(span(id)).filter(([key]) => key !== "text")));
}

export function claim(id: string, text: string, span_ids: string[]): ComposerClaim {
  return { id, text, span_ids };
}

export function verdict(
  sentence_id: string,
  value: VerifierVerdict["verdict"],
  span_id: string | null,
  reason = "The span states the sentence.",
): VerifierVerdict {
  return { sentence_id, verdict: value, span_id, reason };
}

/** One entailed verdict per claim, naming the claim's first cited span, in claim order. */
export function entailedFor(list: readonly ComposerClaim[]): VerifierVerdict[] {
  return list.map((c) => verdict(c.id, "entailed", c.span_ids[0] ?? null));
}

/** A complete gate input: the fixture spans and typed facts, the given claims with entailed verdicts, no whitelist. */
export function input(overrides: Partial<GateInput> & { claims: ComposerClaim[] }): GateInput {
  return {
    evidence: spans.map((s) => structuredClone(s)),
    typed_facts: typedFacts.map((f) => structuredClone(f)),
    verdicts: entailedFor(overrides.claims),
    pack,
    whitelisted_spans: [],
    include_superseded: false,
    ...overrides,
  };
}
