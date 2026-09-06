// The seeded path (blueprint 9.17, 9.8; ARCHITECTURE 7 step 2; AC-UI-05, AC-NFR-15): a question whose canonical
// form equals a seeded_chip.question is answered from the chip's stored answer_trace packet with zero provider
// calls, both stream lines rebuilt from storage, mode "seeded" as the stored packet carries it, and a new trace row
// that references the stored packet under the asking user's alias. The 24 chips are read in one select and compared
// in code, since the canonical form is not a SQL function.
import { eq } from "drizzle-orm";
import type { Citation, EvidencePacket } from "@/contracts/generated/evidence_packet";
import type { AnswerTrace } from "@/contracts/generated/serving";
import { db } from "@/db/client";
import { answerTrace, seededChip } from "@/db/schema";
import { canonical } from "@/rulepack";
import { toAnswerTrace } from "./trace";

export type Seeded = {
  chip: { id: string; equipment_tag: string; question: string; golden_case_id: string | null; trace_id: string };
  trace: AnswerTrace;
};

export async function findSeeded(question: string): Promise<Seeded | null> {
  const wanted = canonical(question);
  const chips = await db.select().from(seededChip);
  const chip = chips.find((c) => canonical(c.question) === wanted);
  if (chip === undefined) return null;
  const [row] = await db.select().from(answerTrace).where(eq(answerTrace.id, chip.traceId)).limit(1);
  if (row === undefined) return null;
  return {
    chip: { id: chip.id, equipment_tag: chip.equipmentTag, question: chip.question, golden_case_id: chip.goldenCaseId, trace_id: chip.traceId },
    trace: toAnswerTrace(row),
  };
}

/** The evidence of a stored packet: its distinct citations in packet order (claims, typed facts, abstention, contradictions). */
export function evidenceOf(packet: EvidencePacket): Citation[] {
  const all: Citation[] = [
    ...packet.claims.flatMap((c) => c.citations),
    ...packet.typed_facts.map((f) => f.source),
    ...(packet.abstention?.nearest_documents ?? []),
    ...(packet.abstention?.served_beside.map((f) => f.source) ?? []),
    ...packet.contradictions.flatMap((c) => [...c.readings.map((r) => r.citation), c.governing_document]),
  ];
  const seen = new Set<string>();
  return all.filter((c) => (seen.has(c.span_id) ? false : (seen.add(c.span_id), true)));
}

/** The new trace row for a seeded answer: the stored decisions and packet, the asking user's alias, a fresh id and time. */
export function seededTrace(seeded: Seeded, traceId: string, question: string, userAlias: string, serverTs: Date): AnswerTrace {
  return { ...seeded.trace, id: traceId, question, user_alias: userAlias, server_ts: serverTs.toISOString() };
}
