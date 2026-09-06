// Family: interlocks.json, datasheet_params.json, datasheet_spot.json, pid_sidecars/ (blueprint 9.3). The 24
// spot pins are DatasheetParam rows under group "datasheet_spot" with their own ids, so they land in
// datasheet_param beside the 307 parsed parameters. The eight M0 equipment rows are upserted by tag.
import type { Tx } from "@/db/client";
import { datasheetParam, equipment, instrumentTag, interlock, interlockRow, pidSidecar, startPermissive } from "@/db/schema";
import type { Bundle } from "@/gates/g1";
import { upsert, type FamilyResult } from "./upsert";

export async function seedAssets(tx: Tx, b: Bundle): Promise<FamilyResult> {
  const il = b.interlocks;
  const equipmentRows = await upsert(
    tx,
    equipment,
    il.equipment.map((e) => ({
      tag: e.tag,
      name: e.name,
      functionalLocation: e.functional_location,
      areaCode: e.area_code,
      service: e.service,
      criticalityDatasheet: e.criticality_datasheet,
      criticalityWorkbook: e.criticality_workbook,
      interlockRef: e.interlock_ref,
      datasheetDocNo: e.datasheet_doc_no,
      gaDrawingDocNo: e.ga_drawing_doc_no,
      pidDocumentId: e.pid_document_id,
      plotPlanDocNo: e.plot_plan_doc_no,
      ceDocNo: e.ce_doc_no,
    })),
    [equipment.tag],
  );
  const interlocks = await upsert(
    tx,
    interlock,
    il.interlocks.map((i) => ({
      seqId: i.seq_id,
      equipmentTag: i.equipment_tag,
      logicKind: i.logic_kind,
      silSheet: i.sil_sheet,
      ceDocNo: i.ce_doc_no,
      ceRevision: i.ce_revision,
      notes: i.notes,
      permissiveGate: i.permissive_gate,
    })),
    [interlock.equipmentTag, interlock.ceDocNo],
  );
  const rows = await upsert(
    tx,
    interlockRow,
    il.rows.map((r) => ({
      id: r.id,
      seqId: r.seq_id,
      equipmentTag: r.equipment_tag,
      rowId: r.row_id,
      rowKind: r.row_kind,
      initiator: r.initiator,
      instrumentTag: r.instrument_tag,
      setpointValue: r.setpoint_value,
      setpointUnit: r.setpoint_unit,
      comparator: r.comparator,
      setpointText: r.setpoint_text,
      voting: r.voting,
      voteCellText: r.vote_cell_text,
      effects: r.effects,
      effectsBasis: r.effects_basis,
      sourcePage: r.source_page,
      spanId: r.span_id,
    })),
    [interlockRow.id],
  );
  const permissives = await upsert(
    tx,
    startPermissive,
    il.permissives.map((p) => ({
      seqId: p.seq_id,
      n: p.n,
      text: p.text,
      signalTag: p.signal_tag,
      standingBypassState: p.standing_bypass_state,
      spanId: p.span_id,
    })),
    [startPermissive.seqId, startPermissive.n],
  );
  const params = await upsert(
    tx,
    datasheetParam,
    [...b.datasheetParams, ...b.datasheetSpot].map((p) => ({
      id: p.id,
      equipmentTag: p.equipment_tag,
      group: p.group,
      field: p.field,
      unit: p.unit,
      valueText: p.value_text,
      valueNum: p.value_num,
      spanId: p.span_id,
    })),
    [datasheetParam.id],
  );
  const tags = await upsert(
    tx,
    instrumentTag,
    il.instrument_tags.map((t) => ({ tag: t.tag, equipmentTag: t.equipment_tag, role: t.role, sources: t.sources })),
    [instrumentTag.tag],
  );
  const sidecars = await upsert(
    tx,
    pidSidecar,
    b.sidecars.map((s) => ({
      set: s.set,
      documentId: s.document_id,
      titleBox: s.title_box,
      referenceBox: s.reference_box,
      notes: s.notes,
      equipmentShown: s.equipment_shown,
      hotspots: s.hotspots,
      defects: s.defects,
      provenance: s.provenance,
    })),
    [pidSidecar.set],
  );
  return {
    rows: {
      equipment: equipmentRows,
      interlock: interlocks,
      interlock_row: rows,
      start_permissive: permissives,
      datasheet_param: params,
      instrument_tag: tags,
      pid_sidecar: sidecars,
    },
  };
}
