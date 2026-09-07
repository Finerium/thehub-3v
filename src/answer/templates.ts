// Moment templates (ARCHITECTURE 7 step 8; blueprint 9.8 TypedFact and Block, 9.17; AC-ANS-16): typed facts and
// blocks read deterministically from interlock, interlock_row, start_permissive, datasheet_param, proof_test,
// work_order, causal_link, bom_match, opl, opl_step and troubleshooting_row, in the block order the golden set pins
// per template. Every item carries a Citation resolved from its own span, every TypedFact carries the sheet's own
// qualifier verbatim (the C&E note on training values, a proof test's result text), a block with no evidence is
// omitted, and nothing here generates a number, a sentence or a step: values are the rows' own columns. A row whose
// citation does not resolve (a work order with no workbook span) is omitted rather than cited without provenance.
// The blocks are built from the scope's rows whatever moment was inferred; the template decides the order, which
// block leads and which values are typed facts (the diagnosis of 2026-09-07, rank 1: gating the existence of the
// typed layer on the moment left a question that infers no template with no block, no procedure and no fact).
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
  interlocks: q.InterlockRowType[];
  rows: q.InterlockRowRow[];
  permissives: q.PermissiveRow[];
  params: q.DatasheetParamRow[];
  proofTests: q.ProofTestRow[];
  workOrders: q.WorkOrderRow[];
  links: q.CausalLinkRow[];
  opls: q.OplRow[];
  steps: q.OplStepRow[];
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
  const oplIds = opls.map((o) => o.oplId);
  const [permissives, steps] = await Promise.all([q.permissivesOf(db, seqIds), q.oplStepsOf(db, oplIds)]);
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
  return { interlocks, rows, permissives, params, proofTests, workOrders, links, opls, steps, sources, woSpans, lessonSpans, findings };
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
  for (const i of data.interlocks) if (i.seqId !== null) seqSet.add(i.seqId);
  const ilOf = (tag: string) => data.interlocks.find((i) => i.equipmentTag === tag);

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
    return {
      row_id: r.rowId,
      row_kind: r.rowKind,
      seq_id: r.seqId,
      initiator: r.initiator,
      instrument_tag: r.instrumentTag,
      voting: r.voting,
      sil_text: silTextOf(ilOf(r.equipmentTag)),
      setpoint_text: r.setpointText,
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
  push("reset_note", data.interlocks.flatMap((il) => resetNotes(il, data.sources)));

  // --- permissives, standing bypasses and the last proof test per class -----------------------------------------
  const permissives = permissiveItems(data.permissives, data.sources);
  push("permissives", permissives);
  push("standing_bypasses", permissives.filter((p) => p.standing_bypass_state !== null));

  const seenTest = new Set<string>();
  const tests: ProofTestItem[] = [];
  for (const t of data.proofTests) {
    // proofTestsOf orders by class then completion date descending: the first of each class is the last test.
    const key = `${t.equipmentTag}|${t.testClass}`;
    if (seenTest.has(key)) continue;
    const s = data.woSpans.get(t.woNumber);
    if (!s) continue;
    seenTest.add(key);
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
  push("proof_tests", tests);

  // --- datasheet limits ------------------------------------------------------------------------------------------
  // Every numeric row of a group is a limit; a text-valued row joins it when the question's own terms or tags name
  // its field ("packing" naming the PACKING row), which is how a material, a fail action or a service reaches the
  // reader at all (the diagnosis of 2026-09-07, rank 20).
  const paramFact = (p: q.DatasheetParamRow): TypedFact | null => {
    const citation = cite(data.sources, p.spanId);
    return citation
      ? { label: `${p.group}: ${p.field}`, value_text: p.valueText, value_num: p.valueNum, unit: p.unit, comparator: null, source: citation, qualifier: null, source_class: "datasheet_param" }
      : null;
  };
  const limits: TypedFact[] = [];
  for (const p of data.params) {
    const field = p.field.toUpperCase();
    const wanted =
      (p.group !== "header" && p.valueNum !== null) ||
      field.includes("AREA CLASS") ||
      field.includes("EX PROTECTION") ||
      (p.group === "header" && field === "SERVICE") ||
      mentionsTag(p.field, qTags) ||
      mentionsTerm(p.field, terms);
    if (!wanted) continue;
    const fact = paramFact(p);
    if (fact) limits.push(fact);
  }
  push("datasheet_limits", limits);
  for (const f of limits) typeFact("datasheet_limits", f);

  // --- work orders, their parts and the causal chain -------------------------------------------------------------
  const woText = (w: q.WorkOrderRow) => `${w.problemDescription} ${w.rootCause} ${w.correctiveAction} ${w.sparePartsUsed}`;
  const relatedWos = data.workOrders.filter((w) => {
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
  push("related_work_orders", relatedWos.map(woItem).filter((w): w is WorkOrderItem => w !== null));

  const woSet = relatedWos.length > 0 ? relatedWos : data.workOrders;
  const matches = await q.bomMatchesOf(db, woSet.map((w) => w.woNumber));
  const bomItems = await q.bomItemsByIds(db, matches.flatMap((m) => [m.bomItemId, m.alternativeBomItemId]).filter((id): id is string => id !== null));
  const bomSources = await loadSources(db, [...bomItems.values()].map((i) => i.spanId));
  const parts: BomPartItem[] = [];
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
    return {
      opl_id: o.oplId,
      title: o.title,
      classification: o.classification,
      aspect: o.aspect,
      discipline: o.discipline,
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
    const rowFact = (r: q.InterlockRowRow | undefined) => (r ? (rowItem(r)?.fact ?? null) : null);
    layers.normal = normalParam ? paramFact(normalParam) : null;
    layers.alarm = rowFact(alarmRow);
    layers.trip = rowFact(tripRow);
    layers.relief = variable === "pressure" ? (rowFact(reliefRow) ?? (reliefParam ? paramFact(reliefParam) : null)) : null;
    if (alarmRow) alarmSource = `${alarmRow.rowKind} row ${alarmRow.rowId} of ${ilOf(alarmRow.equipmentTag)?.ceDocNo ?? alarmRow.equipmentTag}`;
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
