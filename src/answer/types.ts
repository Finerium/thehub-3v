// The interface between the retrieval side and the compose side of the answer lane (ARCHITECTURE section 7 steps
// 5, 6, 8 and 13; blueprint 9.7 AnswerTrace, 9.8 EvidencePacket, AC-ANS-01, AC-ANS-07, AC-ANS-16, AC-NFR-06).
// Every shape here is a pure value: the functions that produce them (resolveScope, retrieve, typedFacts,
// confidenceBand) live in their own modules and read the seeded database through Drizzle only. Zod at the
// boundary: Scope and ConfidenceInputs cross the wire (the search response, the trace), so they are schemas first.
import { z } from "zod";
import type { Citation, EvidencePacket, TypedFact, Block, Procedure } from "@/contracts/generated/evidence_packet";
import type { InterlockRow, StartPermissive } from "@/contracts/generated/asset";
import type { Chunk } from "@/contracts/generated/document";
import type { AnswerTrace } from "@/contracts/generated/serving";

/**
 * The resolved scope of a question (AC-ANS-01, deterministic): the equipment tags, the instrument tags and the
 * area aliases matched in the question, expanded through document_edge and instrument_tag.sources to the assets'
 * documents and their current revisions. `basis` names every step the expansion took, one line per step, so the
 * trace shows why a document is in scope; a family link appears only when the question names a failure family and
 * is labelled "family FF-nn: ..." in basis (a GA-1201A question never reaches LV-6701 otherwise).
 */
export const Scope = z
  .object({
    tags: z.array(z.string()),
    instrument_tags: z.array(z.string()),
    document_ids: z.array(z.string()),
    revision_ids: z.array(z.string()),
    basis: z.array(z.string()),
    family_ids: z.array(z.string()),
  })
  .strict();
export type Scope = z.infer<typeof Scope>;

/** The 9.7 AnswerTrace.scope shape: the tags and the basis lines joined, one string. */
export type TraceScope = AnswerTrace["scope"];

export function toTraceScope(scope: Scope): TraceScope {
  return { tags: scope.tags, basis: scope.basis.join("; ") };
}

/**
 * The retrieval unit of 9.2: a chunk of a current revision (or, traced, a superseded one) as the composer receives
 * it. The citation names the first span of the span table the chunk contains (page-exact, hash-exact, the anchor a
 * chip opens at); a chunk containing no span cites itself (span_id = chunk id, quote_hash = the chunk's). Either
 * way `anchor_text` is the text `citation.quote_hash` was stored over, so C2 recomputes it from what it is handed.
 */
export type RetrievedChunk = {
  /** The chunk id ("rev-<sha12>/c<nnn>"); AnswerTrace.retrieved_chunk_ids lists these. */
  chunk_id: string;
  unit_kind: Chunk["unit_kind"];
  /** The chunk text in the canonical form (9.2); the composer's evidence text and the verifier's span text. */
  text: string;
  citation: Citation;
  /** The text behind citation.quote_hash: the cited span's anchor text, or the chunk text when it cites itself. */
  anchor_text: string;
  /** The rerank key of ARCHITECTURE 7 step 6: lexical (2 exact tag, 1 tsquery hit, 0 none), then cosine similarity. */
  rank: { lexical: 0 | 1 | 2; cosine: number };
};

export const RETRIEVAL_K = 12 as const;

export type RetrieveOptions = {
  k: typeof RETRIEVAL_K;
  /** Only true from the labelled history toggle (AC-ANS-14); the caller traces it. */
  include_superseded: boolean;
  /** The corpus versions the sandbox may see (src/auth/sandbox.ts visibleVersionIds). */
  visible_version_ids: string[];
};

export type Retrieval = {
  /** One Citation per retrieved chunk, in rerank order. */
  evidence: Citation[];
  /** The same chunks with their text, in the same order. */
  chunks: RetrievedChunk[];
};

export type Template = NonNullable<EvidencePacket["template"]>;

export type Contradiction = EvidencePacket["contradictions"][number];

/** What templates.ts returns for a template (AC-ANS-16): the block order per template, empty blocks omitted. */
export type TypedFacts = {
  typed_facts: TypedFact[];
  blocks: Block[];
  procedure: Procedure | null;
  contradictions: Contradiction[];
};

/** The inputs of the band (9.7 AnswerTrace.confidence.inputs, AC-ANS-07); traced beside the band. */
export const ConfidenceInputs = z
  .object({
    question_coverage: z.number().min(0).max(1),
    source_count: z.number().int().min(0),
    approval_share: z.number().min(0).max(1),
  })
  .strict();
export type ConfidenceInputs = z.infer<typeof ConfidenceInputs>;

export type Band = EvidencePacket["confidence"]["band"];

// ---------------------------------------------------------------------------------------------------------------
// Block items, typed per kind (9.8 Block.items is unknown[] on the wire; these are the shapes templates.ts emits).
// Every item carries a Citation, so every block is cited (AC-ANS-16).
// ---------------------------------------------------------------------------------------------------------------
/** A start permissive (9.3 StartPermissive, the PermissiveGate row) with its citation. */
export type PermissiveItem = StartPermissive & { citation: Citation };

export type ProofTestItem = {
  wo_number: string;
  seq_id: string | null;
  device_tag: string | null;
  test_class: "sis_proof_test" | "sil_logic_test" | "calibration_proof_test" | "statutory_relief_test";
  completion_date: string;
  result_text: string;
  as_found: string | null;
  as_left: string | null;
  citation: Citation;
};

export type StandingBypassItem = PermissiveItem & { standing_bypass_state: string };

/** An interlock row as a block item: the typed setpoint fact plus the row's own columns. */
export type InterlockRowItem = {
  row_id: string;
  row_kind: "trip" | "control" | "alarm" | "mech";
  seq_id: string | null;
  initiator: string;
  instrument_tag: string;
  voting: string | null;
  fact: TypedFact;
};

/** The effects of one interlock row (9.3 InterlockRow.effects with effects_basis, the EffectsRow), cited. */
export type EffectItem = {
  row_id: string;
  seq_id: string | null;
  instrument_tag: string;
  effects: InterlockRow["effects"];
  effects_basis: string;
  citation: Citation;
};

export type ResetNoteItem = { n: number; text: string; citation: Citation };

export type WorkOrderItem = {
  wo_number: string;
  report_date: string;
  work_type: string;
  discipline: string;
  related_interlock: string | null;
  breakdown_kind: "unplanned" | "planned_flagged" | "none";
  closeout_complete: boolean;
  citation: Citation;
};

export type CausalLinkItem = {
  id: string;
  from_wo: string;
  to_wo: string;
  mechanism_noun: string;
  interval_days: number;
  linking_sentence: string;
  linking_field: "root_cause" | "problem_description";
  citation: Citation;
};

export type LessonItem = {
  opl_id: string;
  title: string;
  classification: "Basic Knowledge" | "Improvement" | "Trouble Case";
  aspect: string;
  machine_drafted: boolean;
  approver_alias: string | null;
  citation: Citation;
};

export type PermitItem = { text: string; source_section: 2 | 3 | 4; citation: Citation };

/** A protective function a job or a documented bypass takes out of service (9.8 Procedure.protective_functions_affected, cited). */
export type FunctionOutOfServiceItem = {
  seq_id: string;
  sil: number | null;
  ce_doc_no: string;
  isolated_elements: string[];
  effects_through_isolated_element: Array<{ effect_id: string; final_element: string }>;
  surviving_effects: Array<{ effect_id: string; final_element: string }>;
  standing_permissive_defeated: string | null;
  /** The pack's own permit route wording for a temporary bypass (9.10 routing_text), verbatim. */
  permit_route: string;
  citation: Citation;
};

/** The return-to-service block of a job: the permissives that must be TRUE and the latched-reset note, per function. */
export type ReturnToServiceItem = {
  seq_id: string;
  permissive_gate: "AND" | null;
  permissives: PermissiveItem[];
  reset_notes: ResetNoteItem[];
  citation: Citation;
};

export type StepItem = { n: number; text: string; acceptance_criterion: string | null; hash_ok: true; citation: Citation };

export type BomPartItem = {
  wo_number: string;
  part_string: string;
  status: "matched" | "unmatched";
  item_no: number | null;
  description: string | null;
  material: string | null;
  quantity: string | null;
  alternative_item_no: number | null;
  disambiguator_text: string | null;
  citation: Citation | null;
};

export const LADDER_LAYERS = ["normal", "alarm", "trip", "relief"] as const;
export type LadderLayer = (typeof LADDER_LAYERS)[number];

/** The setpoint ladder of a reading (AC-ANS-16): one item per block, layers null where no document states one. */
export type LadderItem = {
  variable: string;
  pressure: boolean;
  layers: Record<LadderLayer, TypedFact | null>;
  /** The source class of the alarm layer (the sheet row kind or the datasheet group), stated on the alarm rung. */
  alarm_source_class: string | null;
  /** The document classes read for the ladder, for the absence statement of src/lib/fixed-strings.ts. */
  classes_read: string[];
};

export type PrecedentItem = {
  family_id: string;
  label: string;
  basis: "analyst_classification" | "agent_classification";
  review_status: "reviewed" | "pending";
  member_wo_numbers: string[];
  citation: Citation;
};

export type DocumentedResponseItem = {
  opl_id: string;
  n: number;
  problem: string;
  cause: string;
  action: string;
  quoted_wo_number: string | null;
  truncated: boolean;
  citation: Citation;
};
