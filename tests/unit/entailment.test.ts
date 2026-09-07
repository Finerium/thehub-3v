// AC-EVAL-05, the instrument. The criterion asks for 30 labelled entailment pairs and one AG-4 run against them,
// and until this file landed neither the pairs nor the runner existed, so ADR-001's "pending" recorded a run that
// had no script. These tests prove the half a repository can prove:
//
//   the set    30 pairs, 15 supported and 15 unsupported, drawn from the golden set plus the WO-240007 drafting
//              case, every reference resolving in the bundle and every unsupported pairing actually a near miss;
//   the score  the acceptance arithmetic of 11.7 (at least 27 agreements, at most one false accept), proved in
//              both directions against stub verdicts, including the run that answers nothing.
//
// The live half is one call the Orchestrator makes: `runConfirmation(bundle, (claims, spans) => verify(claims,
// spans).then((r) => r.verdicts))`, on the AG-4 pin of ADR-001, writing the result, the model ids and the prompt
// versions back into ADR-001. No test here calls a provider: a unit lane that reached the network would measure
// the day's budget rather than the verifier.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VerifierVerdict } from "@/gates/g2";
import { MAX_FALSE_ACCEPTS, MIN_AGREEMENTS, PAIRS, resolvePairs, runConfirmation, scoreConfirmation, type EntailmentPair } from "./entailment";

const BUNDLE = path.join(process.cwd(), "bundle");
const DRAFTING_CASE = "WO-240007";

/** The entities the golden cases cite by name; the set is drawn from these plus the drafting case. */
function goldenCitedEntities(): Set<string> {
  const yaml = readFileSync(path.join(BUNDLE, "golden", "cases.yaml"), "utf8");
  const cited = new Set<string>();
  for (const block of yaml.matchAll(/must_cite: \[([^\]]*)\]/g)) {
    for (const quoted of (block[1] ?? "").matchAll(/"([^"]+)"/g)) cited.add(quoted[1] as string);
  }
  return cited;
}

/** A verifier that answers every pair the way the label says: the run the criterion hopes for. */
const perfect = (pairs: readonly EntailmentPair[]): VerifierVerdict[] =>
  pairs.map((p) => ({ sentence_id: p.id, verdict: p.label === "supported" ? "entailed" : "not_entailed", span_id: p.span_id, reason: "stub" }));

/** The same run with `flip` pairs answered wrongly, chosen from the front of the list so the choice is fixed. */
function withErrors(pairs: readonly EntailmentPair[], flip: readonly string[]): VerifierVerdict[] {
  return perfect(pairs).map((v) => (flip.includes(v.sentence_id) ? { ...v, verdict: v.verdict === "entailed" ? "not_entailed" : "entailed" } : v));
}

describe("the 30 labelled pairs (AC-EVAL-05)", () => {
  it("is 30 pairs, 15 supported and 15 unsupported, with unique ids", () => {
    expect(PAIRS).toHaveLength(30);
    expect(PAIRS.filter((p) => p.label === "supported")).toHaveLength(15);
    expect(PAIRS.filter((p) => p.label === "unsupported")).toHaveLength(15);
    expect(new Set(PAIRS.map((p) => p.id)).size).toBe(30);
  });

  it("is drawn from the golden set plus the WO-240007 drafting case, one claim per document", () => {
    const cited = goldenCitedEntities();
    expect(cited.size, "the golden cases named no must_cite entity, so nothing could be drawn from them").toBeGreaterThan(20);
    for (const pair of PAIRS) expect(cited.has(pair.drawn_from) || pair.drawn_from === DRAFTING_CASE, `${pair.id} is drawn from ${pair.drawn_from}`).toBe(true);
    expect(PAIRS.map((p) => p.drawn_from)).toContain(DRAFTING_CASE);
    // 15 claims over 15 distinct documents: no two pairs lean on the same words.
    expect(new Set(PAIRS.map((p) => p.claim_id)).size).toBe(15);
    expect(new Set(PAIRS.map((p) => p.drawn_from)).size).toBe(15);
  });

  it("resolves every reference in the bundle, and the texts are the bundle's own", () => {
    const resolved = resolvePairs(BUNDLE);
    expect(resolved).toHaveLength(30);
    for (const { pair, claim, span } of resolved) {
      expect(claim.text.trim().length, `${pair.id} resolved an empty sentence`).toBeGreaterThan(0);
      expect(span.text.trim().length, `${pair.id} resolved an empty span`).toBeGreaterThan(0);
      expect(claim.span_ids).toEqual([pair.span_id]);
      expect(span.quote_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("pairs a supported claim with its own span and an unsupported claim with a near miss", () => {
    const resolved = resolvePairs(BUNDLE);
    const claims = JSON.parse(readFileSync(path.join(BUNDLE, "claims.json"), "utf8")) as { claims: { id: string; span_id: string }[] };
    const ownSpan = new Map(claims.claims.map((c) => [c.id, c.span_id]));
    for (const { pair, claim, span } of resolved) {
      if (pair.label === "supported") {
        expect(pair.span_id, `${pair.id} does not cite the claim's own span`).toBe(ownSpan.get(pair.claim_id));
        continue;
      }
      expect(pair.span_id, `${pair.id} cites the claim's own span, so it is not unsupported`).not.toBe(ownSpan.get(pair.claim_id));
      // A near miss, not an unrelated topic: the span neither contains the sentence nor is contained by it.
      expect(span.text.includes(claim.text), `${pair.id}'s span carries the sentence`).toBe(false);
      expect(claim.text.includes(span.text), `${pair.id}'s sentence carries the span`).toBe(false);
    }
  });

  it("refuses a pair the bundle cannot resolve rather than measuring 29 of 29", () => {
    const broken: EntailmentPair[] = [{ id: "EP-99-S", claim_id: "CLM-99999", span_id: "rev-0/p1/0-1", label: "supported", drawn_from: DRAFTING_CASE }];
    expect(() => resolvePairs(BUNDLE, broken)).toThrow("CLM-99999");
  });
});

describe("the acceptance arithmetic (at least 27 of 30, at most one false accept)", () => {
  it("passes the run that agrees with every label", () => {
    const result = scoreConfirmation(PAIRS, perfect(PAIRS));
    expect(result).toMatchObject({ agreements: 30, false_accepts: [], false_rejects: [], missing: [], passed: true });
  });

  it("passes at exactly the threshold: 27 agreements with one false accept", () => {
    // Two supported pairs called not entailed, one unsupported pair called entailed.
    const result = scoreConfirmation(PAIRS, withErrors(PAIRS, ["EP-01-S", "EP-02-S", "EP-01-U"]));
    expect(result.agreements).toBe(MIN_AGREEMENTS);
    expect(result.false_accepts).toEqual(["EP-01-U"]);
    expect(result.false_rejects).toEqual(["EP-01-S", "EP-02-S"]);
    expect(result.passed).toBe(true);
  });

  it("fails one agreement below the threshold", () => {
    const result = scoreConfirmation(PAIRS, withErrors(PAIRS, ["EP-01-S", "EP-02-S", "EP-03-S", "EP-01-U"]));
    expect(result.agreements).toBe(MIN_AGREEMENTS - 1);
    expect(result.passed).toBe(false);
  });

  it("fails on two false accepts even when the agreements clear the threshold", () => {
    const result = scoreConfirmation(PAIRS, withErrors(PAIRS, ["EP-01-U", "EP-02-U"]));
    expect(result.agreements).toBe(28);
    expect(result.false_accepts).toHaveLength(MAX_FALSE_ACCEPTS + 1);
    expect(result.passed, "28 of 30 passed with two false accepts, which the criterion caps at one").toBe(false);
  });

  it("counts a pair the verifier did not answer as a disagreement, never as a pass", () => {
    const result = scoreConfirmation(PAIRS, perfect(PAIRS).slice(0, 26));
    expect(result.missing).toHaveLength(4);
    expect(result.agreements).toBe(26);
    expect(result.passed).toBe(false);
  });

  it("scores a run that returns nothing at zero", () => {
    const result = scoreConfirmation(PAIRS, []);
    expect(result).toMatchObject({ agreements: 0, passed: false });
    expect(result.missing).toHaveLength(30);
  });
});

describe("runConfirmation, the shape the live run takes", () => {
  it("sends one batched, question-blind artefact and scores what comes back", async () => {
    let sent: { claims: number; spans: number; text: string[] } | null = null;
    const result = await runConfirmation(BUNDLE, async (claims, spansById) => {
      sent = { claims: claims.length, spans: spansById.size, text: claims.map((c) => c.text) };
      return perfect(PAIRS);
    });
    expect(sent).not.toBeNull();
    const observed = sent as unknown as { claims: number; spans: number; text: string[] };
    expect(observed.claims).toBe(30);
    // 15 claims over 15 documents, and the workbook near misses are shared, so the span set is smaller than 30.
    expect(observed.spans).toBeGreaterThan(15);
    expect(observed.text.every((t) => t.length > 0)).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("reports a verifier that accepts everything as fifteen false accepts", async () => {
    const result = await runConfirmation(BUNDLE, async (claims) =>
      claims.map((c) => ({ sentence_id: c.id, verdict: "entailed" as const, span_id: null, reason: "stub accepts everything" })),
    );
    expect(result.agreements).toBe(15);
    expect(result.false_accepts).toHaveLength(15);
    expect(result.passed).toBe(false);
  });
});
