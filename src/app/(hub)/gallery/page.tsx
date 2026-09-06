// The component gallery (blueprint 6.4, one hand): every component of the inventory rendered once with synthetic
// props, one section per component, behind login like every surface. It is the reference the verifier reads against
// 7.1 and 7.3 and the sheet the surface builders copy from. Nothing here is corpus text and no figure is a plant
// figure: every id, sentence and number is a labelled example (EX-, WO-000001, 12.3, 1oo2); the underlay is a
// blank synthetic sheet, not a document. The gallery reads no database and binds to no fixture.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AbstentionCard } from "@/components/AbstentionCard";
import { BandBars } from "@/components/BandBars";
import { CaveatLine } from "@/components/CaveatLine";
import { Chain } from "@/components/ChainHop";
import { CitationChip } from "@/components/CitationChip";
import { ClosedoutChip } from "@/components/ClosedoutChip";
import { ClusterCard } from "@/components/ClusterCard";
import { ConfidenceBand } from "@/components/ConfidenceBand";
import { ContradictionChip } from "@/components/ContradictionChip";
import { CopyId } from "@/components/CopyId";
import { DesignedState } from "@/components/DesignedState";
import { EffectsRow } from "@/components/EffectsRow";
import { EmptyState } from "@/components/EmptyState";
import { EvidenceList } from "@/components/EvidenceLine";
import { FamilyList, PrecedentPanel } from "@/components/FamilyList";
import { FilterBar } from "@/components/FilterBar";
import { GlassPanel } from "@/components/GlassPanel";
import { HotspotLayer } from "@/components/HotspotLayer";
import { IntegrityDot } from "@/components/IntegrityDot";
import { Ladder } from "@/components/Ladder";
import { LayerToggle } from "@/components/LayerToggle";
import { MethodChip } from "@/components/MethodChip";
import { NeumorphicChip } from "@/components/NeumorphicChip";
import { PageViewer } from "@/components/PageViewer";
import { Pagination } from "@/components/Pagination";
import { PartialAnswerBanner } from "@/components/PartialAnswerBanner";
import { PermissiveGate } from "@/components/PermissiveGate";
import { ProofTestCard } from "@/components/ProofTestCard";
import { RefusalCard } from "@/components/RefusalCard";
import { RequestLessonAction } from "@/components/RequestLessonAction";
import { SearchResultList, SearchResultRow } from "@/components/SearchResultRow";
import { SensitivityStrip } from "@/components/SensitivityStrip";
import { StatusBadge, type StatusKind } from "@/components/StatusBadge";
import { TagCard } from "@/components/TagCard";
import { TraceView } from "@/components/TraceView";
import { TypedFactGrid } from "@/components/TypedFactCard";
import { VerdictStrip } from "@/components/VerdictStrip";
import { VersionBadge } from "@/components/VersionBadge";
import type { DatasheetParam, InstrumentTag, InterlockRow, PidSidecar, StartPermissive } from "@/contracts/generated/asset";
import type { DebtCluster } from "@/contracts/generated/coverage";
import type { Abstention, Citation, Claim, EvidencePacket, Refusal, TypedFact } from "@/contracts/generated/evidence_packet";
import type { CausalLink, FailureFamily, ProofTest } from "@/contracts/generated/operations";
import { AnswerTrace } from "@/contracts/generated/serving";
import { ASSUMPTION_LABEL, AS_BUILT_CAVEAT, ENTAILED, STATUS_WORDING } from "@/lib/fixed-strings";
import "@/components/system.css";

export const metadata: Metadata = { title: "Gallery" };

/* Synthetic props. Every value is an example; none binds to the corpus, the fixture or the database. ----------- */

const ZERO_HASH = "0".repeat(64);
const EXAMPLE_HASH = "0123abcd4567ef890123abcd4567ef890123abcd4567ef890123abcd4567ef89";
const EQUIPMENT = "EX-0001A";
const INSTRUMENT = "EXT-0001";
const SEQ = "SEQ-0000";
const WO = (n: number) => `WO-00000${n}`;
const STAMP = "2026-01-01T00:00:00Z";

function cite(n: number, extra: Partial<Citation> = {}): Citation {
  return {
    doc_no: `EX-DOC-00${n}`,
    document_id: `doc-example-${n}`,
    revision: `X${n}`,
    approval_status: "approved",
    approval_status_text: "Example approval text",
    page: n,
    span_id: `span-example-${n}`,
    quote_hash: ZERO_HASH,
    integrity_findings: [],
    superseded: false,
    ...extra,
  };
}

const CITE_PLAIN = cite(1);
const CITE_FINDINGS = cite(2, { integrity_findings: ["EX-RULE-1", "EX-RULE-2"], approval_status: "issued_for_review", approval_status_text: "Example review text" });
const CITE_SUPERSEDED = cite(3, { superseded: true, revision: "X0" });

const CLAIMS: Claim[] = [
  { id: "claim-example-1", text: "Example claim one, served from a synthetic sheet with one citation.", citations: [CITE_PLAIN], entailment: ENTAILED },
  { id: "claim-example-2", text: "Example claim two, with two citations, one of them carrying open findings.", citations: [CITE_PLAIN, CITE_FINDINGS], entailment: ENTAILED },
  { id: "claim-example-3", text: "Example claim three, served by the history toggle from a superseded revision.", citations: [CITE_SUPERSEDED], entailment: ENTAILED },
];

const FACTS: TypedFact[] = [
  { label: "Example trip setpoint", value_text: "12.3", value_num: 12.3, unit: "unit", comparator: ">", source: CITE_PLAIN, qualifier: "Example qualifier note as the synthetic sheet writes it.", source_class: "ce_row" },
  { label: "Example design value", value_text: "45.6", value_num: 45.6, unit: "unit", comparator: null, source: CITE_FINDINGS, qualifier: null, source_class: "datasheet_param" },
  { label: "Example vote", value_text: "1oo2", value_num: null, unit: null, comparator: null, source: CITE_PLAIN, qualifier: null, source_class: "ce_row" },
];

const PACKET: EvidencePacket = {
  trace_id: "trace-example-0001",
  corpus_version: "vX",
  outcome: "answer",
  template: "trip",
  rulepack: { version: "vX", class: "none" },
  claims: CLAIMS,
  typed_facts: FACTS,
  blocks: [],
  procedure: null,
  contradictions: [],
  abstention: null,
  refusal: null,
  gaps_declared: [],
  confidence: { band: "high" },
  caveat: AS_BUILT_CAVEAT,
  safety_notice: null,
  mode: "seeded",
};

const VERDICT = AnswerTrace.shape.verifier_verdicts.element.shape.verdict.enum;

const TRACE: AnswerTrace = {
  id: "trace-example-0001",
  question: "",
  language_detected: "en",
  template: "trip",
  scope: { tags: [EQUIPMENT, INSTRUMENT], basis: "example basis: tag mention and graph neighbourhood" },
  rulepack: { version: "vX", class: "none", rule_id: null, matched_phrase: null, decided_at: STAMP },
  retrieved_chunk_ids: ["chunk-example-1", "chunk-example-2", "chunk-example-3"],
  prompts: [
    { role: "AG-2", version: "v1", sha256: EXAMPLE_HASH },
    { role: "AG-4", version: "v1", sha256: EXAMPLE_HASH },
  ],
  verifier_verdicts: [
    { sentence_id: "s1", verdict: VERDICT.entailed, span_id: "span-example-1", reason: "Example reason: the span states the sentence." },
    { sentence_id: "s2", verdict: VERDICT.not_entailed, span_id: null, reason: "Example reason: no span states the sentence, dropped by C6." },
  ],
  gate_results: {
    C1: { pass: true, detail: "Example detail for C1." },
    C2: { pass: true, detail: "Example detail for C2." },
    C3: { pass: true, detail: "Example detail for C3." },
    C4: { pass: false, detail: "Example detail for C4, the failing gate of this example." },
    C5: { pass: true, detail: "Example detail for C5." },
    C6: { pass: true, detail: "Example detail for C6." },
  },
  repair_rounds: 1,
  confidence: { band: "medium", inputs: { question_coverage: 0.5, source_count: 2, approval_share: 0.5 } },
  outcome: "partial",
  packet: { ...PACKET, outcome: "partial", gaps_declared: ["Example gap one, declared."] },
  model_ids: { "AG-2": "example-model-id", "AG-4": "example-model-id" },
  corpus_version_id: "cv-example-0001",
  user_alias: "example_alias",
  server_ts: STAMP,
};

const ABSTENTION: Abstention = {
  reason: "Example reason: no approved current revision in scope states what the question asks.",
  escalation_role: "Reliability engineer",
  nearest_documents: [cite(1), cite(2), cite(3)],
  cluster: { id: "cluster-example-1", request_action: true },
  served_beside: [FACTS[0]],
};

const REFUSAL_DEFEAT: Refusal = {
  class: "defeat",
  function: { seq_id: SEQ, sil: 1, ce_doc_no: "EX-DOC-001", ce_revision: "X1" },
  permissives: [
    { n: 1, text: "Example permissive one, verbatim from the synthetic sheet.", signal_tag: "EXS-0001" },
    { n: 2, text: "Example permissive two, verbatim from the synthetic sheet.", signal_tag: null },
  ],
  reset_note: "Example reset note, verbatim from the synthetic sheet.",
  route_text: "Example route text: the bypass or override permit route as the synthetic pack words it.",
  moc_text: null,
  rule_id: "EX-RULE-DEFEAT",
  matched_phrase: "example matched phrase",
};

const REFUSAL_CHANGE: Refusal = {
  ...REFUSAL_DEFEAT,
  class: "permanent_change",
  function: { seq_id: SEQ, sil: null, ce_doc_no: "EX-DOC-001", ce_revision: "X1" },
  moc_text: "Example Management of Change text, shown on the permanent-change class only.",
  rule_id: "EX-RULE-CHANGE",
};

const CONTRADICTION: EvidencePacket["contradictions"][number] = {
  subject: "Example subject of the contradiction",
  readings: [
    { text: "Example reading one, as the first synthetic document states it.", citation: cite(1) },
    { text: "Example reading two, as the second synthetic document states it.", citation: cite(2) },
  ],
  governing_document: cite(1),
};

const CLUSTER: DebtCluster = {
  id: "cluster-example-1",
  equipment_tag: EQUIPMENT,
  corpus_version_id: "cv-example-0001",
  uncovered_wo_numbers: [WO(1), WO(2), WO(3)],
  factors: { D_hours: 12.3, D_max: 45.6, C_idr: 1234500, C_max: 9876500, k: 0.5, r: 0.25 },
  coefficients: { a: 0.4, b: 0.3, c: 0.2, d: 0.1, basis: ASSUMPTION_LABEL },
  incomplete_uncovered: 2,
  score: 0.1234,
  rank: 1,
};

const LINKS: CausalLink[] = [
  { id: "link-example-1", from_wo: WO(1), to_wo: WO(2), equipment_tag: EQUIPMENT, mechanism_noun: "example noun", interval_days: 12, linking_sentence: "Example linking sentence, verbatim from the synthetic record.", linking_field: "root_cause", span_id: "span-example-1" },
  { id: "link-example-2", from_wo: WO(2), to_wo: WO(3), equipment_tag: EQUIPMENT, mechanism_noun: "example noun", interval_days: 34, linking_sentence: "Example second linking sentence, verbatim from the synthetic record.", linking_field: "problem_description", span_id: "span-example-2" },
];

const FAMILY: FailureFamily = {
  id: "family-example-1",
  label: "Example family",
  basis: "agent_classification",
  review_status: "pending",
  members: [
    { wo_number: WO(1), recorded_root_cause: "Example recorded root cause one." },
    { wo_number: WO(2), recorded_root_cause: "Example recorded root cause two." },
    { wo_number: WO(3), recorded_root_cause: "Example recorded root cause three." },
  ],
};
const FAMILY_REVIEWED: FailureFamily = { ...FAMILY, id: "family-example-2", label: "Example reviewed family", basis: "analyst_classification", review_status: "reviewed", members: FAMILY.members.slice(0, 2) };

const LADDER_FACT = (label: string, value: string, cmp: string | null, cls: TypedFact["source_class"], qualifier: string | null = null): TypedFact => ({
  label,
  value_text: value,
  value_num: null,
  unit: "unit",
  comparator: cmp,
  source: cls === "datasheet_param" ? CITE_FINDINGS : CITE_PLAIN,
  qualifier,
  source_class: cls,
});

const PROOF_TESTS: ProofTest[] = [
  { wo_number: WO(4), equipment_tag: EQUIPMENT, seq_id: SEQ, device_tag: INSTRUMENT, test_class: "sis_proof_test", completion_date: "2026-01-02", result_text: "Example result text, verbatim.", as_found: "12.3", as_left: "12.3" },
  { wo_number: WO(5), equipment_tag: EQUIPMENT, seq_id: SEQ, device_tag: INSTRUMENT, test_class: "sis_proof_test", completion_date: "2025-01-02", result_text: "Example earlier result text, verbatim.", as_found: null, as_left: null },
];

const PERMISSIVES: StartPermissive[] = [
  { seq_id: SEQ, n: 1, text: "Example permissive one, verbatim.", signal_tag: "EXS-0001", standing_bypass_state: null, span_id: "span-example-1" },
  { seq_id: SEQ, n: 2, text: "Example permissive two, verbatim.", signal_tag: "EXS-0002", standing_bypass_state: "example standing bypass state", span_id: "span-example-2" },
  { seq_id: SEQ, n: 3, text: "Example permissive three, verbatim, with no signal tag.", signal_tag: null, standing_bypass_state: null, span_id: "span-example-3" },
];

const ROW_TRIP: InterlockRow = {
  id: "row-example-1",
  seq_id: SEQ,
  equipment_tag: EQUIPMENT,
  row_id: "T1",
  row_kind: "trip",
  initiator: "Example initiator",
  instrument_tag: INSTRUMENT,
  setpoint_value: 12.3,
  setpoint_unit: "unit",
  comparator: ">",
  setpoint_text: "> 12.3 unit",
  voting: "1oo2",
  vote_cell_text: "1oo2",
  effects: [
    { effect_id: "E1", final_element: "EXV-0001", marked: true },
    { effect_id: "E2", final_element: "EXV-0002", marked: false },
    { effect_id: "E3", final_element: "EXM-0001", marked: true },
    { effect_id: "E4", final_element: "EXA-0001", marked: false },
  ],
  effects_basis: "example basis: the marked cells of the synthetic row",
  source_page: 1,
  span_id: "span-example-1",
};
const ROW_ALARM: InterlockRow = { ...ROW_TRIP, id: "row-example-2", row_id: "A1", row_kind: "alarm", setpoint_text: "> 11.1 unit", setpoint_value: 11.1, voting: null, vote_cell_text: "", effects: [{ effect_id: "E4", final_element: "EXA-0001", marked: true }], span_id: "span-example-2" };

const TAG: InstrumentTag = { tag: INSTRUMENT, equipment_tag: EQUIPMENT, role: "initiator", sources: ["doc-example-1", "doc-example-2"] };
const LIMITS: DatasheetParam[] = [
  { id: "param-example-1", equipment_tag: EQUIPMENT, group: "Example group", field: "Example field one", unit: "unit", value_text: "45.6", value_num: 45.6, span_id: "span-example-2" },
  { id: "param-example-2", equipment_tag: EQUIPMENT, group: "Example group", field: "Example field two", unit: null, value_text: "example text value", value_num: null, span_id: "span-example-2" },
];

const SIDECAR: Pick<PidSidecar, "set" | "document_id" | "hotspots" | "defects" | "provenance"> = {
  set: 0,
  document_id: "doc-example-9",
  hotspots: [
    { id: "hs-example-1", as_drawn_text: INSTRUMENT, bound_tag: INSTRUMENT, unbound_reason: null, role: "initiator", drawn_setpoint: "12.3", foreign: false, x_frac: 0.12, y_frac: 0.18, w_frac: 0.14, h_frac: 0.12 },
    { id: "hs-example-2", as_drawn_text: "EXX-0002", bound_tag: null, unbound_reason: "example unbound reason", role: "unknown", drawn_setpoint: null, foreign: false, x_frac: 0.48, y_frac: 0.3, w_frac: 0.16, h_frac: 0.12 },
    { id: "hs-example-3", as_drawn_text: "EXF-0003", bound_tag: "EXF-0003", unbound_reason: null, role: "monitor", drawn_setpoint: null, foreign: true, x_frac: 0.7, y_frac: 0.58, w_frac: 0.14, h_frac: 0.12 },
  ],
  defects: [{ rule: "EX-RULE-9", detail: "Example defect detail, as the synthetic sidecar words it." }],
  provenance: { basis: "agent_transcription", alias: "example_alias", date: "2026-01-01", reviewed_by: null, reviewed_at: null, review_status: "pending" },
};

// A blank synthetic drafting sheet as the underlay: a grid and a title block that says what it is. Not a document.
const UNDERLAY_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">',
  '<rect width="1600" height="1000" fill="#f8f5ee"/>',
  '<g stroke="#ddd6c8" stroke-width="1">',
  ...Array.from({ length: 33 }, (_, i) => `<path d="M${i * 50} 0V1000"/>`),
  ...Array.from({ length: 21 }, (_, i) => `<path d="M0 ${i * 50}H1600"/>`),
  "</g>",
  '<rect x="40" y="40" width="1520" height="920" fill="none" stroke="#8a847a" stroke-width="2"/>',
  '<rect x="1140" y="850" width="420" height="110" fill="#fbf9f4" stroke="#8a847a" stroke-width="2"/>',
  '<text x="1165" y="895" font-family="monospace" font-size="24" fill="#45413a">SYNTHETIC UNDERLAY</text>',
  '<text x="1165" y="930" font-family="monospace" font-size="16" fill="#67625a">gallery reference sheet, not a document</text>',
  "</svg>",
].join("");
const UNDERLAY = `data:image/svg+xml;utf8,${encodeURIComponent(UNDERLAY_SVG)}`;

const CHIP_ICON = (
  <svg viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M3 8h10M8 3v10" />
  </svg>
);

/* The sheet ------------------------------------------------------------------------------------------------------ */

type SectionSpec = { id: string; title: string; note: string };

const SECTIONS: SectionSpec[] = [
  { id: "neumorphic-chip", title: "NeumorphicChip", note: "Tactile controls only. Default, active (aria-pressed with the filled mark), disabled, with an icon; every state carries a label or an icon beside the shadow." },
  { id: "citation-chip", title: "CitationChip and GlassDrawer", note: "doc_no, revision, approval status text, page; the integrity dot when findings are open; the superseded marker. Click or Enter opens the glass drawer at the span; Escape closes it and focus returns to the chip." },
  { id: "evidence-line", title: "EvidenceLine", note: "One claim per line with its citation chips and the entailment mark. Chips are compact here; the drawer carries a PageViewer at the span." },
  { id: "typed-fact-card", title: "TypedFactCard", note: "Label, value in mono with comparator and unit, the qualifier line verbatim in the caveat token, the source chip and the source-class tag." },
  { id: "verdict-strip", title: "VerdictStrip", note: "C1 to C6 with the glyph and the word, the repair-round count and the trace link." },
  { id: "confidence-band", title: "ConfidenceBand", note: "High, medium or low as three notches with the word; the three inputs on hover and on focus." },
  { id: "abstention-card", title: "AbstentionCard", note: "Reason, escalation role, three nearest documents as chips, the cluster link with the request-a-lesson action, served-beside facts." },
  { id: "refusal-card", title: "RefusalCard", note: "The governing sheet chip with LOGIC No and SIL, the permissive rows, the reset note, the route text; the Management of Change text only on the permanent-change class." },
  { id: "partial-answer-banner", title: "PartialAnswerBanner", note: "The gaps declared, one per line, above the entailed claims." },
  { id: "contradiction-chip", title: "ContradictionChip", note: "Subject, both readings with their chips, the governing document named and rimmed." },
  { id: "closeout-chip", title: "ClosedoutChip", note: "The incomplete-closeout wording, the empty fields and the priority, linking to the CD-4 finding." },
  { id: "caveat-line", title: "CaveatLine", note: "The fixed as-built caveat and the fixed unverified-value line in the caveat token, read from fixed-strings.ts." },
  { id: "band-bars", title: "BandBars", note: "The three bands scaled to the population; the bars animate only while recountKey changes." },
  { id: "layer-toggle", title: "LayerToggle and SensitivityStrip", note: "Generous and strict side by side; the sensitivity ladder with the current threshold marked." },
  { id: "method-chip", title: "MethodChip", note: "Threshold, layer, window, recipe and stop-list hash prefixes, the extractor string; expands to the full values." },
  { id: "cluster-card", title: "ClusterCard", note: "Rank, asset, score with the incomplete-closeout count beside it, the four factors with their maxima, the coefficients labelled ASSUMPTION, the uncovered work orders with their matched unit, the request action." },
  { id: "chain-hop", title: "ChainHop", note: "From and to work orders on the accent rail, the mechanism noun, the interval in days, the linking sentence verbatim with its field, the basis line." },
  { id: "family-list", title: "FamilyList and PrecedentPanel", note: "Explicit membership with the recorded root cause per member; the basis label with its review status; the current record marked in the precedent panel." },
  { id: "ladder", title: "Ladder", note: "Normal band, alarm, trip and relief with a source-class chip per layer; the absence statement where a layer has no source; the relief layer omitted at a non-pressure variable; the vote cell verbatim; the caveat line. Layers draw in sequence on first render." },
  { id: "proof-test-card", title: "ProofTestCard", note: "Per test class: the latest record with date and result, the earlier records, as-found and as-left where recorded, the statement that no document types an interval." },
  { id: "permissive-gate", title: "PermissiveGate and EffectsRow", note: "The AND-gate rows with signal tags and a standing bypass state where recorded; the marked effects with their final elements and the not-actuated effects stated." },
  { id: "hotspot-layer", title: "HotspotLayer", note: "The underlay with fractional hotspot rectangles (bound, unbound, foreign), the provenance line with the transcription basis and review status, the sidecar defect list. The underlay here is a blank synthetic sheet." },
  { id: "tag-card", title: "TagCard", note: "The tag's role, its typed rows with setpoint and vote cell verbatim, its related work orders with their chain place, the datasheet limits of its equipment." },
  { id: "trace-view", title: "TraceView", note: "The replay panels of surface 3 with copy-to-clipboard on every id; the question text is never rendered." },
  { id: "page-viewer", title: "PageViewer", note: "One page at a time, previous and next as hash links in the #page=n&span=<span_id> form, the span highlight resolved from a prop." },
  { id: "list-primitives", title: "FilterBar, Pagination, SearchResultRow", note: "The register and list primitives: a GET form, a bound-aware pager, result rows without reveal animation." },
  { id: "integrity-dot", title: "IntegrityDot", note: "A static defect-red mark whose accessible name lists the open rule ids; a link into the register when one is passed." },
  { id: "primitives", title: "StatusBadge, VersionBadge, EmptyState, DesignedState", note: "The M0 primitives the surfaces already use, for reference beside the rest." },
];

function Section({ spec, children }: { spec: SectionSpec; children: ReactNode }) {
  return (
    <section id={spec.id} className="gallery-section" aria-labelledby={`${spec.id}-title`} data-gallery={spec.id}>
      <header>
        <h2 id={`${spec.id}-title`}>{spec.title}</h2>
        <p>{spec.note}</p>
      </header>
      {children}
    </section>
  );
}

const S = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<string, SectionSpec>;

const drawerFor = (c: Citation) => <PageViewer documentId={c.document_id} page={c.page} pageCount={3} src={UNDERLAY} span={{ id: c.span_id, box: { x_frac: 0.2, y_frac: 0.4, w_frac: 0.5, h_frac: 0.06 } }} />;

export default function GalleryPage() {
  return (
    <div className="gallery">
      <header>
        <h1 className="text-[34px]">Gallery</h1>
        <p className="mt-1 max-w-prose text-[13.5px] text-ink-700">
          The design-system inventory of blueprint 6.4 rendered with synthetic props. Every id, sentence and number on this sheet is an example; none binds to the corpus, the fixture or the database.
        </p>
        <nav className="gallery-index mt-4" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="draw">
              {s.title}
            </a>
          ))}
        </nav>
      </header>

      <Section spec={S["neumorphic-chip"]}>
        <div className="gallery-row">
          <NeumorphicChip>Default chip</NeumorphicChip>
          <NeumorphicChip active>Active chip</NeumorphicChip>
          <NeumorphicChip disabled>Disabled chip</NeumorphicChip>
          <NeumorphicChip icon={CHIP_ICON}>With icon</NeumorphicChip>
          <NeumorphicChip size="sm" active icon={CHIP_ICON}>
            Small, active, icon
          </NeumorphicChip>
        </div>
      </Section>

      <Section spec={S["citation-chip"]}>
        <div className="gallery-row">
          <CitationChip citation={CITE_PLAIN}>{drawerFor(CITE_PLAIN)}</CitationChip>
          <CitationChip citation={CITE_FINDINGS}>{drawerFor(CITE_FINDINGS)}</CitationChip>
          <CitationChip citation={CITE_SUPERSEDED}>{drawerFor(CITE_SUPERSEDED)}</CitationChip>
          <CitationChip citation={CITE_PLAIN} compact />
        </div>
        <p className="gallery-note">The fourth chip is compact (the approval status text stays in the drawer) and carries no page render.</p>
      </Section>

      <Section spec={S["evidence-line"]}>
        <GlassPanel className="p-5">
          <EvidenceList claims={CLAIMS} drawerFor={drawerFor} aria-label="Example claims" />
        </GlassPanel>
      </Section>

      <Section spec={S["typed-fact-card"]}>
        <TypedFactGrid facts={FACTS} drawerFor={(f) => drawerFor(f.source)} />
      </Section>

      <Section spec={S["verdict-strip"]}>
        <div className="gallery-stack">
          <VerdictStrip results={TRACE.gate_results} repairRounds={TRACE.repair_rounds} traceHref="#trace-view" />
          <VerdictStrip results={{ ...TRACE.gate_results, C4: { pass: true, detail: "Example detail for C4, passing." } }} repairRounds={0} />
        </div>
      </Section>

      <Section spec={S["confidence-band"]}>
        <div className="gallery-row">
          <ConfidenceBand band="high" inputs={{ question_coverage: 0.9, source_count: 3, approval_share: 1 }} />
          <ConfidenceBand band="medium" inputs={TRACE.confidence.inputs} />
          <ConfidenceBand band="low" inputs={{ question_coverage: 0.2, source_count: 1, approval_share: 0.5 }} />
        </div>
      </Section>

      <Section spec={S["abstention-card"]}>
        <AbstentionCard abstention={ABSTENTION} clusterHref="#cluster-card" requestHref="#cluster-card" drawerFor={drawerFor} />
      </Section>

      <Section spec={S["refusal-card"]}>
        <div className="gallery-stack">
          <RefusalCard refusal={REFUSAL_DEFEAT} sheetHref="#page-viewer" />
          <RefusalCard refusal={REFUSAL_CHANGE} />
        </div>
      </Section>

      <Section spec={S["partial-answer-banner"]}>
        <PartialAnswerBanner gaps={["Example gap one, declared.", "Example gap two, declared."]} />
      </Section>

      <Section spec={S["contradiction-chip"]}>
        <ContradictionChip contradiction={CONTRADICTION} drawerFor={drawerFor} />
      </Section>

      <Section spec={S["closeout-chip"]}>
        <ClosedoutChip woNumber={WO(1)} emptyFields={["example_field_a", "example_field_b"]} priority="Medium" findingHref="#integrity-dot" />
      </Section>

      <Section spec={S["caveat-line"]}>
        <div className="gallery-stack">
          <CaveatLine kind="as_built" />
          <CaveatLine kind="unverified_value" />
        </div>
      </Section>

      <Section spec={S["band-bars"]}>
        <GlassPanel className="max-w-xl p-5">
          <BandBars bands={{ no_lesson: 12, copied_row_only: 3, taught: 5 }} populationCount={20} recountKey="cv-example-0001" />
        </GlassPanel>
      </Section>

      <Section spec={S["layer-toggle"]}>
        <form method="get" action="#layer-toggle">
          <LayerToggle value="generous" />
        </form>
        <SensitivityStrip
          layers={[
            { layer: "generous", threshold: 0.6, population_count: 20, sensitivity: [{ t: 0.5, uncovered_count: 6 }, { t: 0.6, uncovered_count: 9 }, { t: 0.7, uncovered_count: 12 }, { t: 0.8, uncovered_count: 15 }] },
            { layer: "strict", threshold: 0.6, population_count: 20, sensitivity: [{ t: 0.5, uncovered_count: 8 }, { t: 0.6, uncovered_count: 11 }, { t: 0.7, uncovered_count: 14 }, { t: 0.8, uncovered_count: 17 }] },
          ]}
        />
      </Section>

      <Section spec={S["method-chip"]}>
        <MethodChip threshold={0.6} layer="both" windowMultiplier={2} recipeSha256={EXAMPLE_HASH} stopListSha256={ZERO_HASH} extractor="example-extractor 0.0.0" />
      </Section>

      <Section spec={S["cluster-card"]}>
        <ClusterCard
          cluster={CLUSTER}
          workOrders={[
            { wo_number: WO(1), matched_field: "root_cause", matched_lesson: "EX-OPL-001" },
            { wo_number: WO(2), matched_field: "problem_description", matched_lesson: "EX-OPL-002" },
            { wo_number: WO(3), matched_field: null, matched_lesson: null },
          ]}
          assetHref="#tag-card"
          requestHref="#cluster-card"
        />
      </Section>

      <Section spec={S["chain-hop"]}>
        <GlassPanel className="p-5">
          <Chain links={LINKS} windowDays={90} aria-label="Example chain" />
        </GlassPanel>
      </Section>

      <Section spec={S["family-list"]}>
        <div className="grid gap-4 lg:grid-cols-2">
          <FamilyList families={[FAMILY, FAMILY_REVIEWED]} />
          <PrecedentPanel family={FAMILY} currentWo={WO(2)} />
        </div>
      </Section>

      <Section spec={S.ladder}>
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassPanel className="p-5">
            <Ladder
              instrumentTag={INSTRUMENT}
              variable="pressure"
              pressure
              layers={{
                normal: LADDER_FACT("Example normal band", "10.0 to 11.0", null, "datasheet_param"),
                alarm: LADDER_FACT("Example alarm", "11.1", ">", "ce_row"),
                trip: LADDER_FACT("Example trip", "12.3", ">", "ce_row", "Example qualifier note, verbatim from the synthetic sheet."),
                relief: LADDER_FACT("Example relief", "13.5", null, "datasheet_param"),
              }}
              voteCellText="1oo2"
              classesRead={["datasheet", "interlock"]}
              drawerFor={drawerFor}
            />
          </GlassPanel>
          <GlassPanel className="p-5">
            <Ladder
              instrumentTag="EXT-0002"
              variable="vibration"
              pressure={false}
              layers={{ normal: null, alarm: LADDER_FACT("Example alarm", "4.5", ">", "ce_row"), trip: LADDER_FACT("Example trip", "7.1", ">", "ce_row"), relief: null }}
              voteCellText={null}
              classesRead={["datasheet", "interlock"]}
              drawerFor={drawerFor}
            />
          </GlassPanel>
        </div>
      </Section>

      <Section spec={S["proof-test-card"]}>
        <div className="grid gap-4 lg:grid-cols-2">
          <ProofTestCard testClass="sis_proof_test" records={PROOF_TESTS} />
          <ProofTestCard testClass="statutory_relief_test" records={[]} />
        </div>
      </Section>

      <Section spec={S["permissive-gate"]}>
        <div className="grid gap-6 lg:grid-cols-2">
          <GlassPanel className="p-5">
            <PermissiveGate seqId={SEQ} gate="AND" permissives={PERMISSIVES} />
          </GlassPanel>
          <GlassPanel className="p-5">
            <EffectsRow rowId={ROW_TRIP.row_id} effects={ROW_TRIP.effects} basis={ROW_TRIP.effects_basis} />
          </GlassPanel>
        </div>
      </Section>

      <Section spec={S["hotspot-layer"]}>
        <GlassPanel className="p-4" scrim>
          <HotspotLayer src={UNDERLAY} alt="Synthetic underlay sheet, gallery reference only" sidecar={SIDECAR} currentId="hs-example-1" hrefFor={(h) => (h.bound_tag ? "#tag-card" : undefined)} />
        </GlassPanel>
      </Section>

      <Section spec={S["tag-card"]}>
        <TagCard
          tag={TAG}
          rows={[ROW_TRIP, ROW_ALARM]}
          workOrders={[
            { wo_number: WO(1), chain_place: "hop 1 of 2", href: "#chain-hop" },
            { wo_number: WO(4), chain_place: null },
          ]}
          limits={LIMITS}
          equipmentHref="#cluster-card"
          citationFor={(row) => (row.row_id === ROW_TRIP.row_id ? CITE_PLAIN : undefined)}
          drawerFor={drawerFor}
        />
      </Section>

      <Section spec={S["trace-view"]}>
        <TraceView trace={TRACE} corpusVersionLabel="vX" />
        <p className="gallery-note">
          CopyId alone: <CopyId value="example-id" label="example id" />
        </p>
      </Section>

      <Section spec={S["page-viewer"]}>
        <GlassPanel className="max-w-3xl p-4">
          <PageViewer documentId="doc-example-1" page={2} pageCount={3} src={UNDERLAY} sourceSha256={ZERO_HASH} span={{ id: "span-example-1", text: "Example span text at citation length.", box: { x_frac: 0.2, y_frac: 0.4, w_frac: 0.5, h_frac: 0.06 } }} />
        </GlassPanel>
      </Section>

      <Section spec={S["list-primitives"]}>
        <div className="gallery-stack">
          <FilterBar
            action="#list-primitives"
            fields={[
              { kind: "select", name: "kind", label: "Kind", value: "b", options: [{ value: "a", label: "Example kind A" }, { value: "b", label: "Example kind B" }] },
              { kind: "text", name: "q", label: "Contains", value: "", placeholder: "example text" },
            ]}
            hidden={{ layer: "generous" }}
            resetHref="#list-primitives"
          />
          <Pagination page={2} pageCount={5} total={48} hrefFor={(p) => `#list-primitives-page-${p}`} />
          <GlassPanel className="p-5">
            <SearchResultList aria-label="Example results">
              <SearchResultRow href="#page-viewer" title="Example result one" kind="datasheet" meta={["EX-DOC-001", "rev X1", "p. 1"]} snippet="Example snippet at citation length." score={0.812} citation={CITE_PLAIN} drawer={drawerFor(CITE_PLAIN)} />
              <SearchResultRow href="#page-viewer" title="Example result two, without a citation" kind="opl" meta={["EX-DOC-002"]} snippet="Example second snippet." score={0.457} />
            </SearchResultList>
          </GlassPanel>
        </div>
      </Section>

      <Section spec={S["integrity-dot"]}>
        <div className="gallery-row">
          <IntegrityDot findings={["EX-RULE-1"]} />
          <IntegrityDot findings={["EX-RULE-1", "EX-RULE-2"]} href="#integrity-dot" />
          <span className="text-[12.5px] text-ink-700">A citation with no open finding renders nothing.</span>
        </div>
      </Section>

      <Section spec={S.primitives}>
        <div className="gallery-row">
          {(Object.keys(STATUS_WORDING) as StatusKind[]).map((kind) => (
            <StatusBadge key={kind} kind={kind} approverAlias={kind === "machine_drafted" ? "example_alias" : undefined} />
          ))}
          <VersionBadge label="vX" digestPrefix="0123abcd" active />
          <RequestLessonAction href="#cluster-card" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState title="Example empty state" explanation="A filter that matches nothing, or a table that has no rows yet." action={{ href: "#primitives", label: "Example action" }} />
          <DesignedState inline code="422" tone="defect" title="Example designed state" explanation="A gate refused the request; the reason is machine-readable." reason="example_gate_reason" next={{ href: "#primitives", label: "Example next step" }} />
        </div>
      </Section>
    </div>
  );
}
