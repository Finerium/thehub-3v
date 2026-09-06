// The 9.1 admission checks over a read bundle (ARCHITECTURE 2, the port of harness/g1.py check_counts,
// check_closure, check_hashes and check_manifest_fields): fixture counts read from the fixture's own keys, never
// typed here; referential closure of every id; closed-set membership of every binding; every quoted hash
// recomputed from the bundle's own text. Details carry ids and counts only, never a span's text.
import { EMBEDDING_DIM } from "@/db/embedding";
import { quoteHash } from "@/lib/hash";
import type { Bundle, Violation, ViolationKind } from "./bundle";

// Typed identifiers a P&ID hotspot may bind to besides tags (harness/entities.py IDENTITY_FIELDS).
const IDENTITY_FIELDS: ReadonlyArray<string> = ["EQUIPMENT ID", "FUNCTIONAL LOC."];
const GOLDEN_CASE_LINE = /^- id: /m;

export type Report = { violations: Violation[]; checks: string[] };

class Checker {
  constructor(readonly report: Report) {}

  ok(check: string, detail: string): void {
    this.report.checks.push(`${check}: ${detail}`);
  }

  expect(kind: ViolationKind, file: string, check: string, condition: boolean, detail: string): void {
    if (condition) this.ok(check, detail);
    else this.report.violations.push({ kind, file, detail: `${check}: ${detail}` });
  }

  members(kind: ViolationKind, file: string, check: string, values: ReadonlyArray<string>, universe: ReadonlySet<string>, what: string): void {
    const missing = [...new Set(values.filter((v) => !universe.has(v)))].sort();
    const distinct = new Set(values).size;
    this.expect(
      kind,
      file,
      check,
      missing.length === 0,
      `${what}: ${missing.length} of ${distinct} unresolved${missing.length ? ` (first: ${missing.slice(0, 3).join(", ")})` : ""}`,
    );
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(src).sort().map((k) => [k, sortKeys(src[k])]));
  }
  return value;
}

function counts(b: Bundle, c: Checker): void {
  const fx = b.fixtures;
  if (!fx) {
    c.report.violations.push({ kind: "count", file: "fixtures.json", detail: "counts: fixtures.json unavailable, no count can be pinned" });
    return;
  }
  const byClass: Record<string, number> = {};
  for (const d of b.documents) byClass[d.class] = (byClass[d.class] ?? 0) + 1;
  const inventoryFiles = b.inventory?.files.length ?? -1;
  c.expect(
    "count",
    "documents.json",
    "counts.files",
    b.documents.length === fx.inventory.files_total && inventoryFiles === fx.inventory.files_total,
    `${b.documents.length} documents, ${inventoryFiles} inventory entries, fixture ${fx.inventory.files_total}`,
  );
  c.expect("count", "documents.json", "counts.by_class", same(byClass, fx.inventory.by_class), `by_class ${JSON.stringify(sortKeys(byClass))}`);
  const lessons = fx.inventory.by_class.opl ?? 0;
  c.expect(
    "count",
    "opls.json",
    "counts.lessons",
    (byClass.opl ?? 0) === lessons && (b.opls === null || b.opls.lessons.length === lessons),
    `${byClass.opl ?? 0} lesson documents${b.opls ? `, ${b.opls.lessons.length} parsed lessons` : ""}, fixture ${lessons}`,
  );
  c.expect("count", "work_orders.json", "counts.work_orders", b.workOrders.length === fx.workbook.rows, `${b.workOrders.length} work orders, fixture ${fx.workbook.rows}`);
  const reg = b.integrity;
  const ruleSum = Object.values(reg?.rules ?? {}).reduce((s, n) => s + n, 0);
  const defects = reg?.findings.filter((f) => !f.observation_only).length ?? -1;
  c.expect(
    "count",
    "integrity_findings.json",
    "counts.register",
    reg !== null && reg.total === fx.integrity.total && ruleSum === fx.integrity.total && defects === fx.integrity.total,
    `register total ${reg?.total ?? "absent"}, rules sum ${ruleSum}, ${defects} defect findings, fixture ${fx.integrity.total}`,
  );
  c.expect("count", "chains.json", "counts.chains", b.chains.length === fx.chains.links, `${b.chains.length} causal links, fixture ${fx.chains.links}`);
  const layers = new Map<string, number>();
  for (const a of b.coverage?.assessments ?? []) layers.set(a.layer, (layers.get(a.layer) ?? 0) + 1);
  c.expect(
    "count",
    "coverage_scores.json",
    "counts.assessments",
    layers.size > 0 && [...layers.values()].every((n) => n === b.workOrders.length),
    `assessments per layer ${JSON.stringify(Object.fromEntries([...layers].sort()))}, one per work order`,
  );
  const equipment = b.interlocks.equipment.map((e) => e.tag);
  const perAsset = new Map<string, number>();
  for (const s of b.datasheetSpot) perAsset.set(s.equipment_tag, (perAsset.get(s.equipment_tag) ?? 0) + 1);
  const pinsPerAsset = new Set(perAsset.values());
  c.expect(
    "count",
    "datasheet_spot.json",
    "counts.datasheet_spot",
    pinsPerAsset.size === 1 && equipment.length > 0 && equipment.every((t) => perAsset.has(t)),
    `${b.datasheetSpot.length} pins over ${perAsset.size} assets (${[...pinsPerAsset].join("|") || 0} per asset)`,
  );
  const docs = new Map(b.documents.map((d) => [d.id, d] as const));
  const pairs = b.revisionSpot.map((r) => `${docs.get(r.document_id)?.class ?? "?"}:${docs.get(r.document_id)?.subject_tag ?? "?"}`);
  const classes = new Set(pairs.map((p) => p.split(":")[0]));
  c.expect(
    "count",
    "revision_spot.json",
    "counts.revision_spot",
    new Set(pairs).size === pairs.length && pairs.length === classes.size * equipment.length,
    `${pairs.length} revision pins over ${classes.size} classes and ${equipment.length} assets`,
  );
  const goldenCount = b.golden ? b.golden.length : b.goldenText ? (b.goldenText.match(new RegExp(GOLDEN_CASE_LINE.source, "gm")) ?? []).length : -1;
  c.expect("count", "golden/cases.yaml", "counts.golden", goldenCount === fx.golden.size, `${goldenCount} golden cases, fixture ${fx.golden.size}`);
  if (b.chunks) {
    const dims = new Set(b.chunks.map((ch) => ch.embedding.length));
    c.expect(
      "count",
      "chunks.jsonl",
      "counts.embedding_dim",
      dims.size === 1 && dims.has(EMBEDDING_DIM),
      `${b.chunks.length} chunks, embedding dimensions ${[...dims].join("|") || "none"}, column ${EMBEDDING_DIM}`,
    );
  }
}

function closure(b: Bundle, c: Checker): void {
  const docs = new Set(b.documents.map((d) => d.id));
  const pidDocs = new Set(b.documents.filter((d) => d.class === "pid").map((d) => d.id));
  const docNos = new Set(b.documents.flatMap((d) => (d.doc_no ? [d.doc_no] : [])));
  const revIds = new Set(b.revisions.map((r) => r.id));
  const currentDocs = new Set(b.revisions.filter((r) => r.is_current).map((r) => r.document_id));
  const currentRevs = new Set(b.revisions.filter((r) => r.is_current).map((r) => r.id));
  const spans = new Set(b.claims.spans.map((s) => s.id));
  const il = b.interlocks;
  const eq = new Set(il.equipment.map((e) => e.tag));
  const seqs = new Set(il.interlocks.flatMap((i) => (i.seq_id ? [i.seq_id] : [])));
  const tags = new Set(il.instrument_tags.map((t) => t.tag));
  const wos = new Set(b.workOrders.map((w) => w.wo_number));
  const opls = new Set(b.documents.filter((d) => d.class === "opl" && d.doc_no).map((d) => d.doc_no as string));
  const bomIds = new Set(b.bom.items.map((i) => i.id));
  const areas = new Set(b.areas.map((a) => a.code));
  const m = (file: string, check: string, values: string[], universe: ReadonlySet<string>, what: string) => c.members("closure", file, check, values, universe, what);

  // documents and revisions
  c.expect("closure", "revisions.json", "closure.current_revision", same([...currentDocs].sort(), [...docs].sort()), `${currentDocs.size} of ${docs.size} documents carry one current revision`);
  m("revisions.json", "closure.revision.document_id", b.revisions.map((r) => r.document_id), docs, "revisions document_id");
  m("claims.json", "closure.span.revision", b.claims.spans.map((s) => s.document_revision_id), revIds, "spans document_revision_id");
  m("claims.json", "closure.claim.span", b.claims.claims.map((cl) => cl.span_id), spans, "claims span_id");
  m("claims.json", "closure.edge.document", b.claims.edges.flatMap((e) => [e.from_document_id, e.to_document_id]), docs, "edges document ids");
  m("claims.json", "closure.edge.span", b.claims.edges.map((e) => e.source_span_id), spans, "edges source_span_id");
  m("inventory.json", "closure.inventory.document", (b.inventory?.files ?? []).map((f) => f.document_id), docs, "inventory files document_id");
  m("revision_spot.json", "closure.revision_spot", b.revisionSpot.map((r) => r.id), currentRevs, "revision_spot ids (current revisions)");
  // asset and safety graph
  m("interlocks.json", "closure.equipment.docs", il.equipment.flatMap((e) => [e.datasheet_doc_no, e.ga_drawing_doc_no, e.plot_plan_doc_no, e.ce_doc_no]), docNos, "equipment document numbers");
  m("interlocks.json", "closure.equipment.pid", il.equipment.map((e) => e.pid_document_id), pidDocs, "equipment pid_document_id");
  m("interlocks.json", "closure.equipment.area", il.equipment.map((e) => e.area_code), areas, "equipment area_code");
  m("interlocks.json", "closure.interlock.equipment", [...il.interlocks.map((i) => i.equipment_tag), ...il.rows.map((r) => r.equipment_tag)], eq, "interlock equipment_tag");
  m("interlocks.json", "closure.interlock.notes", il.interlocks.flatMap((i) => i.notes.map((n) => n.span_id)), spans, "interlock notes span_id");
  m("interlocks.json", "closure.row.span", il.rows.map((r) => r.span_id), spans, "interlock rows span_id");
  m("interlocks.json", "closure.row.seq", il.rows.flatMap((r) => (r.seq_id ? [r.seq_id] : [])), seqs, "interlock rows seq_id");
  m("interlocks.json", "closure.row.instrument", il.rows.map((r) => r.instrument_tag), tags, "interlock rows instrument_tag");
  m("interlocks.json", "closure.permissive.seq", il.permissives.map((p) => p.seq_id), new Set([...seqs, ...eq]), "permissives seq_id (sheet key)");
  m("interlocks.json", "closure.permissive.signal", il.permissives.flatMap((p) => (p.signal_tag ? [p.signal_tag] : [])), tags, "permissives signal_tag");
  m("interlocks.json", "closure.permissive.span", il.permissives.map((p) => p.span_id), spans, "permissives span_id");
  m("interlocks.json", "closure.instrument.equipment", il.instrument_tags.map((t) => t.equipment_tag), eq, "instrument_tags equipment_tag");
  m("interlocks.json", "closure.instrument.sources", il.instrument_tags.flatMap((t) => t.sources), docs, "instrument_tags sources");
  m("datasheet_params.json", "closure.param.span", [...b.datasheetParams, ...b.datasheetSpot].map((p) => p.span_id), spans, "datasheet params and spot span_id");
  m("datasheet_params.json", "closure.param.equipment", [...b.datasheetParams, ...b.datasheetSpot].map((p) => p.equipment_tag), eq, "datasheet params equipment_tag");
  // sidecars and hand-verified readings
  m("pid_sidecars", "closure.sidecar.document", b.sidecars.map((s) => s.document_id), pidDocs, "sidecar document_id");
  m("hand_verified.json", "closure.hand_verified.document", b.handVerifiedSets.map((s) => s.document_id), docs, "hand_verified document_id");
  // operations
  m("work_orders.json", "closure.work_order.equipment", b.workOrders.map((w) => w.equipment_tag), eq, "work orders equipment_tag");
  m("failure_events.json", "closure.failure_event.wo", b.failureEvents.map((e) => e.wo_number), wos, "failure events wo_number");
  m("failure_events.json", "closure.failure_event.equipment", b.failureEvents.map((e) => e.equipment_tag), eq, "failure events equipment_tag");
  m("families.json", "closure.family.wo", b.families.flatMap((f) => f.members.map((x) => x.wo_number)), wos, "family members wo_number");
  m("chains.json", "closure.chain.wo", b.chains.flatMap((l) => [l.from_wo, l.to_wo]), wos, "chains wo numbers");
  m("chains.json", "closure.chain.span", b.chains.map((l) => l.span_id), spans, "chains span_id");
  m("chains.json", "closure.chain.equipment", b.chains.map((l) => l.equipment_tag), eq, "chains equipment_tag");
  m("proof_tests.json", "closure.proof_test.wo", b.proofTests.map((t) => t.wo_number), wos, "proof tests wo_number");
  m("proof_tests.json", "closure.proof_test.seq", b.proofTests.flatMap((t) => (t.seq_id ? [t.seq_id] : [])), seqs, "proof tests seq_id");
  m("proof_tests.json", "closure.proof_test.equipment", b.proofTests.map((t) => t.equipment_tag), eq, "proof tests equipment_tag");
  m("bom.json", "closure.bom.span", b.bom.items.map((i) => i.span_id), spans, "bom items span_id");
  m("bom.json", "closure.bom.drawing", b.bom.items.map((i) => i.ga_drawing_doc_no), docNos, "bom items ga_drawing_doc_no");
  m("bom.json", "closure.bom.equipment", b.bom.items.map((i) => i.equipment_tag), eq, "bom items equipment_tag");
  m("bom.json", "closure.bom_match.wo", b.bom.matches.map((x) => x.wo_number), wos, "bom matches wo_number");
  m("bom.json", "closure.bom_match.item", b.bom.matches.flatMap((x) => [x.bom_item_id, x.alternative_bom_item_id].filter((v): v is string => v !== null)), bomIds, "bom matches bom_item_id");
  // lessons, coverage, debt, register
  if (b.opls) {
    m("opls.json", "closure.opl.revision", b.opls.lessons.map((o) => o.document_revision_id), revIds, "lessons document_revision_id");
    m("opls.json", "closure.opl.equipment", b.opls.lessons.map((o) => o.equipment_tag), eq, "lessons equipment_tag");
    m("opls.json", "closure.opl.id", [...b.opls.lessons.map((o) => o.opl_id), ...b.opls.steps.map((s) => s.opl_id), ...b.opls.troubleshooting_rows.map((r) => r.opl_id)], opls, "lessons, steps and rows opl_id");
    m("opls.json", "closure.opl.span", [...b.opls.steps.map((s) => s.span_id), ...b.opls.lessons.flatMap((o) => o.permit_lines.map((p) => p.span_id))], spans, "steps and permit lines span_id");
    m("opls.json", "closure.opl.quoted_wo", b.opls.troubleshooting_rows.flatMap((r) => (r.quoted_wo_number ? [r.quoted_wo_number] : [])), wos, "troubleshooting rows quoted_wo_number");
  }
  const cov = b.coverage;
  m("coverage_scores.json", "closure.coverage.wo", (cov?.assessments ?? []).map((a) => a.wo_number), wos, "coverage assessments wo_number");
  m("coverage_scores.json", "closure.coverage.lesson", (cov?.assessments ?? []).flatMap((a) => (a.matched_lesson ? [a.matched_lesson] : [])), opls, "coverage assessments matched_lesson");
  m("coverage_labels.json", "closure.labels.wo", [...(b.labels?.records ?? []).map((r) => r.wo_number), ...(b.labels?.uncovered_ids ?? [])], wos, "coverage labels wo numbers");
  m("coverage_labels.json", "closure.labels.lesson", (b.labels?.records ?? []).flatMap((r) => r.covered_by ?? []), opls, "coverage labels covered_by");
  m("debt.json", "closure.debt.equipment", b.debt.map((d) => d.equipment_tag), eq, "debt equipment_tag");
  m("debt.json", "closure.debt.wo", b.debt.flatMap((d) => d.uncovered_wo_numbers), wos, "debt uncovered_wo_numbers");
  const findings = b.integrity?.findings ?? [];
  m("integrity_findings.json", "closure.register.document", findings.flatMap((f) => (f.document_id ? [f.document_id] : [])), docs, "register findings document_id");
  m("integrity_findings.json", "closure.register.span", findings.flatMap((f) => (f.span_id ? [f.span_id] : [])), spans, "register findings span_id");
  m("integrity_findings.json", "closure.register.seq", findings.flatMap((f) => (f.safety_function ? [f.safety_function] : [])), seqs, "register findings safety_function");
  if (b.chunks) m("chunks.jsonl", "closure.chunk.revision", b.chunks.map((ch) => ch.document_revision_id), revIds, "chunks document_revision_id");
  if (b.pagesIndex) m("pages/index.json", "closure.pages.document", b.pagesIndex.documents.map((d) => d.document_id), docs, "pages index document_id");
}

function closedSets(b: Bundle, c: Checker): void {
  const il = b.interlocks;
  const eq = new Set(il.equipment.map((e) => e.tag));
  const seqs = new Set(il.interlocks.flatMap((i) => (i.seq_id ? [i.seq_id] : [])));
  const tags = new Set(il.instrument_tags.map((t) => t.tag));
  const wos = new Set(b.workOrders.map((w) => w.wo_number));
  const opls = new Set(b.documents.filter((d) => d.class === "opl" && d.doc_no).map((d) => d.doc_no as string));
  const docs = new Set(b.documents.map((d) => d.id));
  const bomIds = new Set(b.bom.items.map((i) => i.id));
  const identities = new Set(b.datasheetParams.filter((p) => IDENTITY_FIELDS.includes(p.field)).map((p) => p.value_text));
  c.members("closed_set", "claims.json", "closed_set.claim.binding", b.claims.claims.map((cl) => cl.entity_binding), new Set([...eq, ...tags, ...seqs, ...wos, ...opls, ...docs, ...bomIds, "NONE"]), "claims entity_binding");
  c.members("closed_set", "pid_sidecars", "closed_set.sidecar.bound_tag", b.sidecars.flatMap((s) => s.hotspots.flatMap((h) => (h.bound_tag ? [h.bound_tag] : []))), new Set([...tags, ...eq, ...seqs, ...identities]), "hotspot bound_tag");
  const unreasoned = b.sidecars.flatMap((s) => s.hotspots.filter((h) => h.bound_tag === null && !h.unbound_reason).map((h) => h.id));
  c.expect("closed_set", "pid_sidecars", "closed_set.sidecar.unbound_reason", unreasoned.length === 0, `${unreasoned.length} null bindings without a reason`);
  const provenance = b.sidecars.map((s) => s.provenance);
  c.expect(
    "closed_set",
    "pid_sidecars",
    "closed_set.sidecar.provenance",
    provenance.every((p) => p.basis === "manual" || (p.basis === "agent_transcription" && p.review_status === "pending")),
    `${provenance.length} sidecars, basis ${JSON.stringify([...new Set(provenance.map((p) => p.basis))].sort())} (D-12)`,
  );
  const fx = b.fixtures;
  c.expect("closed_set", "manifest.json", "closed_set.extractor", fx !== null && b.manifest.extractor === fx.inventory.extractor && (b.inventory === null || b.inventory.extractor === fx.inventory.extractor), `extractor ${b.manifest.extractor}`);
  c.expect("closed_set", "manifest.json", "closed_set.rulepack", b.rulepack !== null && String(b.rulepack.version) === b.manifest.rulepack_version, `rulepack_version ${b.manifest.rulepack_version}`);
}

function hashes(b: Bundle, c: Checker): void {
  const fx = b.fixtures;
  if (fx) {
    c.expect("hash", "manifest.json", "hash.recipe", b.manifest.recipe_sha256 === fx.method.recipe_sha256 && b.manifest.stop_list_sha256 === fx.method.stop_list_sha256, "recipe_sha256 and stop_list_sha256 equal the fixture's");
    c.expect("hash", "manifest.json", "hash.corpus", b.manifest.corpus_sha256 === fx.inventory.corpus_sha256 && (b.inventory === null || b.inventory.corpus_sha256 === fx.inventory.corpus_sha256), `corpus_sha256 ${b.manifest.corpus_sha256.slice(0, 12)} equals the fixture's`);
  }
  const docSha = new Map(b.documents.map((d) => [d.id, d.sha256] as const));
  const inventoryMismatch = (b.inventory?.files ?? []).filter((f) => docSha.get(f.document_id) !== f.sha256).map((f) => f.document_id);
  c.expect("hash", "inventory.json", "hash.documents", inventoryMismatch.length === 0, `${b.inventory?.files.length ?? 0} inventory digests equal documents.json${inventoryMismatch.length ? ` (first: ${inventoryMismatch.slice(0, 3).join(", ")})` : ""}`);
  if (b.pagesIndex) {
    const pageMismatch = b.pagesIndex.documents.filter((d) => docSha.get(d.document_id) !== d.source_sha256).map((d) => d.document_id);
    c.expect("hash", "pages/index.json", "hash.pages", pageMismatch.length === 0, `${b.pagesIndex.documents.length} page sources equal documents.json${pageMismatch.length ? ` (first: ${pageMismatch.slice(0, 3).join(", ")})` : ""}`);
  }
  const badSpans = b.claims.spans.filter((s) => quoteHash(s.anchor_text) !== s.quote_hash).map((s) => s.id);
  c.expect("quote_hash", "claims.json", "quote_hash.spans", badSpans.length === 0, `${b.claims.spans.length} span hashes recomputed, ${badSpans.length} mismatched${badSpans.length ? ` (first: ${badSpans.slice(0, 3).join(", ")})` : ""}`);
  if (b.chunks) {
    const badChunks = b.chunks.filter((ch) => quoteHash(ch.text) !== ch.quote_hash).map((ch) => ch.id);
    c.expect("quote_hash", "chunks.jsonl", "quote_hash.chunks", badChunks.length === 0, `${b.chunks.length} chunk hashes recomputed, ${badChunks.length} mismatched${badChunks.length ? ` (first: ${badChunks.slice(0, 3).join(", ")})` : ""}`);
  }
  if (b.opls) {
    const badSteps = b.opls.steps.filter((s) => quoteHash(s.action_text) !== s.source_hash).map((s) => `${s.opl_id}#${s.n}`);
    const badSections = b.opls.lessons.flatMap((o) => o.sections.filter((x) => quoteHash(x.body_text) !== x.body_hash).map((x) => `${o.opl_id}#${x.n}`));
    const sections = b.opls.lessons.reduce((n, o) => n + o.sections.length, 0);
    c.expect(
      "quote_hash",
      "opls.json",
      "quote_hash.lessons",
      badSteps.length === 0 && badSections.length === 0,
      `${b.opls.steps.length} step hashes and ${sections} section hashes recomputed, ${badSteps.length + badSections.length} mismatched${badSteps.length + badSections.length ? ` (first: ${[...badSteps, ...badSections].slice(0, 3).join(", ")})` : ""}`,
    );
  }
}

/** Runs every check of the 9.1 list over a read bundle, appending to the report. */
export function runChecks(bundle: Bundle, report: Report): void {
  const c = new Checker(report);
  counts(bundle, c);
  closure(bundle, c);
  closedSets(bundle, c);
  hashes(bundle, c);
}
