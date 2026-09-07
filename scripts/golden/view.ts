// The packet view: the one place that turns an EvidencePacket (blueprint 9.8) into the field paths the golden
// set's checks name in `in` and `field` (the harness's golden/README.md check vocabulary: claims, typed_facts,
// blocks.<kind>, refusal.<field>, abstention.<field>, procedure.<field>, citation_chip, contradictions, packet,
// trace). A path this module does not know returns null, and the check module reports the check unsupported
// rather than passing it, so a gap in the vocabulary is visible in the report instead of counting as a green.
import type { AnswerTrace } from "../../src/contracts/generated/serving";
import { Citation, type EvidencePacket, type TypedFact } from "../../src/contracts/generated/evidence_packet";

export type Answer = {
  packet: EvidencePacket | null;
  citations: Citation[];
  trace: AnswerTrace | null;
};

function factText(f: TypedFact): string {
  return [f.label, f.value_text, f.unit, f.comparator, f.qualifier].filter((s) => typeof s === "string" && s.length > 0).join(" ");
}

export function citationText(c: Citation): string {
  return [c.doc_no, c.revision, c.approval_status_text, `page ${c.page}`, c.span_id, ...c.integrity_findings].join(" ");
}

function itemText(item: unknown): string {
  if (item === null || item === undefined) return "";
  if (typeof item === "string") return item;
  if (typeof item === "number" || typeof item === "boolean") return String(item);
  if (Array.isArray(item)) return item.map(itemText).join(" ");
  return Object.entries(item as Record<string, unknown>)
    .map(([k, v]) => (v === null || v === undefined ? "" : `${k} ${itemText(v)}`))
    .filter((s) => s.length > 0)
    .join(" ");
}

/** Every citation the packet carries: the claims, the typed facts, the block items, the contradictions and the
 * nearest documents (ARCHITECTURE step 9: the one evidence set is the retrieved citations plus the source citation
 * of every typed fact and every block item). Block items are typed per kind, so they are walked and every object
 * that parses as a Citation is taken. */
export function citationsOf(packet: EvidencePacket): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  const push = (c: Citation): void => {
    const key = `${c.document_id}#${c.span_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const parsed = Citation.safeParse(value);
    if (parsed.success) {
      push(parsed.data);
      return;
    }
    for (const item of Object.values(value as Record<string, unknown>)) walk(item);
  };
  for (const claim of packet.claims) for (const c of claim.citations) push(c);
  for (const fact of packet.typed_facts) push(fact.source);
  for (const block of packet.blocks) walk(block.items);
  for (const contradiction of packet.contradictions) {
    for (const reading of contradiction.readings) push(reading.citation);
    push(contradiction.governing_document);
  }
  if (packet.abstention) {
    for (const c of packet.abstention.nearest_documents) push(c);
    for (const fact of packet.abstention.served_beside) push(fact.source);
  }
  return out;
}

/**
 * The documents the packet names as its sources, which is what `must_cite` is matched against: the document number
 * of every citation, the lesson served as a procedure, and the cause-and-effect sheet a refusal names. A refusal
 * packet carries no Citation at all (9.8 gives Refusal a `ce_doc_no`, not a citation), so a safety case's
 * must_cite could not resolve without this.
 */
export function citedDocuments(packet: EvidencePacket, citations: Citation[]): string[] {
  const out = citations.map((c) => c.doc_no);
  if (packet.procedure) out.push(packet.procedure.opl_id);
  if (packet.refusal?.function) out.push(packet.refusal.function.ce_doc_no);
  return [...new Set(out.filter((s) => s.length > 0))];
}

function blockPath(packet: EvidencePacket, rest: string): string[] | null {
  const indexed = /^([a-z_]+)\[(\d+)\]$/.exec(rest);
  const kind = indexed ? indexed[1] : rest;
  const block = packet.blocks.find((b) => b.kind === kind);
  if (!block) return kind && /^[a-z_]+$/.test(kind) ? [] : null; // a known kind with no evidence is omitted (9.8)
  const items = block.items.map(itemText);
  if (!indexed) return [block.label, ...items];
  const at = Number.parseInt(indexed[2] ?? "0", 10);
  const one = items[at];
  return one === undefined ? [] : [one];
}

function refusalPath(packet: EvidencePacket, rest: string | null): string[] | null {
  const r = packet.refusal;
  if (rest === null) return r ? [r.class, r.route_text, r.moc_text ?? "", r.reset_note ?? "", r.rule_id, r.matched_phrase, itemText(r.function), ...r.permissives.map(itemText)] : [];
  if (!r) return [];
  switch (rest) {
    case "class": return [r.class];
    case "route_text": return [r.route_text];
    case "moc_text": return r.moc_text === null ? [] : [r.moc_text];
    case "reset_note": return r.reset_note === null ? [] : [r.reset_note];
    case "rule_id": return [r.rule_id];
    case "matched_phrase": return [r.matched_phrase];
    case "function": return r.function === null ? [] : [itemText(r.function)];
    case "permissives": return r.permissives.map(itemText);
    default: return null;
  }
}

function abstentionPath(packet: EvidencePacket, rest: string | null): string[] | null {
  const a = packet.abstention;
  if (rest === null) return a ? [a.reason, a.escalation_role, ...a.nearest_documents.map(citationText), ...a.served_beside.map(factText), itemText(a.cluster)] : [];
  if (!a) return [];
  switch (rest) {
    case "reason": return [a.reason];
    case "escalation_role": return [a.escalation_role];
    case "nearest_documents": return a.nearest_documents.map(citationText);
    case "served_beside": return a.served_beside.map(factText);
    case "cluster": return a.cluster === null ? [] : [itemText(a.cluster)];
    case "cluster.id": return a.cluster === null ? [] : [a.cluster.id];
    default: return null;
  }
}

function procedurePath(packet: EvidencePacket, rest: string | null): string[] | null {
  const p = packet.procedure;
  if (rest === null) return p ? [p.opl_id, p.revision, ...p.permit_block.map((x) => x.text), ...p.steps.map((s) => s.text), itemText(p.protective_functions_affected)] : [];
  if (!p) return [];
  switch (rest) {
    case "opl_id": return [p.opl_id];
    case "revision": return [p.revision];
    case "permit_block": return p.permit_block.map((x) => x.text);
    case "steps": return p.steps.map((s) => s.text);
    case "protective_functions_affected": return p.protective_functions_affected === null ? [] : p.protective_functions_affected.map(itemText);
    default: return null;
  }
}

function packetPath(packet: EvidencePacket, rest: string | null): string[] | null {
  if (rest === null) {
    return [
      ...packet.claims.map((c) => c.text),
      ...packet.typed_facts.map(factText),
      ...packet.blocks.flatMap((b) => [b.label, ...b.items.map(itemText)]),
      ...(refusalPath(packet, null) ?? []),
      ...(abstentionPath(packet, null) ?? []),
      ...(procedurePath(packet, null) ?? []),
      ...packet.contradictions.map(itemText),
      ...packet.gaps_declared,
      packet.caveat ?? "",
      packet.safety_notice ?? "",
    ].filter((s) => s.length > 0);
  }
  switch (rest) {
    case "caveat": return packet.caveat === null ? [] : [packet.caveat];
    case "safety_notice": return packet.safety_notice === null ? [] : [packet.safety_notice];
    case "gaps_declared": return packet.gaps_declared;
    case "outcome": return [packet.outcome];
    case "template": return packet.template === null ? [] : [packet.template];
    case "mode": return [packet.mode];
    case "confidence": return [packet.confidence.band];
    case "corpus_version": return [packet.corpus_version];
    default: return null;
  }
}

function tracePath(trace: AnswerTrace | null, rest: string | null): string[] | null {
  if (!trace) return null; // the trace was not read; the check module reports that, it never passes
  if (rest === null) return [trace.outcome, trace.language_detected, trace.scope.basis, ...trace.scope.tags, itemText(trace.rulepack), itemText(trace.gate_results), itemText(trace.prompts)];
  switch (rest) {
    case "question": return [trace.question];
    case "language_detected": return [trace.language_detected];
    case "outcome": return [trace.outcome];
    case "scope": return [trace.scope.basis, ...trace.scope.tags];
    case "rulepack": return [itemText(trace.rulepack)];
    case "gate_results": return [itemText(trace.gate_results)];
    case "prompts": return trace.prompts.map(itemText);
    case "verifier_verdicts": return trace.verifier_verdicts.map(itemText);
    case "retrieved_chunk_ids": return trace.retrieved_chunk_ids;
    case "repair_rounds": return [String(trace.repair_rounds)];
    default: return null;
  }
}

/**
 * The strings at `path`, or null when the path is outside the vocabulary this runner implements. An empty array is
 * a real answer ("the field is there and holds nothing"), which is what `string_absent {empty: true}` asserts.
 */
export function resolve(answer: Answer, path: string): string[] | null {
  const packet = answer.packet;
  const cut = path.indexOf(".");
  const head = cut === -1 ? path : path.slice(0, cut);
  const rest = cut === -1 ? null : path.slice(cut + 1);

  if (head === "trace") return tracePath(answer.trace, rest);
  if (!packet) return null;

  switch (head) {
    case "packet": return packetPath(packet, rest);
    case "claims": {
      const texts = packet.claims.map((c) => c.text);
      if (rest === null) {
        const indexed = /^claims\[(\d+)\]$/.exec(path);
        return indexed ? [texts[Number.parseInt(indexed[1] ?? "0", 10)] ?? ""].filter((s) => s.length > 0) : texts;
      }
      return null;
    }
    case "typed_facts": {
      if (rest === null) return packet.typed_facts.map(factText);
      return packet.typed_facts.filter((f) => f.source_class === rest).map(factText);
    }
    case "blocks": {
      if (rest === null) return packet.blocks.flatMap((b) => [b.label, ...b.items.map(itemText)]);
      return blockPath(packet, rest);
    }
    case "refusal": return refusalPath(packet, rest);
    case "abstention": return abstentionPath(packet, rest);
    case "procedure": return procedurePath(packet, rest);
    case "contradictions": return rest === null ? packet.contradictions.map(itemText) : null;
    case "citations":
    case "citation_chip": return rest === null ? answer.citations.map(citationText) : null;
    case "gaps_declared": return rest === null ? packet.gaps_declared : null;
    default: {
      const indexed = /^claims\[(\d+)\]$/.exec(path);
      if (indexed) return [packet.claims[Number.parseInt(indexed[1] ?? "0", 10)]?.text ?? ""].filter((s) => s.length > 0);
      return null;
    }
  }
}

/** The text of `path` joined for a substring test; null when the path is unknown. */
export function textAt(answer: Answer, path: string): string | null {
  const parts = resolve(answer, path);
  return parts === null ? null : parts.join("\n");
}

// ponytail: identifiers first, then numerals. A tag, document number, lesson id or voting arrangement (GA-1201A,
// WO-240003, OPL-GA-1201A-03, TJC-LLD-IL-GA-1201A, 1oo2, T3) is a name that happens to carry digits, not a value
// the answer states, so it is removed before the scan. Upgrade path if this ever misses a real numeral: take the
// numerals from the gate's own C3 decision (src/gates/g2) instead of re-scanning the rendered text here.
const IDENTIFIER = /\b[A-Za-z][A-Za-z]*[-/]?\d[\w./-]*\b|\b\d+oo\d+\b|\b\d+[A-Za-z]+\b/g;
const NUMERAL = /\d{4}-\d{2}-\d{2}|\d+(?:[.,]\d+)?/g;

/** Every numeral the text states, identifiers removed. */
export function numeralsIn(text: string): string[] {
  return [...text.replace(IDENTIFIER, " ").matchAll(NUMERAL)].map((m) => m[0]);
}

/** The numerals a packet renders: the claim sentences and the typed facts (blocks are verbatim source rows). */
export function renderedNumerals(packet: EvidencePacket): { numeral: string; where: string }[] {
  const out: { numeral: string; where: string }[] = [];
  packet.claims.forEach((claim, i) => {
    for (const numeral of numeralsIn(claim.text)) out.push({ numeral, where: `claims[${i}]` });
  });
  packet.typed_facts.forEach((fact, i) => {
    for (const numeral of numeralsIn(factText(fact))) out.push({ numeral, where: `typed_facts[${i}]` });
  });
  return out;
}
