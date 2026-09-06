// Family: work_orders.json, failure_events.json, families.json, chains.json, proof_tests.json, bom.json
// (blueprint 9.4). Work orders first; the causal links are the package artefact of the frozen rule, never
// recomputed here.
import type { Tx } from "@/db/client";
import { bomItem, bomMatch, causalLink, failureEvent, failureFamily, proofTest, workOrder } from "@/db/schema";
import type { Bundle } from "@/gates/g1";
import { upsert, type FamilyResult } from "./upsert";

export async function seedOperations(tx: Tx, b: Bundle): Promise<FamilyResult> {
  const workOrders = await upsert(
    tx,
    workOrder,
    b.workOrders.map((w) => ({
      woNumber: w.wo_number,
      notificationNo: w.notification_no,
      reportDate: w.report_date,
      startDate: w.start_date,
      completionDate: w.completion_date,
      status: w.status,
      equipmentTag: w.equipment_tag,
      workType: w.work_type,
      discipline: w.discipline,
      priority: w.priority,
      criticality: w.criticality,
      problemDescription: w.problem_description,
      rootCause: w.root_cause,
      correctiveAction: w.corrective_action,
      sparePartsUsed: w.spare_parts_used,
      breakdown: w.breakdown,
      downtimeHours: w.downtime_hours,
      laborHours: w.labor_hours,
      laborCostIdr: w.labor_cost_idr,
      materialCostIdr: w.material_cost_idr,
      totalCostIdr: w.total_cost_idr,
      reportedByAlias: w.reported_by_alias,
      executedByAlias: w.executed_by_alias,
      approvedByAlias: w.approved_by_alias,
      relatedInterlock: w.related_interlock,
      remarks: w.remarks,
      closeoutComplete: w.closeout_complete,
      completenessFlags: w.completeness_flags,
      breakdownKind: w.breakdown_kind,
      notificationLeadHours: w.notification_lead_hours,
    })),
    [workOrder.woNumber],
  );
  const events = await upsert(
    tx,
    failureEvent,
    b.failureEvents.map((e) => ({
      woNumber: e.wo_number,
      equipmentTag: e.equipment_tag,
      reportDate: e.report_date,
      downtimeHours: e.downtime_hours,
      maintenanceCostIdr: e.maintenance_cost_idr,
      breakdownKind: e.breakdown_kind,
    })),
    [failureEvent.woNumber],
  );
  const families = await upsert(
    tx,
    failureFamily,
    b.families.map((f) => ({ id: f.id, label: f.label, basis: f.basis, reviewStatus: f.review_status, members: f.members })),
    [failureFamily.id],
  );
  const links = await upsert(
    tx,
    causalLink,
    b.chains.map((l) => ({
      id: l.id,
      fromWo: l.from_wo,
      toWo: l.to_wo,
      equipmentTag: l.equipment_tag,
      mechanismNoun: l.mechanism_noun,
      intervalDays: l.interval_days,
      linkingSentence: l.linking_sentence,
      linkingField: l.linking_field,
      spanId: l.span_id,
    })),
    [causalLink.id],
  );
  const tests = await upsert(
    tx,
    proofTest,
    b.proofTests.map((t) => ({
      woNumber: t.wo_number,
      equipmentTag: t.equipment_tag,
      seqId: t.seq_id,
      deviceTag: t.device_tag,
      testClass: t.test_class,
      completionDate: t.completion_date,
      resultText: t.result_text,
      asFound: t.as_found,
      asLeft: t.as_left,
    })),
    [proofTest.woNumber],
  );
  const items = await upsert(
    tx,
    bomItem,
    b.bom.items.map((i) => ({
      id: i.id,
      equipmentTag: i.equipment_tag,
      gaDrawingDocNo: i.ga_drawing_doc_no,
      itemNo: i.item_no,
      description: i.description,
      material: i.material,
      quantity: i.quantity,
      spanId: i.span_id,
    })),
    [bomItem.id],
  );
  const matches = await upsert(
    tx,
    bomMatch,
    b.bom.matches.map((m) => ({
      woNumber: m.wo_number,
      partString: m.part_string,
      bomItemId: m.bom_item_id,
      alternativeBomItemId: m.alternative_bom_item_id,
      disambiguatorText: m.disambiguator_text,
      status: m.status,
    })),
    [bomMatch.woNumber, bomMatch.partString],
  );
  return {
    rows: {
      work_order: workOrders,
      failure_event: events,
      failure_family: families,
      causal_link: links,
      proof_test: tests,
      bom_item: items,
      bom_match: matches,
    },
  };
}
