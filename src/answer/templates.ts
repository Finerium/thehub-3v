// Moment templates (ARCHITECTURE 7 step 8; blueprint 9.8 TypedFact and Block, 9.17; AC-ANS-16): typed facts and
// blocks read deterministically from interlock, interlock_row, start_permissive, datasheet_param, proof_test,
// work_order, causal_link, bom_match, opl, opl_step and troubleshooting_row, in the block order the golden set pins
// per template. Every item carries a Citation resolved from its own span, every TypedFact carries the sheet's own
// qualifier verbatim (the C&E note on training values, a proof test's result text), a block with no evidence is
// omitted, and nothing here generates a number, a sentence or a step: values are the rows' own columns. A row whose
// citation does not resolve (a work order with no workbook span) is omitted rather than cited without provenance.
import type { Block, Citation, TypedFact } from "@/contracts/generated/evidence_packet";
import type { Db } from "@/db/client";
import * as q from "@/db/queries/retrieval";
import { tokens } from "@/rulepack";
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
import { contentTerms, questionTags } from "./scope";
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

export const BLOCK_LABEL: Record<Kind, string> = {
  permissives: "Start permissives",
  proof_tests: "Last proof test per class",
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
  /** The retrieval of the same question: the lessons in its evidence order bind the steps and permit blocks. */
  retrieval?: Retrieval;
  /** The question as typed: its instrument tags and content terms select rows, lessons and work orders. */
  question?: string;
};

const OPL_ID = /OPL-[A-Z]{2}-\d{4}[A-Z]?-\d{2}/g;

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

type AssetData = {
  interlocks: q.InterlockRowType[];
  rows: q.InterlockRowRow[];
  permissives: q.PermissiveRow[];
  params: q.DatasheetParamRow[];
  proofTests: q.ProofTestRow[];
  workOrders: q.WorkOrderRow[];
  links: q.CausalLinkRow[];
  opls: q.OplRow[];
  sources: Sources;
  woSpans: Map<string, q.SpanSource>;
  lessonSpans: Map<string, q.SpanSource>;
  findings: Map<string, string[]>;
};

async function loadAsset(db: Db, tags: readonly string[]): Promise<AssetData> {
  const [interlocks, rows, params, proofTests, workOrders, links, opls] = await Promise.all([
    q.interlocksOf(db, tags),
    q.interlockRowsOf(db, tags),
    q.datasheetParamsOf(db, tags),
    q.proofTestsOf(db, tags),
    q.workOrdersOf(db, tags),
    q.causalLinksOf(db, tags),
    q.oplsOf(db, tags),
  ]);
  const seqIds = interlocks.map((i) => i.seqId).filter((s): s is string => s !== null);
  const permissives = await q.permissivesOf(db, seqIds);
  const [sources, woSpans, lessonSpans] = await Promise.all([
    loadSources(db, [
      ...rows.map((r) => r.spanId),
      ...permissives.map((p) => p.spanId),
      ...params.map((p) => p.spanId),
      ...links.map((l) => l.spanId),
      ...interlocks.flatMap((i) => i.notes.map((n) => n.span_id)),
    ]),
    q.workOrderSpans(db, [...proofTests.map((t) => t.woNumber), ...workOrders.map((w) => w.woNumber)]),
    q.firstSpanOfRevisions(db, opls.map((o) => o.documentRevisionId)),
  ]);
  const findings = await q.openFindingRuleIds(db, [
    ...new Set([...[...woSpans.values()], ...[...lessonSpans.values()]].map((s) => s.documentId)),
  ]);
  for (const [id, ruleIds] of sources.findings) findings.set(id, ruleIds);
  return { interlocks, rows, permissives, params, proofTests, workOrders, links, opls, sources, woSpans, lessonSpans, findings };
}

/** The C&E sheet's own note on its set points (the training-values note), verbatim, for every setpoint fact of that sheet. */
function setpointQualifier(il: q.InterlockRowType | undefined): string | null {
  if (!il) return null;
  const notes = il.notes.filter((n) => /set ?points?|training/i.test(n.text)).map((n) => n.text);
  return notes.length > 0 ? notes.join(" ") : null;
}

export async function typedFacts(db: Db, scope: Scope, template: Template | null, opts: TypedFactsOptions = {}): Promise<TypedFacts> {
  const empty: TypedFacts = { typed_facts: [], blocks: [], procedure: null, contradictions: [] };
  if (scope.tags.length === 0) return empty;
  const question = opts.question ?? "";
  const terms = question.length > 0 ? contentTerms(question) : [];
  const qTags = new Set<string>([...questionTags(question), ...scope.instrument_tags]);
  const seqSet = new Set<string>();
  const data = await loadAsset(db, scope.tags);
  for (const i of data.interlocks) if (i.seqId !== null) seqSet.add(i.seqId);
  const ilOf = (tag: string) => data.interlocks.find((i) => i.equipmentTag === tag);

  const facts: TypedFact[] = [];
  const blocks: Block[] = [];
  const order = template ? BLOCK_ORDER[template] : [];
  const push = (kind: Kind, items: readonly unknown[]) => {
    const b = blockOf(kind, order, items);
    if (b) blocks.push(b);
  };

  // --- interlock rows and their setpoint facts ------------------------------------------------------------------
  const rowItem = (r: q.InterlockRowRow): InterlockRowItem | null => {
    const citation = cite(data.sources, r.spanId);
    if (!citation) return null;
    const fact: TypedFact = {
      label: `${r.rowId} ${r.initiator} (${r.instrumentTag})`,
      value_text: r.setpointText,
      value_num: r.setpointValue,
      unit: r.setpointUnit,
      comparator: r.comparator,
      source: citation,
      qualifier: setpointQualifier(ilOf(r.equipmentTag)),
      source_class: "ce_row",
    };
    return { row_id: r.rowId, row_kind: r.rowKind, seq_id: r.seqId, initiator: r.initiator, instrument_tag: r.instrumentTag, voting: r.voting, fact };
  };
  const tripRows = data.rows.filter((r) => r.rowKind === "trip");
  const byQuestionTag = tripRows.filter((r) => qTags.has(r.instrumentTag));
  const byTerm = tripRows.filter((r) => mentionsTerm(`${r.initiator} ${r.setpointText}`, terms));
  const initiatorRows = byQuestionTag.length > 0 ? byQuestionTag : byTerm.length > 0 ? byTerm : tripRows;

  // --- lessons: the one named in the question, else the ones retrieval cited, in evidence order -------------------
  const lessonByDocument = new Map<string, q.OplRow>();
  for (const o of data.opls) {
    const s = data.lessonSpans.get(o.documentRevisionId);
    if (s) lessonByDocument.set(s.documentId, o);
  }
  const namedIds = [...new Set(question.toUpperCase().match(OPL_ID) ?? [])];
  const named = data.opls.filter((o) => namedIds.includes(o.oplId));
  const citedLessons: q.OplRow[] = [...named];
  for (const c of opts.retrieval?.evidence ?? []) {
    const o = lessonByDocument.get(c.document_id);
    if (o && !citedLessons.includes(o)) citedLessons.push(o);
  }
  const primary = citedLessons[0];
  let bundle: ProcedureBundle | null = null;
  if (primary && (order.includes("steps") || order.includes("permit"))) {
    bundle = await procedureOf(db, primary.oplId, [...qTags]);
  }

  const lessonItem = (o: q.OplRow): LessonItem | null => {
    const s = data.lessonSpans.get(o.documentRevisionId);
    if (!s) return null;
    return {
      opl_id: o.oplId,
      title: o.title,
      classification: o.classification,
      aspect: o.aspect,
      machine_drafted: o.machineDrafted,
      approver_alias: o.approverAlias,
      citation: citeSource(s, data.findings),
    };
  };

  // --- work orders related to the question ----------------------------------------------------------------------
  const woText = (w: q.WorkOrderRow) => `${w.problemDescription} ${w.rootCause} ${w.correctiveAction} ${w.sparePartsUsed}`;
  const initiatorTags = new Set(initiatorRows.map((r) => r.instrumentTag));
  const relatedWos = data.workOrders.filter((w) => {
    const text = woText(w);
    if (template === "trip" && w.relatedInterlock !== null && seqSet.has(w.relatedInterlock)) return true;
    return mentionsTag(text, qTags) || (template === "trip" && mentionsTag(text, initiatorTags)) || mentionsTerm(text, terms);
  });
  const woItem = (w: q.WorkOrderRow): WorkOrderItem | null => {
    const s = data.woSpans.get(w.woNumber);
    if (!s) return null;
    return {
      wo_number: w.woNumber,
      report_date: w.reportDate,
      work_type: w.workType,
      discipline: w.discipline,
      related_interlock: w.relatedInterlock,
      breakdown_kind: w.breakdownKind,
      closeout_complete: w.closeoutComplete,
      citation: citeSource(s, data.findings),
    };
  };

  // --- per template -----------------------------------------------------------------------------------------------
  if (template === "readiness" || template === "trip" || template === "job") {
    const seqs = [...seqSet];
    const permissives = permissiveItems(data.permissives.filter((p) => seqs.includes(p.seqId)), data.sources);
    if (template === "readiness") {
      push("permissives", permissives);
      const seen = new Set<string>();
      const tests: ProofTestItem[] = [];
      for (const t of data.proofTests) {
        // proofTestsOf orders by class then completion date descending: the first of each class is the last test.
        const key = `${t.equipmentTag}|${t.testClass}`;
        if (seen.has(key)) continue;
        const s = data.woSpans.get(t.woNumber);
        if (!s) continue;
        seen.add(key);
        const citation = citeSource(s, data.findings);
        tests.push({
          wo_number: t.woNumber,
          seq_id: t.seqId,
          device_tag: t.deviceTag,
          test_class: t.testClass,
          completion_date: t.completionDate,
          result_text: t.resultText,
          as_found: t.asFound,
          as_left: t.asLeft,
          citation,
        });
        facts.push({
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
      push("proof_tests", tests);
      push("standing_bypasses", permissives.filter((p) => p.standing_bypass_state !== null));
    }
    if (template === "trip") {
      const items = initiatorRows.map(rowItem).filter((i): i is InterlockRowItem => i !== null);
      for (const i of items) facts.push(i.fact);
      push("initiator_row", items);
      const effects: EffectItem[] = [];
      for (const r of initiatorRows) {
        const citation = cite(data.sources, r.spanId);
        if (citation) effects.push({ row_id: r.rowId, seq_id: r.seqId, instrument_tag: r.instrumentTag, effects: r.effects, effects_basis: r.effectsBasis, citation });
      }
      push("effects", effects);
      push("reset_note", data.interlocks.flatMap((il) => resetNotes(il, data.sources)));
      push("permissives", permissives);
      push("related_work_orders", relatedWos.map(woItem).filter((w): w is WorkOrderItem => w !== null));
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
      const sectionText = (o: q.OplRow) => `${o.title} ${o.aspect} ${o.sections.map((s) => s.body_text).join(" ")}`;
      let lessons = data.opls.filter((o) => mentionsTerm(sectionText(o), terms) || mentionsTag(sectionText(o), initiatorTags));
      if (lessons.length === 0) lessons = data.opls.filter((o) => [...seqSet].some((s) => o.relatedInterlockText.includes(s)));
      push("lessons", lessons.map(lessonItem).filter((l): l is LessonItem => l !== null));
    }
    if (template === "job") {
      const limits: TypedFact[] = [];
      for (const p of data.params) {
        const field = p.field.toUpperCase();
        const wanted =
          (p.group !== "header" && p.valueNum !== null) || field.includes("AREA CLASS") || field.includes("EX PROTECTION") || (p.group === "header" && field === "SERVICE");
        if (!wanted) continue;
        const citation = cite(data.sources, p.spanId);
        if (!citation) continue;
        limits.push({ label: `${p.group}: ${p.field}`, value_text: p.valueText, value_num: p.valueNum, unit: p.unit, comparator: null, source: citation, qualifier: null, source_class: "datasheet_param" });
      }
      facts.push(...limits);
      push("datasheet_limits", limits);
      const woSet = relatedWos.length > 0 ? relatedWos : data.workOrders;
      const matches = await q.bomMatchesOf(db, woSet.map((w) => w.woNumber));
      const items = await q.bomItemsByIds(db, matches.flatMap((m) => [m.bomItemId, m.alternativeBomItemId]).filter((id): id is string => id !== null));
      const bomSources = await loadSources(db, [...items.values()].map((i) => i.spanId));
      const parts: BomPartItem[] = [];
      for (const m of matches) {
        const item = m.bomItemId ? items.get(m.bomItemId) : undefined;
        const alt = m.alternativeBomItemId ? items.get(m.alternativeBomItemId) : undefined;
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
      push("related_work_orders", relatedWos.map(woItem).filter((w): w is WorkOrderItem => w !== null));
    }
    if (bundle) {
      push("steps", bundle.steps);
      push("permit", bundle.permit);
    }
    if (template === "job") {
      const isolated = [...new Set([...qTags, ...(primary ? lessonTags(primary) : [])])];
      push("functions_out_of_service", bundle ? bundle.functions_out_of_service : await functionsOutOfService(db, scope.tags, isolated));
      push("return_to_service", await returnToService(db, scope.tags));
    }
  }

  if (template === "reading") {
    const variable = variableOf(question, [...qTags]);
    const layers: Record<LadderLayer, TypedFact | null> = { normal: null, alarm: null, trip: null, relief: null };
    const classesRead = new Set<string>();
    let alarmSource: string | null = null;
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
      const rowFact = (r: q.InterlockRowRow | undefined) => (r ? (rowItem(r)?.fact ?? null) : null);
      const paramFact = (p: q.DatasheetParamRow | undefined): TypedFact | null => {
        if (!p) return null;
        const citation = cite(data.sources, p.spanId);
        return citation
          ? { label: `${p.group}: ${p.field}`, value_text: p.valueText, value_num: p.valueNum, unit: p.unit, comparator: null, source: citation, qualifier: null, source_class: "datasheet_param" }
          : null;
      };
      layers.normal = paramFact(normalParam);
      layers.alarm = rowFact(alarmRow);
      layers.trip = rowFact(tripRow);
      layers.relief = variable === "pressure" ? (rowFact(reliefRow) ?? paramFact(reliefParam)) : null;
      if (alarmRow) alarmSource = `${alarmRow.rowKind} row ${alarmRow.rowId} of ${ilOf(alarmRow.equipmentTag)?.ceDocNo ?? alarmRow.equipmentTag}`;
    }
    const present = LADDER_LAYERS.filter((l) => layers[l] !== null);
    if (variable !== null && present.length > 0) {
      for (const l of present) {
        const f = layers[l];
        if (f) facts.push(f);
      }
      const ladder: LadderItem = { variable, pressure: variable === "pressure", layers, alarm_source_class: alarmSource, classes_read: [...classesRead].sort() };
      push("ladder", [ladder]);
    }
    const rowsOfLessons = await q.troubleshootingRowsOf(db, data.opls.map((o) => o.oplId));
    const responses: DocumentedResponseItem[] = [];
    for (const r of rowsOfLessons) {
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
  }

  if (template === null) {
    // No moment: the typed facts the question's own tags select, no blocks.
    for (const r of data.rows.filter((r) => qTags.has(r.instrumentTag))) {
      const i = rowItem(r);
      if (i) facts.push(i.fact);
    }
  }

  blocks.sort((a, b) => a.order - b.order);
  return { typed_facts: facts, blocks, procedure: bundle?.procedure ?? null, contradictions: contradictionsOf(data) };
}

/** The datasheet's own contradictions: one field stated twice with different values on the same sheet (GS-21). */
export function contradictionsOf(data: Pick<AssetData, "params" | "sources">): Contradiction[] {
  const out: Contradiction[] = [];
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
