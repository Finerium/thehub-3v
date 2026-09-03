// Drizzle schema for The Hub: every table of blueprint section 9 (FROZEN) with the blueprint's field names verbatim
// as snake_case columns (ARCHITECTURE section 3). Two Postgres schemas: `public` for everything the retrieval path
// may read and `draft` for section 9.6 (INV-1 "drafts physically separate"). Closed enums are pgEnum values pinned
// from the generated Zod modules (src/contracts/generated, ARCHITECTURE 1.4), so the database, the Zod boundary and
// the harness contracts cannot drift apart. Nested arrays and objects no query filters on are jsonb typed by the
// same Zod modules. Timestamps are timestamptz, money is bigint rupiah, hours are numeric(6,1).
import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import * as asset from "../contracts/generated/asset";
import * as coverage from "../contracts/generated/coverage";
import * as document from "../contracts/generated/document";
import * as drafts from "../contracts/generated/drafts";
import * as gateway from "../contracts/generated/gateway";
import * as operations from "../contracts/generated/operations";
import * as serving from "../contracts/generated/serving";
import { EMBEDDING_DIM } from "./embedding";

// The enum values of a generated Zod enum as the non-empty tuple pgEnum wants; one source for both layers.
const pin = <T extends string>(e: { options: readonly T[] }) => e.options as unknown as readonly [T, ...T[]];

// pgvector column with the pinned dimension (9.2 Chunk.embedding, ADR-009); the driver speaks the "[x,y,z]" text form.
const embeddingVector = customType<{ data: number[]; driverData: string }>({
  dataType: () => `vector(${EMBEDDING_DIM})`,
  toDriver: (value) => `[${value.join(",")}]`,
  fromDriver: (value) => value.slice(1, -1).split(",").map(Number),
});
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

const hours = (name: string) => numeric(name, { precision: 6, scale: 1, mode: "number" });
const idr = (name: string) => bigint(name, { mode: "number" });
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// ---------------------------------------------------------------------------------------------------------------
// Enums (public)
// ---------------------------------------------------------------------------------------------------------------
export const documentClass = pgEnum("document_class", pin(document.DocumentClass));
export const approvalStatus = pgEnum("approval_status", pin(document.ApprovalStatus));
export const edgeKind = pgEnum("edge_kind", pin(document.DocumentEdge.shape.edge_kind));
export const claimKind = pgEnum("claim_kind", pin(document.Claim.shape.claim_kind));
export const unitKind = pgEnum("unit_kind", pin(document.Chunk.shape.unit_kind));
export const criticality = pgEnum("criticality", pin(asset.Equipment.shape.criticality_datasheet));
export const logicKind = pgEnum("logic_kind", pin(asset.Interlock.shape.logic_kind));
export const permissiveGate = pgEnum("permissive_gate", pin(asset.Interlock.shape.permissive_gate.unwrap()));
export const rowKind = pgEnum("row_kind", pin(asset.InterlockRow.shape.row_kind));
export const comparator = pgEnum("comparator", pin(asset.InterlockRow.shape.comparator.unwrap()));
export const instrumentRole = pgEnum("instrument_role", pin(asset.InstrumentTag.shape.role));
export const workType = pgEnum("work_type", pin(operations.WorkOrder.shape.work_type));
export const discipline = pgEnum("discipline", pin(operations.WorkOrder.shape.discipline));
export const priority = pgEnum("priority", pin(operations.WorkOrder.shape.priority));
export const breakdownKind = pgEnum("breakdown_kind", pin(operations.WorkOrder.shape.breakdown_kind));
export const familyBasis = pgEnum("family_basis", pin(operations.FailureFamily.shape.basis));
export const reviewStatus = pgEnum("review_status", pin(operations.FailureFamily.shape.review_status));
export const linkingField = pgEnum("linking_field", pin(operations.CausalLink.shape.linking_field));
export const testClass = pgEnum("test_class", pin(operations.ProofTest.shape.test_class));
export const bomMatchStatus = pgEnum("bom_match_status", pin(operations.BomMatch.shape.status));
export const labelsStatus = pgEnum("labels_status", pin(coverage.CoverageMethod.shape.labels_status));
export const coverageLayer = pgEnum("coverage_layer", pin(coverage.CoverageAssessment.shape.layer));
export const matchedField = pgEnum("matched_field", pin(coverage.CoverageAssessment.shape.matched_field.unwrap()));
export const coveragePopulation = pgEnum("coverage_population", pin(coverage.CoverageSummary.shape.population));
export const oplClassification = pgEnum("opl_classification", pin(coverage.Opl.shape.classification));
export const integrityState = pgEnum("integrity_state", ["open", "resolved"]); // ARCHITECTURE 13, decision 3
export const role = pgEnum("role", pin(serving.Role));
export const languageDetected = pgEnum("language_detected", pin(serving.AnswerTrace.shape.language_detected));
export const answerTemplate = pgEnum("answer_template", pin(serving.AnswerTrace.shape.template.unwrap()));
export const answerOutcome = pgEnum("answer_outcome", pin(serving.AnswerTrace.shape.outcome));
export const evaluationTier = pgEnum("evaluation_tier", pin(serving.EvaluationRun.shape.tier));
export const evaluationVerdict = pgEnum("evaluation_verdict", pin(serving.EvaluationResult.shape.verdict));
export const auditActorRole = pgEnum("audit_actor_role", pin(serving.AuditEvent.shape.actor_role));
export const auditAction = pgEnum("audit_action", pin(serving.AuditAction));
export const gatewayOutcome = pgEnum("gateway_outcome", pin(gateway.GatewayCall.shape.outcome));

// ---------------------------------------------------------------------------------------------------------------
// 9.7 Corpus versions (first: nearly everything carries corpus_version_id)
// ---------------------------------------------------------------------------------------------------------------
export const corpusVersion = pgTable(
  "corpus_version",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    manifestSha256: text("manifest_sha256").notNull(),
    corpusSha256: text("corpus_sha256").notNull(),
    extractor: text("extractor").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    embeddingDim: integer("embedding_dim").notNull(),
    modelPins: jsonb("model_pins").$type<serving.CorpusVersion["model_pins"]>().notNull(),
    createdByAlias: text("created_by_alias").notNull(),
    createdAt: timestamptz("created_at").notNull(),
    activatedByAlias: text("activated_by_alias"),
    activatedAt: timestamptz("activated_at"),
    parentVersionId: text("parent_version_id").references((): AnyPgColumn => corpusVersion.id),
  },
  (t) => [
    // exactly one active version (9.7)
    uniqueIndex("corpus_version_one_active").on(t.isActive).where(sql`${t.isActive}`),
  ],
);

// ---------------------------------------------------------------------------------------------------------------
// 9.2 Corpus entities
// ---------------------------------------------------------------------------------------------------------------
export const documentTable = pgTable("document", {
  id: text("id").primaryKey(),
  docNo: text("doc_no"),
  class: documentClass("class").notNull(),
  subjectTag: text("subject_tag"),
  sha256: text("sha256").notNull().unique(),
  sourcePath: text("source_path").notNull(),
  pageCount: integer("page_count").notNull(),
  fileMarker: text("file_marker"),
});

export const documentRevision = pgTable(
  "document_revision",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documentTable.id),
    revision: text("revision").notNull(),
    approvalStatus: approvalStatus("approval_status").notNull(),
    approvalStatusText: text("approval_status_text").notNull(),
    revisionDate: text("revision_date"),
    preparedByAlias: text("prepared_by_alias"),
    reviewedByAlias: text("reviewed_by_alias"),
    approvedByAlias: text("approved_by_alias"),
    dateOfSharing: text("date_of_sharing"),
    isCurrent: boolean("is_current").notNull(),
    corpusVersionId: text("corpus_version_id")
      .notNull()
      .references(() => corpusVersion.id),
  },
  (t) => [
    uniqueIndex("one_current_revision").on(t.documentId).where(sql`${t.isCurrent}`),
    index("document_revision_document_idx").on(t.documentId),
  ],
);

export const span = pgTable(
  "span",
  {
    id: text("id").primaryKey(),
    documentRevisionId: text("document_revision_id")
      .notNull()
      .references(() => documentRevision.id),
    page: integer("page").notNull(),
    anchorText: text("anchor_text").notNull(),
    quoteHash: char("quote_hash", { length: 64 }).notNull(),
    startOrdinal: integer("start_ordinal").notNull(),
    endOrdinal: integer("end_ordinal").notNull(),
  },
  (t) => [index("span_document_revision_idx").on(t.documentRevisionId)],
);

export const documentEdge = pgTable(
  "document_edge",
  {
    fromDocumentId: text("from_document_id")
      .notNull()
      .references(() => documentTable.id),
    toDocumentId: text("to_document_id")
      .notNull()
      .references(() => documentTable.id),
    edgeKind: edgeKind("edge_kind").notNull(),
    sourceSpanId: text("source_span_id")
      .notNull()
      .references(() => span.id),
  },
  (t) => [primaryKey({ name: "document_edge_pk", columns: [t.fromDocumentId, t.toDocumentId, t.edgeKind, t.sourceSpanId] })],
);

export const claim = pgTable(
  "claim",
  {
    id: text("id").primaryKey(),
    spanId: text("span_id")
      .notNull()
      .references(() => span.id),
    entityBinding: text("entity_binding").notNull(),
    claimKind: claimKind("claim_kind").notNull(),
    valueText: text("value_text").notNull(),
    extractedBy: jsonb("extracted_by").$type<document.Claim["extracted_by"]>().notNull(),
  },
  (t) => [index("claim_span_idx").on(t.spanId)],
);

export const chunk = pgTable(
  "chunk",
  {
    id: text("id").primaryKey(),
    documentRevisionId: text("document_revision_id")
      .notNull()
      .references(() => documentRevision.id),
    page: integer("page").notNull(),
    ordinal: integer("ordinal").notNull(),
    unitKind: unitKind("unit_kind").notNull(),
    text: text("text").notNull(),
    quoteHash: char("quote_hash", { length: 64 }).notNull(),
    embedding: embeddingVector("embedding").notNull(),
    // storage-only lexical index over the chunk text (ARCHITECTURE 3.1); never on the wire
    textTsv: tsvector("text_tsv").generatedAlwaysAs((): SQL => sql`to_tsvector('simple', "text")`),
  },
  (t) => [
    unique("chunk_revision_page_ordinal").on(t.documentRevisionId, t.page, t.ordinal),
    index("chunk_text_tsv_gin").using("gin", t.textTsv),
    index("chunk_embedding_hnsw").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

// Metadata-free page renders served one at a time to a role (ADR-010, ADR-011; ARCHITECTURE 3.1)
export const pageDerivative = pgTable(
  "page_derivative",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documentTable.id),
    page: integer("page").notNull(),
    width: integer("width").notNull(),
    format: text("format").notNull(),
    sourceSha256: text("source_sha256").notNull(),
    bytes: bytea("bytes").notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.page, t.width] })],
);

// ---------------------------------------------------------------------------------------------------------------
// 9.3 Asset and safety graph
// ---------------------------------------------------------------------------------------------------------------
export const area = pgTable("area", {
  code: text("code").primaryKey(),
  workbookName: text("workbook_name").notNull(),
  datasheetName: text("datasheet_name").notNull(),
  oplHeaderName: text("opl_header_name").notNull(),
  plotPlanTitleName: text("plot_plan_title_name").notNull(),
});

export const equipment = pgTable("equipment", {
  tag: text("tag").primaryKey(),
  name: text("name").notNull(),
  functionalLocation: text("functional_location").notNull(),
  areaCode: text("area_code")
    .notNull()
    .references(() => area.code),
  service: text("service").notNull(),
  criticalityDatasheet: criticality("criticality_datasheet").notNull(),
  criticalityWorkbook: text("criticality_workbook").notNull(),
  interlockRef: text("interlock_ref").notNull(),
  datasheetDocNo: text("datasheet_doc_no").notNull(),
  gaDrawingDocNo: text("ga_drawing_doc_no").notNull(),
  pidDocumentId: text("pid_document_id")
    .notNull()
    .references(() => documentTable.id),
  plotPlanDocNo: text("plot_plan_doc_no").notNull(),
  ceDocNo: text("ce_doc_no").notNull(),
});

export const interlock = pgTable(
  "interlock",
  {
    seqId: text("seq_id"),
    equipmentTag: text("equipment_tag")
      .notNull()
      .references(() => equipment.tag),
    logicKind: logicKind("logic_kind").notNull(),
    silSheet: integer("sil_sheet"),
    ceDocNo: text("ce_doc_no").notNull(),
    ceRevision: text("ce_revision").notNull(),
    notes: jsonb("notes").$type<asset.Interlock["notes"]>().notNull(),
    permissiveGate: permissiveGate("permissive_gate"),
  },
  (t) => [
    primaryKey({ columns: [t.equipmentTag, t.ceDocNo] }),
    unique("interlock_seq_id").on(t.seqId), // unique where not null: Postgres treats nulls as distinct
  ],
);

export const interlockRow = pgTable(
  "interlock_row",
  {
    id: text("id").primaryKey(),
    seqId: text("seq_id"),
    equipmentTag: text("equipment_tag")
      .notNull()
      .references(() => equipment.tag),
    rowId: text("row_id").notNull(),
    rowKind: rowKind("row_kind").notNull(),
    initiator: text("initiator").notNull(),
    instrumentTag: text("instrument_tag").notNull(),
    setpointValue: doublePrecision("setpoint_value"),
    setpointUnit: text("setpoint_unit"),
    comparator: comparator("comparator"),
    setpointText: text("setpoint_text").notNull(),
    voting: text("voting"),
    voteCellText: text("vote_cell_text").notNull(),
    effects: jsonb("effects").$type<asset.InterlockRow["effects"]>().notNull(),
    effectsBasis: text("effects_basis").notNull(),
    sourcePage: integer("source_page").notNull(),
    spanId: text("span_id")
      .notNull()
      .references(() => span.id),
  },
  (t) => [
    index("interlock_row_equipment_idx").on(t.equipmentTag),
    check("interlock_row_voting_trip_only", sql`${t.rowKind} = 'trip' OR ${t.voting} IS NULL`),
  ],
);

export const startPermissive = pgTable(
  "start_permissive",
  {
    seqId: text("seq_id").notNull(),
    n: integer("n").notNull(),
    text: text("text").notNull(),
    signalTag: text("signal_tag"),
    standingBypassState: text("standing_bypass_state"),
    spanId: text("span_id")
      .notNull()
      .references(() => span.id),
  },
  (t) => [primaryKey({ columns: [t.seqId, t.n] })],
);

export const datasheetParam = pgTable(
  "datasheet_param",
  {
    id: text("id").primaryKey(),
    equipmentTag: text("equipment_tag")
      .notNull()
      .references(() => equipment.tag),
    group: text("group").notNull(),
    field: text("field").notNull(),
    unit: text("unit"),
    valueText: text("value_text").notNull(),
    valueNum: doublePrecision("value_num"),
    spanId: text("span_id")
      .notNull()
      .references(() => span.id),
  },
  (t) => [index("datasheet_param_equipment_idx").on(t.equipmentTag)],
);

export const instrumentTag = pgTable(
  "instrument_tag",
  {
    tag: text("tag").primaryKey(),
    equipmentTag: text("equipment_tag")
      .notNull()
      .references(() => equipment.tag),
    role: instrumentRole("role").notNull(),
    sources: text("sources").array().notNull(),
  },
  (t) => [index("instrument_tag_equipment_idx").on(t.equipmentTag)],
);

export const pidSidecar = pgTable("pid_sidecar", {
  set: integer("set").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documentTable.id),
  titleBox: text("title_box").notNull(),
  referenceBox: text("reference_box").notNull(),
  notes: text("notes").array().notNull(),
  equipmentShown: text("equipment_shown").array().notNull(),
  hotspots: jsonb("hotspots").$type<asset.PidSidecar["hotspots"]>().notNull(),
  defects: jsonb("defects").$type<asset.PidSidecar["defects"]>().notNull(),
  // D-12: adopted sidecars carry basis "agent_transcription" with review_status "pending"
  provenance: jsonb("provenance").$type<asset.PidSidecar["provenance"]>().notNull(),
});

// ---------------------------------------------------------------------------------------------------------------
// 9.4 Operations and failure
// ---------------------------------------------------------------------------------------------------------------
export const workOrder = pgTable(
  "work_order",
  {
    woNumber: text("wo_number").primaryKey(),
    notificationNo: text("notification_no").notNull(),
    reportDate: text("report_date").notNull(),
    startDate: text("start_date").notNull(),
    completionDate: text("completion_date").notNull(),
    status: text("status").notNull(),
    equipmentTag: text("equipment_tag")
      .notNull()
      .references(() => equipment.tag),
    workType: workType("work_type").notNull(),
    discipline: discipline("discipline").notNull(),
    priority: priority("priority").notNull(),
    criticality: text("criticality").notNull(),
    problemDescription: text("problem_description").notNull(),
    rootCause: text("root_cause").notNull(),
    correctiveAction: text("corrective_action").notNull(),
    sparePartsUsed: text("spare_parts_used").notNull(),
    breakdown: boolean("breakdown").notNull(),
    downtimeHours: hours("downtime_hours"),
    laborHours: hours("labor_hours"),
    laborCostIdr: idr("labor_cost_idr"),
    materialCostIdr: idr("material_cost_idr"),
    totalCostIdr: idr("total_cost_idr"),
    reportedByAlias: text("reported_by_alias").notNull(),
    executedByAlias: text("executed_by_alias").notNull(),
    approvedByAlias: text("approved_by_alias").notNull(),
    relatedInterlock: text("related_interlock"),
    remarks: text("remarks"),
    closeoutComplete: boolean("closeout_complete").notNull(),
    completenessFlags: jsonb("completeness_flags").$type<operations.WorkOrder["completeness_flags"]>().notNull(),
    breakdownKind: breakdownKind("breakdown_kind").notNull(),
    notificationLeadHours: hours("notification_lead_hours").notNull(),
  },
  (t) => [index("work_order_equipment_idx").on(t.equipmentTag)],
);

export const failureEvent = pgTable(
  "failure_event",
  {
    woNumber: text("wo_number")
      .primaryKey()
      .references(() => workOrder.woNumber),
    equipmentTag: text("equipment_tag")
      .notNull()
      .references(() => equipment.tag),
    reportDate: text("report_date").notNull(),
    downtimeHours: hours("downtime_hours"),
    maintenanceCostIdr: idr("maintenance_cost_idr"),
    breakdownKind: breakdownKind("breakdown_kind").notNull(),
  },
  (t) => [
    // FailureEvent.breakdown_kind is "unplanned" | "planned_flagged" (9.4), the work-order enum minus "none"
    check("failure_event_breakdown_kind", sql`${t.breakdownKind} <> 'none'`),
  ],
);

export const failureFamily = pgTable("failure_family", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  basis: familyBasis("basis").notNull(),
  reviewStatus: reviewStatus("review_status").notNull(),
  members: jsonb("members").$type<operations.FailureFamily["members"]>().notNull(),
});

// Package artefact of the frozen causal-link rule; never computed at answer time (9.4)
export const causalLink = pgTable(
  "causal_link",
  {
    id: text("id").primaryKey(),
    fromWo: text("from_wo")
      .notNull()
      .references(() => workOrder.woNumber),
    toWo: text("to_wo")
      .notNull()
      .references(() => workOrder.woNumber),
    equipmentTag: text("equipment_tag")
      .notNull()
      .references(() => equipment.tag),
    mechanismNoun: text("mechanism_noun").notNull(),
    intervalDays: integer("interval_days").notNull(),
    linkingSentence: text("linking_sentence").notNull(),
    linkingField: linkingField("linking_field").notNull(),
    spanId: text("span_id")
      .notNull()
      .references(() => span.id),
  },
  (t) => [index("causal_link_equipment_idx").on(t.equipmentTag)],
);

export const proofTest = pgTable("proof_test", {
  woNumber: text("wo_number")
    .primaryKey()
    .references(() => workOrder.woNumber),
  equipmentTag: text("equipment_tag")
    .notNull()
    .references(() => equipment.tag),
  seqId: text("seq_id"),
  deviceTag: text("device_tag"),
  testClass: testClass("test_class").notNull(),
  completionDate: text("completion_date").notNull(),
  resultText: text("result_text").notNull(),
  asFound: text("as_found"),
  asLeft: text("as_left"),
});

export const bomItem = pgTable(
  "bom_item",
  {
    id: text("id").primaryKey(),
    equipmentTag: text("equipment_tag")
      .notNull()
      .references(() => equipment.tag),
    gaDrawingDocNo: text("ga_drawing_doc_no").notNull(),
    itemNo: integer("item_no").notNull(),
    description: text("description").notNull(),
    material: text("material"),
    quantity: text("quantity"),
    spanId: text("span_id")
      .notNull()
      .references(() => span.id),
  },
  (t) => [index("bom_item_equipment_idx").on(t.equipmentTag)],
);

export const bomMatch = pgTable(
  "bom_match",
  {
    woNumber: text("wo_number")
      .notNull()
      .references(() => workOrder.woNumber),
    partString: text("part_string").notNull(),
    bomItemId: text("bom_item_id").references(() => bomItem.id),
    alternativeBomItemId: text("alternative_bom_item_id").references(() => bomItem.id),
    disambiguatorText: text("disambiguator_text"),
    status: bomMatchStatus("status").notNull(),
  },
  (t) => [primaryKey({ columns: [t.woNumber, t.partString] })],
);

// ---------------------------------------------------------------------------------------------------------------
// 9.5 Coverage, debt and lessons
// ---------------------------------------------------------------------------------------------------------------
export const opl = pgTable(
  "opl",
  {
    documentRevisionId: text("document_revision_id")
      .notNull()
      .unique()
      .references(() => documentRevision.id),
    oplId: text("opl_id").primaryKey(),
    title: text("title").notNull(),
    discipline: text("discipline").notNull(),
    equipmentTag: text("equipment_tag")
      .notNull()
      .references(() => equipment.tag),
    areaUnit: text("area_unit").notNull(),
    relatedInterlockText: text("related_interlock_text").notNull(),
    pidRef: text("pid_ref").notNull(),
    classification: oplClassification("classification").notNull(),
    aspect: text("aspect").notNull(),
    sections: jsonb("sections").$type<coverage.Opl["sections"]>().notNull(),
    permitLines: jsonb("permit_lines").$type<coverage.Opl["permit_lines"]>().notNull(),
    footer: jsonb("footer").$type<coverage.Opl["footer"]>().notNull(),
    machineDrafted: boolean("machine_drafted").notNull(),
    approverAlias: text("approver_alias"),
  },
  (t) => [index("opl_equipment_idx").on(t.equipmentTag)],
);

export const oplStep = pgTable(
  "opl_step",
  {
    oplId: text("opl_id")
      .notNull()
      .references(() => opl.oplId),
    n: integer("n").notNull(),
    actionText: text("action_text").notNull(),
    acceptanceCriterion: text("acceptance_criterion"),
    sourceHash: char("source_hash", { length: 64 }).notNull(),
    spanId: text("span_id")
      .notNull()
      .references(() => span.id),
  },
  (t) => [primaryKey({ columns: [t.oplId, t.n] })],
);

export const troubleshootingRow = pgTable(
  "troubleshooting_row",
  {
    oplId: text("opl_id")
      .notNull()
      .references(() => opl.oplId),
    n: integer("n").notNull(),
    problem: text("problem").notNull(),
    cause: text("cause").notNull(),
    action: text("action").notNull(),
    quotedWoNumber: text("quoted_wo_number"),
    truncated: boolean("truncated").notNull(),
  },
  (t) => [primaryKey({ columns: [t.oplId, t.n] })],
);

// One row per corpus version; the frozen recipe constants are CHECKed so no version can drift from 9.5
export const coverageMethod = pgTable(
  "coverage_method",
  {
    corpusVersionId: text("corpus_version_id")
      .primaryKey()
      .references(() => corpusVersion.id),
    recipeSha256: text("recipe_sha256").notNull(),
    stopListSha256: text("stop_list_sha256").notNull(),
    threshold: doublePrecision("threshold").notNull(),
    windowMultiplier: integer("window_multiplier").notNull(),
    minContentWords: integer("min_content_words").notNull(),
    comparison: text("comparison").notNull(),
    extractor: text("extractor").notNull(),
    strictSections: jsonb("strict_sections").$type<coverage.CoverageMethod["strict_sections"]>().notNull(),
    strictCutMarker: text("strict_cut_marker").notNull(),
    labelsStatus: labelsStatus("labels_status").notNull(),
    unscoreableIds: jsonb("unscoreable_ids").$type<coverage.CoverageMethod["unscoreable_ids"]>().notNull(),
  },
  (t) => [
    check("coverage_method_threshold", sql`${t.threshold} = 0.62`),
    check("coverage_method_window_multiplier", sql`${t.windowMultiplier} = 2`),
    check("coverage_method_min_content_words", sql`${t.minContentWords} = 3`),
  ],
);

export const coverageAssessment = pgTable(
  "coverage_assessment",
  {
    woNumber: text("wo_number")
      .notNull()
      .references(() => workOrder.woNumber),
    layer: coverageLayer("layer").notNull(),
    covered: boolean("covered").notNull(),
    bestRatio: doublePrecision("best_ratio").notNull(),
    threshold: doublePrecision("threshold").notNull(),
    matchedField: matchedField("matched_field"),
    matchedLesson: text("matched_lesson").references(() => opl.oplId),
    corpusVersionId: text("corpus_version_id")
      .notNull()
      .references(() => corpusVersion.id),
  },
  (t) => [primaryKey({ columns: [t.woNumber, t.layer, t.corpusVersionId] })],
);

export const coverageSummary = pgTable(
  "coverage_summary",
  {
    corpusVersionId: text("corpus_version_id")
      .notNull()
      .references(() => corpusVersion.id),
    population: coveragePopulation("population").notNull(),
    layer: coverageLayer("layer").notNull(),
    threshold: doublePrecision("threshold").notNull(),
    uncoveredCount: integer("uncovered_count").notNull(),
    populationCount: integer("population_count").notNull(),
    uncoveredBreakdowns: integer("uncovered_breakdowns").notNull(),
    uncoveredDowntimeHours: hours("uncovered_downtime_hours").notNull(),
    uncoveredCostIdr: idr("uncovered_cost_idr").notNull(),
    bands: jsonb("bands").$type<coverage.CoverageSummary["bands"]>(),
    sensitivity: jsonb("sensitivity").$type<coverage.CoverageSummary["sensitivity"]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.corpusVersionId, t.population, t.layer] })],
);

export const debtCluster = pgTable(
  "debt_cluster",
  {
    id: text("id").primaryKey(),
    equipmentTag: text("equipment_tag")
      .notNull()
      .references(() => equipment.tag),
    corpusVersionId: text("corpus_version_id")
      .notNull()
      .references(() => corpusVersion.id),
    uncoveredWoNumbers: text("uncovered_wo_numbers").array().notNull(),
    factors: jsonb("factors").$type<coverage.DebtCluster["factors"]>().notNull(),
    coefficients: jsonb("coefficients").$type<coverage.DebtCluster["coefficients"]>().notNull(),
    incompleteUncovered: integer("incomplete_uncovered").notNull(),
    score: doublePrecision("score").notNull(),
    rank: integer("rank").notNull(),
  },
  (t) => [unique("debt_cluster_version_equipment").on(t.corpusVersionId, t.equipmentTag)],
);

// Integrity Register findings (blueprint 6 surface 9, AC-INT-01/02); columns per ARCHITECTURE 3.1, totals pinned
// to fixtures.json. No owner, due date or completion metric exists (Case 1 only).
export const integrityFinding = pgTable(
  "integrity_finding",
  {
    id: text("id").primaryKey(),
    ruleId: text("rule_id").notNull(),
    severity: text("severity").notNull(),
    discipline: text("discipline").notNull(),
    documentId: text("document_id")
      .notNull()
      .references(() => documentTable.id),
    spanId: text("span_id").references(() => span.id),
    state: integrityState("state").notNull(),
    safetyFunction: boolean("safety_function").notNull(),
    routingRecommendation: text("routing_recommendation"),
    corpusVersionId: text("corpus_version_id")
      .notNull()
      .references(() => corpusVersion.id),
  },
  (t) => [index("integrity_finding_document_idx").on(t.documentId), index("integrity_finding_rule_idx").on(t.ruleId)],
);

// ---------------------------------------------------------------------------------------------------------------
// 9.7 Serving, evaluation, people and audit
// ---------------------------------------------------------------------------------------------------------------
export const appUser = pgTable("app_user", {
  id: text("id").primaryKey(),
  alias: text("alias").notNull(),
  role: role("role").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isDemo: boolean("is_demo").notNull(),
  lastLogin: timestamptz("last_login"),
});

// Frozen 9.7 type, kept as declared; never written in this run (D-07: login-free reviewer links are not built)
export const reviewerLink = pgTable(
  "reviewer_link",
  {
    id: text("id").primaryKey(),
    role: role("role").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => appUser.id),
    expiresAt: timestamptz("expires_at").notNull(),
    revoked: boolean("revoked").notNull(),
    signatureKeyVersion: integer("signature_key_version").notNull(),
  },
  (t) => [check("reviewer_link_role", sql`${t.role} <> 'Admin'`)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => appUser.id),
    createdAt: timestamptz("created_at").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    reviewerLinkId: text("reviewer_link_id").references(() => reviewerLink.id), // always null (D-07)
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

// The visitor's never-activated child version for the guided loop (ARCHITECTURE 8.5, AC-LOOP-13)
export const sessionSandbox = pgTable("session_sandbox", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => session.id, { onDelete: "cascade" }),
  corpusVersionId: text("corpus_version_id")
    .notNull()
    .references(() => corpusVersion.id),
});

// Immutable: no UPDATE path exists in code (AC-ANS-11)
export const answerTrace = pgTable("answer_trace", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  languageDetected: languageDetected("language_detected").notNull(),
  template: answerTemplate("template"),
  scope: jsonb("scope").$type<serving.AnswerTrace["scope"]>().notNull(),
  rulepack: jsonb("rulepack").$type<serving.AnswerTrace["rulepack"]>().notNull(),
  retrievedChunkIds: text("retrieved_chunk_ids").array().notNull(),
  prompts: jsonb("prompts").$type<serving.AnswerTrace["prompts"]>().notNull(),
  verifierVerdicts: jsonb("verifier_verdicts").$type<serving.AnswerTrace["verifier_verdicts"]>().notNull(),
  gateResults: jsonb("gate_results").$type<serving.AnswerTrace["gate_results"]>().notNull(),
  repairRounds: integer("repair_rounds").notNull(),
  confidence: jsonb("confidence").$type<serving.AnswerTrace["confidence"]>().notNull(),
  outcome: answerOutcome("outcome").notNull(),
  packet: jsonb("packet").$type<serving.AnswerTrace["packet"]>().notNull(),
  modelIds: jsonb("model_ids").$type<serving.AnswerTrace["model_ids"]>().notNull(),
  corpusVersionId: text("corpus_version_id")
    .notNull()
    .references(() => corpusVersion.id),
  userAlias: text("user_alias").notNull(),
  serverTs: timestamptz("server_ts").notNull(),
}, (t) => [check("answer_trace_repair_rounds", sql`${t.repairRounds} IN (0, 1)`)]);

// The 24 seeded chips (9.17), answered from stored packets with no live call
export const seededChip = pgTable("seeded_chip", {
  id: text("id").primaryKey(),
  equipmentTag: text("equipment_tag")
    .notNull()
    .references(() => equipment.tag),
  question: text("question").notNull(),
  goldenCaseId: text("golden_case_id"),
  traceId: text("trace_id")
    .notNull()
    .references(() => answerTrace.id),
});

export const evaluationRun = pgTable(
  "evaluation_run",
  {
    id: text("id").primaryKey(),
    corpusVersionId: text("corpus_version_id")
      .notNull()
      .references(() => corpusVersion.id),
    harnessCommit: text("harness_commit").notNull(),
    modelPins: jsonb("model_pins").$type<serving.EvaluationRun["model_pins"]>().notNull(),
    promptVersions: jsonb("prompt_versions").$type<serving.EvaluationRun["prompt_versions"]>().notNull(),
    rulepackVersion: text("rulepack_version").notNull(),
    startedAt: timestamptz("started_at").notNull(),
    finishedAt: timestamptz("finished_at").notNull(),
    tier: evaluationTier("tier").notNull(),
    ingestedBy: text("ingested_by").notNull().default("ci"),
  },
  (t) => [check("evaluation_run_ingested_by", sql`${t.ingestedBy} = 'ci'`)],
);

export const evaluationResult = pgTable(
  "evaluation_result",
  {
    runId: text("run_id")
      .notNull()
      .references(() => evaluationRun.id),
    caseId: text("case_id").notNull(),
    category: text("category").notNull(),
    hardGate: boolean("hard_gate").notNull(),
    verdict: evaluationVerdict("verdict").notNull(),
    expected: text("expected").notNull(),
    failureReason: text("failure_reason"),
  },
  (t) => [primaryKey({ columns: [t.runId, t.caseId] })],
);

// AuditEvent rows (9.7). Append-only at the grant level: drizzle/0001_grants.sql revokes UPDATE and DELETE.
// The composite key carries the partition keys of ARCHITECTURE 3.3 (LIST on action, RANGE on server_ts).
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").notNull(),
    actorAlias: text("actor_alias").notNull(),
    actorRole: auditActorRole("actor_role").notNull(),
    action: auditAction("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    payload: jsonb("payload").$type<serving.AuditEvent["payload"]>().notNull(),
    traceId: text("trace_id"),
    route: text("route").notNull(),
    corpusVersionId: text("corpus_version_id")
      .notNull()
      .references(() => corpusVersion.id),
    serverTs: timestamptz("server_ts").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.action, t.serverTs] }),
    index("audit_log_action_server_ts_idx").on(t.action, t.serverTs),
  ],
);

// 9.13 GatewayCall plus created_at; the daily budget counter reads it (ARCHITECTURE 9.3)
export const gatewayCall = pgTable(
  "gateway_call",
  {
    id: text("id").primaryKey(),
    role: text("role").notNull(),
    requestSha256: text("request_sha256").notNull(),
    responseSha256: text("response_sha256").notNull(),
    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version"), // null for the embedding role (9.13)
    gatewayConfigSha256: text("gateway_config_sha256").notNull(),
    corpusVersionId: text("corpus_version_id")
      .notNull()
      .references(() => corpusVersion.id),
    latencyMs: doublePrecision("latency_ms").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    outcome: gatewayOutcome("outcome").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("gateway_call_role_created_idx").on(t.role, t.createdAt)],
);

// Fixed 60 s windows, upserted (ADR-011, ARCHITECTURE 3.4); keys ask:<user_id>, draft:<user_id>, addr:<ip>
export const rateLimitCounter = pgTable(
  "rate_limit_counter",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    windowStart: timestamptz("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.key, t.windowStart] })],
);

// ---------------------------------------------------------------------------------------------------------------
// 9.6 Drafts, review and the SME note: the isolated `draft` schema. No module under src/answer/ imports it.
// ---------------------------------------------------------------------------------------------------------------
export const draft = pgSchema("draft");

export const draftState = draft.enum("draft_state", pin(drafts.DraftState));
export const draftActorRole = draft.enum("draft_actor_role", pin(drafts.DraftTransition.shape.actor_role));
export const redlineResult = draft.enum("redline_result", pin(drafts.RedlineVerdict.shape.verdict));

export const draftDocument = draft.table(
  "draft_document",
  {
    id: text("id").primaryKey(),
    clusterId: text("cluster_id")
      .notNull()
      .references(() => debtCluster.id),
    equipmentTag: text("equipment_tag")
      .notNull()
      .references(() => equipment.tag),
    state: draftState("state").notNull(),
    leaseExpiresAt: timestamptz("lease_expires_at"),
    corpusVersionId: text("corpus_version_id")
      .notNull()
      .references(() => corpusVersion.id),
    oplIdReserved: text("opl_id_reserved").notNull().unique(),
    title: text("title").notNull(),
    classification: text("classification").notNull(),
    aspect: text("aspect").notNull(),
    createdByAlias: text("created_by_alias").notNull(),
    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    previousDraftId: text("previous_draft_id").references((): AnyPgColumn => draftDocument.id, {
      onDelete: "set null",
    }),
    // non-null on the per-session demo sandbox; the sandbox goes with its session
    sessionScope: text("session_scope").references(() => session.id, { onDelete: "cascade" }),
  },
  (t) => [index("draft_document_state_idx").on(t.state), index("draft_document_session_scope_idx").on(t.sessionScope)],
);

export const draftField = draft.table(
  "draft_field",
  {
    id: text("id").primaryKey(),
    draftId: text("draft_id")
      .notNull()
      .references(() => draftDocument.id, { onDelete: "cascade" }),
    section: integer("section").notNull(),
    ordinal: integer("ordinal").notNull(),
    text: text("text").notNull(),
    provenance: jsonb("provenance").$type<drafts.DraftField["provenance"]>().notNull(),
    numericProvenance: jsonb("numeric_provenance").$type<drafts.DraftField["numeric_provenance"]>().notNull(),
    quarantined: boolean("quarantined").notNull(),
    isSlot: boolean("is_slot").notNull(),
  },
  (t) => [
    index("draft_field_draft_idx").on(t.draftId),
    check("draft_field_section", sql`${t.section} BETWEEN 1 AND 6`),
    // a slot's text is exactly REQUIRES ENGINEER INPUT; every other element carries provenance (9.6, 9.16 AG-3)
    check(
      "draft_field_slot_or_provenance",
      sql`(${t.isSlot} AND ${t.text} = 'REQUIRES ENGINEER INPUT') OR (NOT ${t.isSlot} AND ${t.provenance} IS NOT NULL)`,
    ),
  ],
);

export const redlineVerdict = draft.table(
  "redline_verdict",
  {
    draftId: text("draft_id")
      .notNull()
      .references(() => draftDocument.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    verdict: redlineResult("verdict").notNull(),
    reasons: jsonb("reasons").$type<drafts.RedlineVerdict["reasons"]>().notNull(),
    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.draftId, t.round] }), check("redline_verdict_round", sql`${t.round} IN (1, 2)`)],
);

// The 9.6 transition table as one CHECK: the twelve named pairs, plus any non-terminal state to blocked on lease
// expiry with reason deadline_exceeded (ADR-004). Actor legality lives in src/loop/state.ts and authorize().
export const draftTransition = draft.table(
  "draft_transition",
  {
    id: text("id").primaryKey(),
    draftId: text("draft_id")
      .notNull()
      .references(() => draftDocument.id, { onDelete: "cascade" }),
    fromState: draftState("from_state").notNull(),
    toState: draftState("to_state").notNull(),
    actorAlias: text("actor_alias").notNull(),
    actorRole: draftActorRole("actor_role").notNull(),
    reason: text("reason"),
    editDiff: text("edit_diff"),
    serverTs: timestamptz("server_ts").notNull(),
  },
  (t) => [
    index("draft_transition_draft_idx").on(t.draftId),
    check(
      "draft_transition_legal_pair",
      sql`(${t.fromState}, ${t.toState}) IN (
        ('proposed', 'drafted'), ('drafted', 'redlined'), ('redlined', 'in_review'), ('redlined', 'drafted'),
        ('redlined', 'blocked'), ('in_review', 'in_review'), ('in_review', 'accepted'), ('in_review', 'rejected'),
        ('accepted', 'published'), ('accepted', 'rejected'), ('blocked', 'proposed'), ('rejected', 'proposed')
      ) OR (
        ${t.toState} = 'blocked' AND ${t.reason} = 'deadline_exceeded'
        AND ${t.fromState} IN ('proposed', 'drafted', 'redlined', 'in_review', 'accepted')
      )`,
    ),
  ],
);

export const smeNote = draft.table(
  "sme_note",
  {
    id: text("id").primaryKey(),
    draftId: text("draft_id")
      .notNull()
      .references(() => draftDocument.id, { onDelete: "cascade" }),
    fieldId: text("field_id")
      .notNull()
      .references(() => draftField.id, { onDelete: "cascade" }),
    authorAlias: text("author_alias").notNull(),
    authorRole: role("author_role").notNull(),
    capturedAt: timestamptz("captured_at").notNull(),
    text: text("text").notNull(),
    sourceReference: text("source_reference"),
    provenance: text("provenance").notNull().default("human, dated, unreviewed"),
    citeable: boolean("citeable").notNull().default(false), // false until the carrying lesson is published
  },
  (t) => [
    index("sme_note_draft_idx").on(t.draftId),
    check("sme_note_provenance", sql`${t.provenance} = 'human, dated, unreviewed'`),
  ],
);
