// Family: opls.json (blueprint 9.5 Opl, OplStep, TroubleshootingRow), a seed-time artefact (D-17): the parsed
// lessons with their section hashes, the steps under source_hash (rendered verbatim, AC-ANS-05) and the
// troubleshooting rows. Absent under --public-only.
import type { Tx } from "@/db/client";
import { opl, oplStep, troubleshootingRow } from "@/db/schema";
import type { Bundle } from "@/gates/g1";
import { upsert, type FamilyResult } from "./upsert";

export async function seedLessons(tx: Tx, b: Bundle): Promise<FamilyResult> {
  if (b.opls === null) {
    return { rows: { opl: 0, opl_step: 0, troubleshooting_row: 0 }, notes: ["opls.json absent (public release): no lesson written"] };
  }
  const lessons = await upsert(
    tx,
    opl,
    b.opls.lessons.map((o) => ({
      documentRevisionId: o.document_revision_id,
      oplId: o.opl_id,
      title: o.title,
      discipline: o.discipline,
      equipmentTag: o.equipment_tag,
      areaUnit: o.area_unit,
      relatedInterlockText: o.related_interlock_text,
      pidRef: o.pid_ref,
      classification: o.classification,
      aspect: o.aspect,
      sections: o.sections,
      permitLines: o.permit_lines,
      footer: o.footer,
      machineDrafted: o.machine_drafted,
      approverAlias: o.approver_alias,
    })),
    [opl.oplId],
  );
  const steps = await upsert(
    tx,
    oplStep,
    b.opls.steps.map((s) => ({
      oplId: s.opl_id,
      n: s.n,
      actionText: s.action_text,
      acceptanceCriterion: s.acceptance_criterion,
      sourceHash: s.source_hash,
      spanId: s.span_id,
    })),
    [oplStep.oplId, oplStep.n],
  );
  const rows = await upsert(
    tx,
    troubleshootingRow,
    b.opls.troubleshooting_rows.map((r) => ({
      oplId: r.opl_id,
      n: r.n,
      problem: r.problem,
      cause: r.cause,
      action: r.action,
      quotedWoNumber: r.quoted_wo_number,
      truncated: r.truncated,
    })),
    [troubleshootingRow.oplId, troubleshootingRow.n],
  );
  return { rows: { opl: lessons, opl_step: steps, troubleshooting_row: rows } };
}
