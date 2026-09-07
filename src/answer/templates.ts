// Moment templates (ARCHITECTURE 7 step 8; blueprint 9.8 TypedFact and Block, 9.17; AC-ANS-16): typed facts and
// blocks read deterministically from equipment, interlock, interlock_row, start_permissive, datasheet_param,
// proof_test, work_order, causal_link, bom_item, bom_match, opl, opl_step and troubleshooting_row, in the block order the golden set pins
// per template. Every item carries a Citation resolved from its own span, every TypedFact carries the sheet's own
// qualifier verbatim (the C&E note on training values, a proof test's result text), a block with no evidence is
// omitted, and nothing here generates a number, a sentence or a step: values are the rows' own columns. A row whose
// citation does not resolve (a work order with no workbook span) is omitted rather than cited without provenance.
// The blocks are built from the scope's rows whatever moment was inferred; the template decides the order, which
// block leads and which values are typed facts (the diagnosis of 2026-09-07, rank 1: gating the existence of the
// typed layer on the moment left a question that infers no template with no block, no procedure and no fact).
import type { Block, Citation, TypedFact } from "@/contracts/generated/evidence_packet";
import type { Db } from "@/db/client";
import { pidSidecarsOf } from "@/db/queries/pid";
import * as q from "@/db/queries/retrieval";
import { tagsIn, tokens } from "@/rulepack";
import {
  cite,
  citeSource,
  functionsOutOfService,
  lessonTags,
  loadSources,
  permissiveItems,
  procedureOf,
  resetNotes,
  returnToService,
  type ProcedureBundle,
  type Sources,
} from "./permit";
import { contentTerms, questionTags, workOrderNumbers } from "./scope";
import {
  LADDER_LAYERS,
  type BomPartItem,
  type CausalLinkItem,
  type Contradiction,
  type DocumentedResponseItem,
  type EffectItem,
  type InterlockRowItem,
  type LadderItem,
  type LadderLayer,
  type LessonItem,
  type PrecedentItem,
  type ProofTestItem,
  type Retrieval,
  type Scope,
  type SidecarReading,
  type Template,
  type TypedFacts,
  type WorkOrderItem,
} from "./types";

type Kind = Block["kind"];

/** The block order per template, as the golden set pins it (GS-29 and the four moment cases of 9.17). */
export const BLOCK_ORDER: Record<Template, readonly Kind[]> = {
  readiness: ["permissives", "proof_tests", "standing_bypasses", "steps", "permit"],
  trip: ["initiator_row", "effects", "reset_note", "permissives", "related_work_orders", "causal_chain", "lessons"],
  job: ["datasheet_limits", "bom_parts", "related_work_orders", "steps", "permit", "functions_out_of_service", "return_to_service"],
  reading: ["ladder", "documented_response", "precedent"],
};

/** The block order of a documented bypass served verbatim (rule-pack class documented_bypass, no moment template). */
export const BYPASS_ORDER: readonly Kind[] = ["permit", "steps", "functions_out_of_service"];

/**
 * The order of the typed layer when no moment leads it: the governing sheet first (the row, what it actuates, how
 * it resets, what must be true to start), then the ladder and the design limits, then the asset's own history, then
 * the lesson and the way back into service. Every Block kind of 9.8 appears exactly once, so no kind can be lost.
 */
export const DEFAULT_ORDER: readonly Kind[] = [
  "initiator_row",
  "effects",
  "reset_note",
  "permissives",
  "standing_bypasses",
  "ladder",
  "datasheet_limits",
  "proof_tests",
  "related_work_orders",
  "causal_chain",
  "bom_parts",
  "documented_response",
  "precedent",
  "lessons",
  "steps",
  "permit",
  "functions_out_of_service",
  "return_to_service",
];

/** The moment's own order, then every other kind of the default order: the template orders, it never gates. */
export function orderFor(template: Template | null): readonly Kind[] {
  const lead = template === null ? [] : BLOCK_ORDER[template];
  return [...lead, ...DEFAULT_ORDER.filter((k) => !lead.includes(k))];
}

export const BLOCK_LABEL: Record<Kind, string> = {
  permissives: "Start permissives",
  proof_tests: "Proof tests, last of each class marked",
  steps: "Procedure steps",
  permit: "Permit, LOTO and car-seal lines",
  standing_bypasses: "Standing bypasses",
  initiator_row: "Initiator row",
  effects: "Effects",
  reset_note: "Reset note",
  related_work_orders: "Related work orders",
  causal_chain: "Causal chain",
  lessons: "Lessons",
  datasheet_limits: "Datasheet limits",
  bom_parts: "Bill-of-material parts",
  functions_out_of_service: "Functions out of service",
  return_to_service: "Return to service",
  ladder: "Setpoint ladder",
  documented_response: "Documented response",
  precedent: "Precedent",
};

export const PROOF_TEST_CLASS_LABEL = {
  sis_proof_test: "SIS proof test",
  sil_logic_test: "SIL logic test",
  calibration_proof_test: "Calibration proof test",
  statutory_relief_test: "Statutory relief test",
} as const;

/** A block in the given order, or null when it has no evidence (never emitted empty, 9.8). */
export function blockOf(kind: Kind, order: readonly Kind[], items: readonly unknown[]): Block | null {
  const index = order.indexOf(kind);
  if (items.length === 0 || index < 0) return null;
  return { kind, order: index + 1, label: BLOCK_LABEL[kind], items: [...items] };
}

export type TypedFactsOptions = {
  /** The retrieval of the same question: the lessons it cited join the asset's own as procedure candidates. */
  retrieval?: Retrieval;
  /** The question as typed: its instrument tags and content terms select rows, lessons and work orders. */
  question?: string;
  /** A lesson the caller already resolved (a documented bypass's entity row); it leads over the task match. */
  opl_id?: string;
};

const OPL_ID = /OPL-[A-Z]{2}-\d{4}[A-Z]?-\d{2}/g;

/** The lesson id a question names, or null: the one identifier that binds a procedure before any ranking. */
export function lessonIdIn(question: string): string | null {
  return question.toUpperCase().match(OPL_ID)?.[0] ?? null;
}

/**
 * 9.8 EvidencePacket.gaps_declared: the question asked how a task is done and no approved lesson of the assets in
 * scope teaches it. ponytail: the lane's own wording lives here because src/lib/fixed-strings.ts belongs to another
 * hand this round; move it there when that file is next opened.
 */
export const NO_TASK_LESSON_GAP =
  "No approved lesson of the assets in scope teaches this task; the typed rows are served without a procedure.";

/** Whether the question asks how a task is done, which is when a procedure that is not served is a declared gap. */
export function taskShaped(template: Template | null, question: string): boolean {
  return template === "job" || template === "readiness" || lessonIdIn(question) !== null;
}

/**
 * The document-revision columns served as typed facts, under the title block's own field names (the diagnosis of
 * 2026-09-07, rank 14). The value is the row's own column and nothing is computed from it; a column the revision
 * does not carry renders nothing rather than an empty fact, because a title block that states no approver is not
 * the same document as one that states an empty approver.
 */
const REVISION_COLUMNS: ReadonlyArray<{ field: string; unit: string | null; value: (r: q.RevisionRow) => string | null }> = [
  { field: "Rev", unit: null, value: (r) => r.revision },
  { field: "Approval status", unit: null, value: (r) => r.approvalStatusText },
  { field: "Prepared by", unit: null, value: (r) => r.preparedByAlias },
  { field: "Reviewed by", unit: null, value: (r) => r.reviewedByAlias },
  { field: "Approved by", unit: null, value: (r) => r.approvedByAlias },
  { field: "Date of sharing", unit: "date", value: (r) => r.dateOfSharing },
];

/**
 * The sidecar rules that record a reading of the sheet against a value another document types. The rest of the
 * sidecar's own rule vocabulary describes the sheet alone (garbled text, a missing title block, a footprint that
 * does not match the plot plan) and states no second reading of a typed value, so it is not a contradiction and is
 * not served as one.
 */
const SIDECAR_CONFLICT_RULES: ReadonlySet<string> = new Set([
  "label_vs_ce_mismatch",
  "wrong_seq_citation",
  "wrong_datasheet_citation",
  "revision_conflict",
  "placeholder_ref",
  "foreign_tag",
]);

/**
 * What the packet says about a P&ID reading it carries (deviation D-12, ADR-007). ponytail: the lane's own wording
 * lives here for the same reason NO_TASK_LESSON_GAP does; move both to src/lib/fixed-strings.ts when that file is
 * next opened. The basis and the review status are the sidecar row's own values, never a constant: a sheet whose
 * review is recorded one day will say so here without an edit.
 */
export function sidecarBasisLine(s: SidecarReading): string {
  return `Basis: ${s.basis.replace(/_/g, " ")} of the drawing, ${s.review_status} review (D-12). The sheet is an image with no extracted text, so this reading is served without a citation of its own.`;
}

// The ladder's variable from an instrument-tag prefix letter or a question word (EN and ID).
const VARIABLE_BY_LETTER: Record<string, string> = { P: "pressure", T: "temperature", L: "level", F: "flow", V: "vibration", S: "speed", A: "analysis" };
const VARIABLE_WORDS: ReadonlyArray<[string, string]> = [
  ["vibration", "vibration"],
  ["vibrasi", "vibration"],
  ["getaran", "vibration"],
  ["pressure", "pressure"],
  ["tekanan", "pressure"],
  ["temperature", "temperature"],
  ["temperatur", "temperature"],
  ["suhu", "temperature"],
  ["level", "level"],
  ["flow", "flow"],
  ["aliran", "flow"],
  ["speed", "speed"],
  ["putaran", "speed"],
];
const FIELD_WORD: Record<string, readonly string[]> = {
  pressure: ["PRESS"],
  temperature: ["TEMP"],
  level: ["LEVEL"],
  flow: ["FLOW"],
  vibration: ["VIB"],
  speed: ["SPEED"],
  analysis: ["ANALY"],
};

export function variableOf(question: string, instrumentTags: readonly string[]): string | null {
  for (const tag of instrumentTags) {
    const letter = tag.replace(/-.*$/, "").charAt(0);
    const v = VARIABLE_BY_LETTER[letter];
    if (v) return v;
  }
  const toks = new Set(tokens(question));
  for (const [word, variable] of VARIABLE_WORDS) if (toks.has(word)) return variable;
  return null;
}

function variableOfTag(tag: string): string | null {
  return VARIABLE_BY_LETTER[tag.replace(/-.*$/, "").charAt(0)] ?? null;
}

/**
 * The workbook's own outcome columns (9.4 WorkOrder), under the workbook's own column names. The value is the
 * stored column and nothing is computed from it: `Downtime_Hours` states hours because the column says hours, and
 * the IDR amount is the stored integer with the thousands grouping a currency is read in (en-US grouping, the one
 * the golden set writes and the one the workbook's own cells display). An empty column keeps its name and renders
 * nothing after it, which is how "the closeout is not filled in" is stated rather than inferred.
 */
const OUTCOME_COLUMNS: ReadonlyArray<{
  label: string;
  unit: string | null;
  terms: readonly string[];
  value: (w: WorkOrderItem) => { text: string; num: number | null } | null;
}> = [
  { label: "Downtime_Hours", unit: "h", terms: ["downtime", "outage"], value: (w) => (w.downtime_hours === null ? null : { text: String(w.downtime_hours), num: w.downtime_hours }) },
  { label: "Total_Cost_IDR", unit: "IDR", terms: ["cost", "biaya"], value: (w) => (w.total_cost_idr === null ? null : { text: new Intl.NumberFormat("en-US").format(w.total_cost_idr), num: w.total_cost_idr }) },
  { label: "Priority", unit: null, terms: ["priority", "emergency"], value: (w) => ({ text: w.priority, num: null }) },
  { label: "Criticality", unit: null, terms: ["criticality", "critical"], value: (w) => ({ text: w.criticality, num: null }) },
  { label: "Executed_By", unit: null, terms: ["executed", "execute"], value: (w) => ({ text: w.executed_by_alias, num: null }) },
];

function mentionsTag(text: string, tags: ReadonlySet<string>): boolean {
  const upper = text.toUpperCase();
  for (const t of tags) if (upper.includes(t)) return true;
  return false;
}

function mentionsTerm(text: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return false;
  const toks = new Set(tokens(text));
  return terms.some((t) => t.length >= 4 && toks.has(t));
}

/**
 * How well a lesson's own task matches the question (the diagnosis of 2026-09-07, rank 10). A term or a tag in the
 * lesson's `name` (its title and its related-interlock line, which is what names the task) counts double, one in
 * its `body` (its steps) counts once, and the scope's own equipment tag counts nothing: every lesson of an asset
 * names that asset, so it separates no task from another.
 */
export function taskScore(
  name: string,
  body: string,
  terms: readonly string[],
  tags: ReadonlySet<string>,
  scopeTags: ReadonlySet<string>,
): number {
  const inName = new Set(tokens(name));
  const inBody = new Set(tokens(body));
  const upperName = name.toUpperCase();
  const upperBody = body.toUpperCase();
  let n = 0;
  for (const t of terms) {
    if (t.length < 4 || scopeTags.has(t.toUpperCase())) continue;
    if (inName.has(t)) n += 2;
    else if (inBody.has(t)) n += 1;
  }
  for (const tag of tags) {
    if (scopeTags.has(tag)) continue;
    if (upperName.includes(tag)) n += 2;
    else if (upperBody.includes(tag)) n += 1;
  }
  return n;
}

type AssetData = {
  equipment: q.EquipmentRow[];
  interlocks: q.InterlockRowType[];
  rows: q.InterlockRowRow[];
  permissives: q.PermissiveRow[];
  params: q.DatasheetParamRow[];
  proofTests: q.ProofTestRow[];
  workOrders: q.WorkOrderRow[];
  links: q.CausalLinkRow[];
  opls: q.OplRow[];
  steps: q.OplStepRow[];
  bomItems: q.BomItemRow[];
  sources: Sources;
  woSpans: Map<string, q.SpanSource>;
  lessonSpans: Map<string, q.SpanSource>;
  findings: Map<string, string[]>;
};

async function loadAsset(db: Db, tags: readonly string[]): Promise<AssetData> {
  const [equipmentRows, interlocks, rows, params, proofTests, workOrders, links, opls, bomItems] = await Promise.all([
    q.equipmentOf(db, tags),
    q.interlocksOf(db, tags),
    q.interlockRowsOf(db, tags),
    q.datasheetParamsOf(db, tags),
    q.proofTestsOf(db, tags),
    q.workOrdersOf(db, tags),
    q.causalLinksOf(db, tags),
    q.oplsOf(db, tags),
    q.bomItemsOf(db, tags),
  ]);
  const seqIds = interlocks.map((i) => i.seqId).filter((s): s is string => s !== null);
  const oplIds = opls.map((o) => o.oplId);
  const [permissives, steps] = await Promise.all([q.permissivesOf(db, seqIds), q.oplStepsOf(db, oplIds)]);
  const [sources, woSpans, lessonSpans] = await Promise.all([
    loadSources(db, [
      ...rows.map((r) => r.spanId),
      ...permissives.map((p) => p.spanId),
      ...params.map((p) => p.spanId),
      ...links.map((l) => l.spanId),
      ...interlocks.flatMap((i) => i.notes.map((n) => n.span_id)),
      // A lesson step is citable evidence of its own: AC-CTX-06 reads the alarm rung of a ladder off one.
      ...steps.map((s) => s.spanId),
      ...bomItems.map((b) => b.spanId),
    ]),
    q.workOrderSpans(db, [...proofTests.map((t) => t.woNumber), ...workOrders.map((w) => w.woNumber)]),
    q.firstSpanOfRevisions(db, opls.map((o) => o.documentRevisionId)),
  ]);
  const findings = await q.openFindingRuleIds(db, [
    ...new Set([...[...woSpans.values()], ...[...lessonSpans.values()]].map((s) => s.documentId)),
  ]);
  for (const [id, ruleIds] of sources.findings) findings.set(id, ruleIds);
  return { equipment: equipmentRows, interlocks, rows, permissives, params, proofTests, workOrders, links, opls, steps, bomItems, sources, woSpans, lessonSpans, findings };
}

/**
 * The C&E sheet's own note on its set points (the training-values note), verbatim, for every setpoint fact of that
 * sheet. The note's own list number is dropped where the text repeats it: `n` is the note's position on the sheet,
 * not a value the note states, and a qualifier is read as a sentence. The sentence itself is never touched.
 */
export function setpointQualifier(il: q.InterlockRowType | undefined): string | null {
  if (!il) return null;
  const notes = il.notes.filter((n) => /set ?points?|training/i.test(n.text)).map((n) => n.text.replace(new RegExp(`^\\s*${n.n}\\.\\s*`), ""));
  return notes.length > 0 ? notes.join(" ") : null;
}

/** The sheet header's own SIL display string ("SIL 1"), or null where the sheet states none (a control loop). */
export function silTextOf(il: q.InterlockRowType | undefined): string | null {
  return il === undefined || il.silSheet === null ? null : `SIL ${il.silSheet}`;
}

export async function typedFacts(db: Db, scope: Scope, template: Template | null, opts: TypedFactsOptions = {}): Promise<TypedFacts> {
  const empty: TypedFacts = { typed_facts: [], blocks: [], procedure: null, contradictions: [] };
  if (scope.tags.length === 0) return empty;
  const question = opts.question ?? "";
  const terms = question.length > 0 ? contentTerms(question) : [];
  const qTags = new Set<string>([...questionTags(question), ...scope.instrument_tags]);
  const seqSet = new Set<string>();
  const data = await loadAsset(db, scope.tags);

  // The documents the scope resolved, and every finding open against them. A finding reaches a reader only on the
  // citation of its own document (9.8 Citation.integrity_findings), and the read used to cover only the documents
  // the typed rows happened to sit on, so a rule hanging on a general-arrangement drawing or a plot plan was
  // invisible unless a work order dragged it in (the diagnosis of 2026-09-07, rank 14). It is widened here to every
  // document of the scope. The area observations (CD-16) bind to no document at all; openFindingRuleIds keys them
  // by the equipment tag their own register item names, and they ride the citations of that asset's own documents,
  // which is the only carrier 9.8 leaves them.
  const scopeDocuments = await q.documentsByIds(db, scope.document_ids);
  const scopeFindings = await q.openFindingRuleIds(db, [...scope.document_ids, ...scope.tags]);
  for (const d of scopeDocuments) {
    const area = d.subjectTag === null ? [] : (scopeFindings.get(d.subjectTag) ?? []);
    const merged = [...new Set([...(scopeFindings.get(d.id) ?? []), ...area])].sort();
    if (merged.length === 0) continue;
    data.findings.set(d.id, merged);
    data.sources.findings.set(d.id, merged);
  }

  for (const i of data.interlocks) if (i.seqId !== null) seqSet.add(i.seqId);
  const ilOf = (tag: string) => data.interlocks.find((i) => i.equipmentTag === tag);
  const eqOf = (tag: string) => data.equipment.find((e) => e.tag === tag);
  // The work orders the question names by number: the row a question is about is evidence whatever its narrative
  // fields say (the diagnosis of 2026-09-07: "who executed WO-240003" reached no work order at all).
  const askedWos = new Set(workOrderNumbers(question));

  // The order every block is placed in: the moment's own order leads, the rest of the typed layer follows in the
  // default order. `lead` is the set of kinds whose values are the packet's typed facts (below).
  const order = orderFor(template);
  const lead = new Set<Kind>(template === null ? DEFAULT_ORDER : BLOCK_ORDER[template]);
  const blocks: Block[] = [];
  const factsOf = new Map<Kind, TypedFact[]>();
  const push = (kind: Kind, items: readonly unknown[]) => {
    const b = blockOf(kind, order, items);
    if (b) blocks.push(b);
  };
  const typeFact = (kind: Kind, f: TypedFact) => factsOf.set(kind, [...(factsOf.get(kind) ?? []), f]);

  // --- interlock rows and their setpoint facts ------------------------------------------------------------------
  const rowItem = (r: q.InterlockRowRow): InterlockRowItem | null => {
    const citation = cite(data.sources, r.spanId);
    if (!citation) return null;
    const il = ilOf(r.equipmentTag);
    const fact: TypedFact = {
      label: `${r.rowId} ${r.initiator} (${r.instrumentTag})`,
      value_text: r.setpointText,
      value_num: r.setpointValue,
      unit: r.setpointUnit,
      comparator: r.comparator,
      source: citation,
      qualifier: setpointQualifier(il),
      source_class: "ce_row",
    };
    return {
      row_id: r.rowId,
      row_kind: r.rowKind,
      seq_id: r.seqId,
      initiator: r.initiator,
      instrument_tag: r.instrumentTag,
      voting: r.voting,
      sil_text: silTextOf(il),
      setpoint_text: r.setpointText,
      ce_doc_no: il?.ceDocNo ?? null,
      ce_revision: il?.ceRevision ?? null,
      functional_location: eqOf(r.equipmentTag)?.functionalLocation ?? null,
      fact,
    };
  };
  const tripRows = data.rows.filter((r) => r.rowKind === "trip");
  const byQuestionTag = tripRows.filter((r) => qTags.has(r.instrumentTag));
  const byTerm = tripRows.filter((r) => mentionsTerm(`${r.initiator} ${r.setpointText}`, terms));
  const initiatorRows = byQuestionTag.length > 0 ? byQuestionTag : byTerm.length > 0 ? byTerm : tripRows;
  const initiatorTags = new Set(initiatorRows.map((r) => r.instrumentTag));
  // Whether the question names the protective function itself (a SEQ id, or an initiator the sheet carries).
  const namesFunction = byQuestionTag.length > 0 || byTerm.length > 0 || [...qTags].some((t) => seqSet.has(t));

  const initiatorItems = initiatorRows.map(rowItem).filter((i): i is InterlockRowItem => i !== null);
  push("initiator_row", initiatorItems);
  for (const i of initiatorItems) typeFact("initiator_row", i.fact);

  const effects: EffectItem[] = [];
  for (const r of initiatorRows) {
    // Note 2 of every sheet: the effects marked X are the ones the Safety PLC actuates; an unmarked cell is not an effect.
    const marked = r.effects.filter((e) => e.marked);
    const citation = marked.length > 0 ? cite(data.sources, r.spanId) : null;
    if (citation) {
      effects.push({
        row_id: r.rowId,
        seq_id: r.seqId,
        instrument_tag: r.instrumentTag,
        sil_text: silTextOf(ilOf(r.equipmentTag)),
        initiator: r.initiator,
        effects: marked,
        effects_basis: r.effectsBasis,
        citation,
      });
    }
  }
  push("effects", effects);
  // A reset note is about a trip: on a sheet whose logic is a control loop, the same standard note is boilerplate
  // and a "Reset note" block would tell a reader the sheet has a trip it does not have (CD-17). The notes of such a
  // sheet are served as its own statements, against its own logic line, in contradictionsOf below.
  const tripSheets = new Set(data.rows.filter((r) => r.rowKind === "trip").map((r) => r.equipmentTag));
  push("reset_note", data.interlocks.filter((il) => tripSheets.has(il.equipmentTag)).flatMap((il) => resetNotes(il, data.sources)));

  // --- permissives, standing bypasses and the last proof test per class -----------------------------------------
  const permissives = permissiveItems(data.permissives, data.sources);
  push("permissives", permissives);
  push("standing_bypasses", permissives.filter((p) => p.standing_bypass_state !== null));

  // The whole proof-test record of the scope in completion-date order, with the last of each class marked on the
  // item; the readiness summary of AC-ANS-16 is the typed fact built from the marked record, so both readings of
  // "when was this last proof-tested" are served and neither hides the other (the diagnosis of 2026-09-07).
  const lastOfClass = new Set<string>();
  const seenTest = new Set<string>();
  for (const t of data.proofTests) {
    // proofTestsOf orders by class then completion date descending: the first of each class is the last test.
    const key = `${t.equipmentTag}|${t.testClass}`;
    if (seenTest.has(key)) continue;
    seenTest.add(key);
    lastOfClass.add(`${key}|${t.woNumber}`);
  }
  const tests: ProofTestItem[] = [];
  for (const t of data.proofTests) {
    const s = data.woSpans.get(t.woNumber);
    if (!s) continue;
    const citation = citeSource(s, data.findings);
    const last = lastOfClass.has(`${t.equipmentTag}|${t.testClass}|${t.woNumber}`);
    tests.push({
      wo_number: t.woNumber,
      seq_id: t.seqId,
      device_tag: t.deviceTag,
      test_class: t.testClass,
      completion_date: t.completionDate,
      result_text: t.resultText,
      as_found: t.asFound,
      as_left: t.asLeft,
      last_of_class: last,
      citation,
    });
    if (!last) continue;
    typeFact("proof_tests", {
      label: `Last ${PROOF_TEST_CLASS_LABEL[t.testClass]} (${t.seqId ?? t.deviceTag ?? t.equipmentTag})`,
      value_text: t.completionDate,
      value_num: null,
      unit: "date",
      comparator: null,
      source: citation,
      qualifier: t.resultText,
      source_class: "proof_test",
    });
  }
  tests.sort((a, b) => b.completion_date.localeCompare(a.completion_date) || a.wo_number.localeCompare(b.wo_number));
  push("proof_tests", tests);

  // --- datasheet limits ------------------------------------------------------------------------------------------
  // Every row of the scope's datasheet is evidence, whether or not its value parses as a number: a packing
  // material, a body rating, a service fluid, a TEMA type, an area classification and the sheet's own equipment id
  // are values the sheet states with a span each, and dropping them because they are text made six expected values
  // unreachable in five cases while the same row passed wherever the question happened to name its field (the
  // diagnosis of 2026-09-07). The question's own terms no longer decide what exists, only what leads.
  const paramFact = (p: q.DatasheetParamRow): TypedFact | null => {
    const citation = cite(data.sources, p.spanId);
    return citation
      ? { label: `${p.group}: ${p.field}`, value_text: p.valueText, value_num: p.valueNum, unit: p.unit, comparator: null, source: citation, qualifier: null, source_class: "datasheet_param" }
      : null;
  };
  const limits: TypedFact[] = [];
  for (const p of data.params) {
    const fact = paramFact(p);
    if (fact) limits.push(fact);
  }
  push("datasheet_limits", limits);
  for (const f of limits) typeFact("datasheet_limits", f);

  // --- work orders, their parts and the causal chain -------------------------------------------------------------
  const woText = (w: q.WorkOrderRow) => `${w.problemDescription} ${w.rootCause} ${w.correctiveAction} ${w.sparePartsUsed}`;
  const relatedWos = data.workOrders.filter((w) => {
    if (askedWos.has(w.woNumber)) return true;
    const text = woText(w);
    if (namesFunction && w.relatedInterlock !== null && seqSet.has(w.relatedInterlock)) return true;
    return mentionsTag(text, qTags) || (namesFunction && mentionsTag(text, initiatorTags)) || mentionsTerm(text, terms);
  });
  const woItem = (w: q.WorkOrderRow): WorkOrderItem | null => {
    const s = data.woSpans.get(w.woNumber);
    if (!s) return null;
    return {
      wo_number: w.woNumber,
      report_date: w.reportDate,
      work_type: w.workType,
      discipline: w.discipline,
      priority: w.priority,
      criticality: w.criticality,
      executed_by_alias: w.executedByAlias,
      downtime_hours: w.downtimeHours,
      total_cost_idr: w.totalCostIdr,
      related_interlock: w.relatedInterlock,
      breakdown_kind: w.breakdownKind,
      closeout_complete: w.closeoutComplete,
      problem_description: w.problemDescription,
      root_cause: w.rootCause,
      corrective_action: w.correctiveAction,
      spare_parts_used: w.sparePartsUsed,
      citation: citeSource(s, data.findings),
    };
  };
  const woItems = relatedWos.map(woItem).filter((w): w is WorkOrderItem => w !== null);
  push("related_work_orders", woItems);

  // The outcome columns as typed facts, under the workbook's own column names, for the work orders the question
  // names by number and for the columns its own terms name: a column the workbook left empty is then named rather
  // than dropped ("Executed_By" with nothing after it is the CD-4 defect the answer is asked about), and a job's
  // downtime and cost carry the unit the column name states. The gate keeps the packet to the columns asked for;
  // promoting all five of every related work order would bury the question's own rows under two dozen jobs.
  for (const w of woItems) {
    const named = askedWos.has(w.wo_number);
    for (const column of OUTCOME_COLUMNS) {
      if (!named && !column.terms.some((t) => terms.includes(t))) continue;
      const value = column.value(w);
      if (value === null) continue;
      typeFact("related_work_orders", {
        label: `${w.wo_number} ${column.label}`,
        value_text: value.text,
        value_num: value.num,
        unit: column.unit,
        comparator: null,
        source: w.citation,
        qualifier: null,
        source_class: "work_order",
      });
    }
  }

  const woSet = relatedWos.length > 0 ? relatedWos : data.workOrders;
  const matches = await q.bomMatchesOf(db, woSet.map((w) => w.woNumber));
  const bomItems = await q.bomItemsByIds(db, matches.flatMap((m) => [m.bomItemId, m.alternativeBomItemId]).filter((id): id is string => id !== null));
  const bomSources = await loadSources(db, [...bomItems.values()].map((i) => i.spanId));
  const parts: BomPartItem[] = [];
  // The asset's own general-arrangement drawing rows, cited to their own spans. bomMatchesOf reaches a BOM row only
  // through a work order, so a question about the asset itself cited no drawing at all and the findings open
  // against that drawing (CD-11) rode on nothing (the diagnosis of 2026-09-07).
  const matchedIds = new Set(matches.flatMap((m) => [m.bomItemId, m.alternativeBomItemId]).filter((id): id is string => id !== null));
  for (const item of data.bomItems) {
    if (matchedIds.has(item.id)) continue;
    const citation = cite(data.sources, item.spanId);
    if (!citation) continue;
    parts.push({
      wo_number: null,
      part_string: item.description,
      status: "matched",
      item_no: item.itemNo,
      description: item.description,
      material: item.material,
      quantity: item.quantity,
      alternative_item_no: null,
      disambiguator_text: null,
      citation,
    });
  }
  for (const m of matches) {
    const item = m.bomItemId ? bomItems.get(m.bomItemId) : undefined;
    const alt = m.alternativeBomItemId ? bomItems.get(m.alternativeBomItemId) : undefined;
    const citation = item ? cite(bomSources, item.spanId) : null;
    const woSpan = data.woSpans.get(m.woNumber);
    const cited = citation ?? (woSpan ? citeSource(woSpan, data.findings) : null);
    if (!cited) continue;
    parts.push({
      wo_number: m.woNumber,
      part_string: m.partString,
      status: m.status,
      item_no: item?.itemNo ?? null,
      description: item?.description ?? null,
      material: item?.material ?? null,
      quantity: item?.quantity ?? null,
      alternative_item_no: alt?.itemNo ?? null,
      disambiguator_text: m.disambiguatorText,
      citation: cited,
    });
  }
  push("bom_parts", parts);

  const chain: CausalLinkItem[] = [];
  for (const l of data.links) {
    const citation = cite(data.sources, l.spanId);
    if (!citation) continue;
    chain.push({
      id: l.id,
      from_wo: l.fromWo,
      to_wo: l.toWo,
      mechanism_noun: l.mechanismNoun,
      interval_days: l.intervalDays,
      linking_sentence: l.linkingSentence,
      linking_field: l.linkingField,
      citation,
    });
  }
  push("causal_chain", chain);

  // --- lessons: the block, then the one procedure the question's task selects -----------------------------------
  const stepsOf = (oplId: string) => data.steps.filter((s) => s.oplId === oplId);
  const lessonItem = (o: q.OplRow): LessonItem | null => {
    const s = data.lessonSpans.get(o.documentRevisionId);
    if (!s) return null;
    const name = eqOf(o.equipmentTag)?.name;
    return {
      opl_id: o.oplId,
      title: o.title,
      classification: o.classification,
      aspect: o.aspect,
      discipline: o.discipline,
      // The head of the sheet as the sheet prints it: the form's field name, then the stored column. The span this
      // item cites is the title block those lines are on, so the reader can open them (the diagnosis of
      // 2026-09-07: the lesson item dropped the three head fields the lesson itself leads with).
      header_lines: [
        `Equipment ${o.equipmentTag}${name === undefined ? "" : ` - ${name}`}`,
        `Area / Unit ${o.areaUnit}`,
        `Related Interlock ${o.relatedInterlockText}`,
        `P&ID Ref ${o.pidRef}`,
      ],
      related_interlock_text: o.relatedInterlockText,
      sections: o.sections.map((x) => ({ n: x.n, heading: x.heading, body_text: x.body_text })),
      footer: o.footer,
      machine_drafted: o.machineDrafted,
      approver_alias: o.approverAlias,
      citation: citeSource(s, data.findings),
    };
  };
  const sectionText = (o: q.OplRow) => `${o.title} ${o.aspect} ${o.sections.map((s) => s.body_text).join(" ")}`;
  let lessons = data.opls.filter((o) => mentionsTerm(sectionText(o), terms) || mentionsTag(sectionText(o), initiatorTags));
  if (lessons.length === 0) lessons = data.opls.filter((o) => [...seqSet].some((s) => o.relatedInterlockText.includes(s)));
  push("lessons", lessons.map(lessonItem).filter((l): l is LessonItem => l !== null));

  // The procedure is bound to the lesson whose own task matches the question, never to whatever retrieval ranked
  // first (the diagnosis of 2026-09-07, rank 10): the caller's lesson leads, then a lesson the question names by
  // its id, then the highest task overlap over the lesson's title, its related-interlock line and its steps. A
  // moment that asks what the sheet says (trip, reading) serves no procedure; its lessons render as the block above.
  const askedId = opts.opl_id ?? lessonIdIn(question);
  const asked = askedId !== null || taskShaped(template, question);
  const scopeTags = new Set(scope.tags);
  const taskName = (o: q.OplRow) => `${o.title} ${o.relatedInterlockText}`;
  const taskBody = (o: q.OplRow) => stepsOf(o.oplId).map((s) => s.actionText).join(" ");
  const retrievedAt = new Map<string, number>();
  const lessonByDocument = new Map<string, q.OplRow>();
  for (const o of data.opls) {
    const s = data.lessonSpans.get(o.documentRevisionId);
    if (s) lessonByDocument.set(s.documentId, o);
  }
  (opts.retrieval?.evidence ?? []).forEach((c, i) => {
    const o = lessonByDocument.get(c.document_id);
    if (o && !retrievedAt.has(o.oplId)) retrievedAt.set(o.oplId, i);
  });
  const scored = data.opls
    .map((o) => ({ opl: o, score: taskScore(taskName(o), taskBody(o), terms, qTags, scopeTags), at: retrievedAt.get(o.oplId) ?? Number.MAX_SAFE_INTEGER }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.at - b.at || a.opl.oplId.localeCompare(b.opl.oplId));
  const primaryId = askedId ?? scored[0]?.opl.oplId ?? null;

  let bundle: ProcedureBundle | null = null;
  if (primaryId !== null && (asked || template === null)) bundle = await procedureOf(db, primaryId, [...qTags]);
  if (bundle) {
    push("steps", bundle.steps);
    push("permit", bundle.permit);
  }

  // --- the functions an isolation takes out of service, and the way back -----------------------------------------
  const isolated = [...new Set([...qTags, ...(bundle ? lessonTags(bundle.lesson) : [])])];
  push("functions_out_of_service", bundle ? bundle.functions_out_of_service : await functionsOutOfService(db, scope.tags, isolated));
  push("return_to_service", await returnToService(db, scope.tags));

  // --- the setpoint ladder and what the lessons document about the reading ---------------------------------------
  const variable = variableOf(question, [...qTags]);
  const layers: Record<LadderLayer, TypedFact | null> = { normal: null, alarm: null, trip: null, relief: null };
  const classesRead = new Set<string>();
  let alarmSource: string | null = null;
  let ladderSil: string | null = null;
  if (variable !== null) {
    const words = FIELD_WORD[variable] ?? [];
    const ofVariable = (r: q.InterlockRowRow) => qTags.has(r.instrumentTag) || variableOfTag(r.instrumentTag) === variable;
    const alarmRow = data.rows.find((r) => r.rowKind === "alarm" && ofVariable(r));
    const tripRow = data.rows.find((r) => r.rowKind === "trip" && ofVariable(r));
    const normalParam = data.params.find((p) => p.group !== "header" && words.some((w) => p.field.toUpperCase().includes(w)) && !/SET|RELIEF|PSV/i.test(p.field));
    const reliefParam = variable === "pressure" ? data.params.find((p) => /SET PRESS|RELIEF|PSV/i.test(p.field)) : undefined;
    const reliefRow = variable === "pressure" ? data.rows.find((r) => r.rowKind === "mech" && /PSV|relief/i.test(`${r.initiator} ${r.instrumentTag}`)) : undefined;
    if (data.rows.length > 0) classesRead.add("interlock");
    if (data.params.length > 0) classesRead.add("datasheet");
    // AC-CTX-06: where the sheet carries no alarm row for the variable, the alarm rung is the approved lesson's own
    // step that states one for an instrument of that variable, chipped as lesson-typed. The rung is the step's text
    // verbatim under its own span; nothing is parsed out of it and no rung is invented where no document states one.
    const alarmStep =
      alarmRow === undefined
        ? data.steps.find((s) => /\balarm\b/i.test(s.actionText) && tagsIn(s.actionText).some((t) => variableOfTag(t) === variable))
        : undefined;
    const rowFact = (r: q.InterlockRowRow | undefined) => (r ? (rowItem(r)?.fact ?? null) : null);
    const stepFact = (s: q.OplStepRow): TypedFact | null => {
      const citation = cite(data.sources, s.spanId);
      return citation
        ? { label: `${s.oplId} step ${s.n}`, value_text: s.actionText, value_num: null, unit: null, comparator: null, source: citation, qualifier: null, source_class: "opl_step" }
        : null;
    };
    layers.normal = normalParam ? paramFact(normalParam) : null;
    layers.alarm = rowFact(alarmRow) ?? (alarmStep ? stepFact(alarmStep) : null);
    layers.trip = rowFact(tripRow);
    layers.relief = variable === "pressure" ? (rowFact(reliefRow) ?? (reliefParam ? paramFact(reliefParam) : null)) : null;
    if (alarmRow) alarmSource = `${alarmRow.rowKind} row ${alarmRow.rowId} of ${ilOf(alarmRow.equipmentTag)?.ceDocNo ?? alarmRow.equipmentTag}`;
    else if (alarmStep && layers.alarm) {
      alarmSource = `step ${alarmStep.n} of ${alarmStep.oplId}`;
      classesRead.add("opl");
    }
    ladderSil = silTextOf(ilOf((alarmRow ?? tripRow)?.equipmentTag ?? ""));
  }
  const present = LADDER_LAYERS.filter((l) => layers[l] !== null);
  if (variable !== null && present.length > 0) {
    for (const l of present) {
      const f = layers[l];
      if (f) typeFact("ladder", f);
    }
    const ladder: LadderItem = {
      variable,
      pressure: variable === "pressure",
      layers,
      alarm_source_class: alarmSource,
      sil_text: ladderSil,
      classes_read: [...classesRead].sort(),
    };
    push("ladder", [ladder]);
  }

  const responses: DocumentedResponseItem[] = [];
  for (const r of await q.troubleshootingRowsOf(db, data.opls.map((o) => o.oplId))) {
    const text = `${r.problem} ${r.cause} ${r.action}`;
    const variableHit = variable !== null && mentionsTerm(text, [variable]);
    if (!(mentionsTag(text, qTags) || mentionsTerm(text, terms) || variableHit)) continue;
    const o = data.opls.find((x) => x.oplId === r.oplId);
    const s = o ? data.lessonSpans.get(o.documentRevisionId) : undefined;
    if (!s) continue;
    responses.push({ opl_id: r.oplId, n: r.n, problem: r.problem, cause: r.cause, action: r.action, quoted_wo_number: r.quotedWoNumber, truncated: r.truncated, citation: citeSource(s, data.findings) });
  }
  push("documented_response", responses);

  const assetWos = new Set(data.workOrders.map((w) => w.woNumber));
  const precedent: PrecedentItem[] = [];
  for (const f of await q.familiesAll(db)) {
    const members = f.members.map((m) => m.wo_number).filter((wo) => assetWos.has(wo));
    if (members.length === 0) continue;
    const anchor = members.map((wo) => data.woSpans.get(wo)).find((s) => s !== undefined);
    const link = data.links.find((l) => members.includes(l.fromWo) || members.includes(l.toWo));
    const citation = anchor ? citeSource(anchor, data.findings) : link ? cite(data.sources, link.spanId) : null;
    if (!citation) continue;
    precedent.push({ family_id: f.id, label: f.label, basis: f.basis, review_status: f.reviewStatus, member_wo_numbers: members, citation });
  }
  push("precedent", precedent);

  // The typed layer: the rows the question's own tags name (its subject, whatever the moment), then the values of
  // the blocks the moment leads with, in that order. Deduplicated on the row's label and its span.
  const facts: TypedFact[] = [];
  const seenFact = new Set<string>();
  const addFact = (f: TypedFact) => {
    const key = `${f.source_class}|${f.label}|${f.source.span_id}`;
    if (seenFact.has(key)) return;
    seenFact.add(key);
    facts.push(f);
  };
  for (const r of data.rows.filter((r) => qTags.has(r.instrumentTag))) {
    const i = rowItem(r);
    if (i) addFact(i.fact);
  }
  for (const kind of order) if (lead.has(kind)) for (const f of factsOf.get(kind) ?? []) addFact(f);

  // A document's own metadata, last: the revision a reader is told to open, the approval wording that decides
  // whether it may be acted on, and who prepared, reviewed and approved it. 9.8 gives the packet no block for a
  // document, so the typed layer is the carrier; each value is the document_revision row's own column, cited to
  // that revision's own first span, which is its title block. Citing it is also what puts every document of the
  // scope into the evidence set, so a drawing nothing else reads is a source of the answer rather than a name.
  // source_class is the closed enum of 9.8 (FROZEN) and none of the six names a document row, so these carry the
  // sheet-header class the packet already uses for a typed field of the document itself.
  const scopeRevisions = await q.revisionsByIds(db, scope.revision_ids);
  const titleBlocks = await q.firstSpanOfRevisions(db, scope.revision_ids);
  for (const revisionId of scope.revision_ids) {
    const row = scopeRevisions.get(revisionId);
    const titleBlock = titleBlocks.get(revisionId);
    // A document the corpus gives no number of its own (the maintenance workbook) has no title-block line to name
    // these under, and its rows are already cited through the work orders; naming it by its internal id would put
    // an identifier no reader has ever seen on the packet.
    const name = titleBlock?.docNo ?? null;
    if (row === undefined || titleBlock === undefined || name === null || name.length === 0) continue;
    const source = citeSource(titleBlock, data.findings);
    for (const column of REVISION_COLUMNS) {
      const value = column.value(row);
      if (value === null || value.length === 0) continue;
      addFact({
        label: `${name} ${column.field}`,
        value_text: value,
        value_num: null,
        unit: column.unit,
        comparator: null,
        source,
        qualifier: null,
        source_class: "datasheet_param",
      });
    }
  }

  // What the P&ID sheets of the scope draw against what the typed documents state (deviation D-12). The sheets are
  // images: no span, no chunk, no citation, so the reading is named in the contradiction's subject with its
  // transcription basis and its review status, and only the governing sheet's own line is carried as a cited
  // reading. Nothing here is given a citation belonging to another document.
  const pidDocumentIds = scopeDocuments.filter((d) => d.class === "pid").map((d) => d.id);
  const subjectOf = new Map(scopeDocuments.map((d) => [d.id, d.subjectTag] as const));
  const sidecars: SidecarReading[] = [];
  for (const sheet of await pidSidecarsOf(db, pidDocumentIds)) {
    for (const defect of sheet.defects) {
      if (!SIDECAR_CONFLICT_RULES.has(defect.rule)) continue;
      sidecars.push({
        set: sheet.set,
        subject_tag: subjectOf.get(sheet.documentId) ?? null,
        rule: defect.rule,
        detail: defect.detail,
        basis: sheet.provenance.basis,
        review_status: sheet.provenance.review_status,
      });
    }
  }

  blocks.sort((a, b) => a.order - b.order);
  return { typed_facts: facts, blocks, procedure: bundle?.procedure ?? null, contradictions: contradictionsOf({ ...data, sidecars }) };
}

/**
 * What the scope's own documents state twice and differently: a datasheet field stated twice on the same sheet
 * (GS-21), the trip notes a cause-and-effect sheet carries although its own logic line says it protects nothing,
 * and what a P&ID sheet draws against what the cause-and-effect sheet types. The second is CD-17's defect and it
 * has no other carrier: the notes are the sheet's own sentences, each on its own span, and a "Reset note" block on
 * such a sheet would tell a reader there is a trip to reset. The third is the P&ID sidecar of D-12, below.
 */
export function contradictionsOf(
  data: Pick<AssetData, "params" | "sources"> &
    Partial<Pick<AssetData, "interlocks" | "rows" | "equipment">> & { sidecars?: readonly SidecarReading[] },
): Contradiction[] {
  const out: Contradiction[] = [];
  const rows = data.rows ?? [];

  // The P&ID readings, against the sheet that governs the same asset. The drawn reading is the sidecar's own
  // sentence, verbatim, and it sits in the subject because 9.8 (FROZEN) gives every entry of `readings` a required
  // Citation and the sheet has no span to cite: carrying it under the C&E sheet's citation would attribute the
  // drawing's text to a document that does not state it. The subject says so in the sidecar's own words.
  for (const s of data.sidecars ?? []) {
    const il = (data.interlocks ?? []).find((i) => i.equipmentTag === s.subject_tag);
    const governing = rows
      .filter((r) => r.equipmentTag === s.subject_tag)
      .map((r) => cite(data.sources, r.spanId))
      .find((c): c is Citation => c !== null);
    if (il === undefined || governing === undefined) continue;
    out.push({
      subject: `P&ID Set ${s.set} as drawn, against ${il.ceDocNo}: ${s.rule}. ${s.detail} ${sidecarBasisLine(s)}`,
      readings: [{ text: `${il.ceDocNo} REV ${il.ceRevision} LOGIC No ${il.seqId ?? "not stated"}`, citation: governing }],
      governing_document: governing,
    });
  }
  for (const il of data.interlocks ?? []) {
    if (il.logicKind !== "control_loop_only") continue;
    const readings: Array<{ text: string; citation: Citation }> = [];
    for (const n of il.notes) {
      const citation = cite(data.sources, n.span_id);
      if (citation) readings.push({ text: n.text, citation });
    }
    // The sheet's own rows are what governs: a control, alarm or relief row is what this sheet actually actuates.
    const governing = rows.filter((r) => r.equipmentTag === il.equipmentTag).map((r) => cite(data.sources, r.spanId)).find((c) => c !== null);
    const logic = (data.equipment ?? []).find((e) => e.tag === il.equipmentTag)?.interlockRef;
    if (readings.length === 0 || !governing) continue;
    out.push({
      subject: `${il.ceDocNo} notes${logic === undefined ? "" : `, against its own LOGIC No: ${logic}`}${il.silSheet === null ? " and SIL: N/A" : ""}`,
      readings,
      governing_document: governing,
    });
  }
  const byField = new Map<string, q.DatasheetParamRow[]>();
  for (const p of data.params) {
    const key = `${p.equipmentTag}|${p.field.toUpperCase()}`;
    byField.set(key, [...(byField.get(key) ?? []), p]);
  }
  for (const [, rows] of byField) {
    const values = new Set(rows.map((r) => r.valueText));
    if (values.size < 2) continue;
    const readings: Array<{ text: string; citation: Citation }> = [];
    for (const r of rows) {
      const citation = cite(data.sources, r.spanId);
      if (citation) readings.push({ text: r.valueText, citation });
    }
    const governing = readings[0]?.citation;
    if (readings.length >= 2 && governing) out.push({ subject: `${rows[0]?.equipmentTag} ${rows[0]?.field}`, readings, governing_document: governing });
  }
  return out;
}

/** The blocks of a documented bypass served verbatim, in BYPASS_ORDER (permit above the steps, AC-ANS-15). */
export function bypassBlocks(bundle: ProcedureBundle): Block[] {
  const out: Block[] = [];
  for (const [kind, items] of [
    ["permit", bundle.permit],
    ["steps", bundle.steps],
    ["functions_out_of_service", bundle.functions_out_of_service],
  ] as const) {
    const b = blockOf(kind, BYPASS_ORDER, items);
    if (b) out.push(b);
  }
  return out;
}

/**
 * The blocks of a documented-bypass answer (AC-ANS-15): the permit above the steps and the functions the isolation
 * takes out of service lead, then the rest of the typed layer follows in its own order, renumbered after them.
 */
export function withBypassBlocks(bundle: ProcedureBundle, rest: readonly Block[]): Block[] {
  const lead = bypassBlocks(bundle);
  const kinds = new Set(lead.map((b) => b.kind));
  const tail = rest.filter((b) => !kinds.has(b.kind)).map((b, i) => ({ ...b, order: lead.length + i + 1 }));
  return [...lead, ...tail];
}
