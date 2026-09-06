// Family: integrity_findings.json (blueprint surface 9, ARCHITECTURE 3.1 integrity_finding, AC-INT-01/02). Every
// finding lands in state open bound to the seeded version. Two bundle fields do not fit the table as declared and
// are reported, never invented: a finding without a document_id (the CD-16 area-naming observations, which span
// several documents) is written with a null document_id and a null discipline stays null; the notes state both counts as the
// empty string because the column is NOT NULL. safety_function is the bundle's sequence id or null, stored as the
// boolean mark the table declares.
import type { Tx } from "@/db/client";
import { integrityFinding } from "@/db/schema";
import type { Bundle } from "@/gates/g1";
import { upsert, type FamilyResult } from "./upsert";

export async function seedRegister(tx: Tx, b: Bundle, versionId: string): Promise<FamilyResult> {
  if (b.integrity === null) throw new Error("integrity_findings.json was not read; G1 admits no bundle without it");
  const withDocument = b.integrity.findings;
  const withoutDocument = withDocument.filter((f) => f.document_id === null).length;
  const noDiscipline = withDocument.filter((f) => f.discipline === null).length;
  const n = await upsert(
    tx,
    integrityFinding,
    withDocument.map((f) => ({
      id: f.id,
      ruleId: f.rule_id,
      severity: f.severity,
      rule: typeof f.rule === "string" ? f.rule : null,
      discipline: f.discipline ?? null,
      documentId: f.document_id ?? null,
      spanId: f.span_id,
      state: f.state,
      safetyFunction: f.safety_function !== null,
      routingRecommendation: f.routing_recommendation,
      observationOnly: f.observation_only === true,
      unit: typeof f.unit === "string" ? f.unit : null,
      basis: typeof f.basis === "string" ? f.basis : null,
      item: typeof f.item === "object" && f.item !== null ? (f.item as Record<string, unknown>) : null,
      corpusVersionId: versionId,
    })),
    [integrityFinding.id],
  );
  const notes: string[] = [];
  if (withoutDocument > 0) notes.push(`integrity_finding: ${withoutDocument} area observations carry no document_id (written with null, as the register states)`);
  if (noDiscipline > 0) notes.push(`integrity_finding: ${noDiscipline} findings carry no discipline (written with null)`);
  return { rows: { integrity_finding: n }, notes };
}
