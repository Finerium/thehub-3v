"use client";

// Surface 2, Ask, the client half (blueprint 6.2 surface 2, 6.3, 6.4, 7.2 dense-operational; 9.8 packet and stream;
// AC-ANS-03, AC-ANS-06, AC-ANS-15, AC-ANS-16, AC-ANS-20, AC-UI-02, AC-NFR-04). The question input (English or
// Bahasa Indonesia), the four moment-template chips, the mode toggle, then the two-stage stream rendered as it
// lands: line 1 as the evidence list, line 2 as the packet in its own order (claims, typed facts, blocks, the
// procedure with its permit lines above the steps, contradictions, abstention, refusal, caveat), and the gate
// results and confidence inputs read from the immutable trace once the packet has closed. Search mode is the other
// entry point (D-22): GET /api/search, retrieval only, no provider call and nothing composed, rendered as the
// retrieved units with their rerank keys under the fixed search-mode gap. Every figure on the sheet is the packet's,
// the trace's or the route's own; every fixed wording is the constant of src/lib/fixed-strings.ts.
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { z } from "zod";
import type {
  BomPartItem,
  CausalLinkItem,
  DocumentedResponseItem,
  EffectItem,
  FunctionOutOfServiceItem,
  InterlockRowItem,
  LadderItem,
  LessonItem,
  PermissiveItem,
  PermitItem,
  PrecedentItem,
  ProofTestItem,
  ResetNoteItem,
  ReturnToServiceItem,
  StepItem,
  WorkOrderItem,
} from "@/answer/types";
import { AbstentionCard } from "@/components/AbstentionCard";
import { documentHref, parseAnchor } from "@/components/anchor";
import { CaveatLine } from "@/components/CaveatLine";
import { CitationChip } from "@/components/CitationChip";
import { ConfidenceBand } from "@/components/ConfidenceBand";
import { ContradictionChip } from "@/components/ContradictionChip";
import { CopyId } from "@/components/CopyId";
import { cx } from "@/components/cx";
import { DesignedState } from "@/components/DesignedState";
import { EffectsRow } from "@/components/EffectsRow";
import { EmptyState } from "@/components/EmptyState";
import { EvidenceList } from "@/components/EvidenceLine";
import { GlassPanel } from "@/components/GlassPanel";
import { Ladder } from "@/components/Ladder";
import { NeumorphicChip } from "@/components/NeumorphicChip";
import { PageViewer } from "@/components/PageViewer";
import { PartialAnswerBanner } from "@/components/PartialAnswerBanner";
import { PermissiveGate } from "@/components/PermissiveGate";
import { TEST_CLASS_LABEL } from "@/components/ProofTestCard";
import { RefusalCard } from "@/components/RefusalCard";
import { SearchResultList, SearchResultRow } from "@/components/SearchResultRow";
import { StatusBadge } from "@/components/StatusBadge";
import { TypedFactGrid } from "@/components/TypedFactCard";
import { VerdictStrip } from "@/components/VerdictStrip";
import { VersionBadge } from "@/components/VersionBadge";
import { Citation, type Block, type EvidencePacket, type Procedure, type TypedFact } from "@/contracts/generated/evidence_packet";
import { AnswerTrace } from "@/contracts/generated/serving";
import { AskError, askStream, searchQuery, type AskFailure, type EvidenceLine, type Mode, type SearchResult, type Template } from "@/lib/ask-stream";
import { CHAIN_BASIS_LINE, NO_INTERVAL_STATEMENT, PROVIDER_UNREACHABLE_REASON, SEARCH_MODE_GAP } from "@/lib/fixed-strings";
import "@/components/system.css";

/* Props ------------------------------------------------------------------------------------------------------- */

/** A live role whose daily budget is spent (9.13 GatewayRole.budget), as the page read it. */
export type LiveBudget = { role: string; tokens_per_day: number; spend_cap_idr_per_day: number; resets_at: string };

export type SeededChip = { id: string; equipment_tag: string; question: string; golden_case_id: string | null; trace_id: string };

export type AskClientProps = {
  version: { label: string; digestPrefix: string } | null;
  /** The seeded chip a `?chip=` link named, when it exists. */
  chip: SeededChip | null;
  /** The `?chip=` value as given, for the designed state when it resolves to no chip. */
  chipParam: string | null;
  budget: LiveBudget | null;
};

/* Wordings of this surface (not fixed strings of 6.3; those come from fixed-strings.ts) ------------------------ */

const TITLE = "Ask";
const SUBTITLE = "Evidence first, then the packet. English or Bahasa Indonesia; every claim carries its citation, and the corpus abstains when it cannot answer.";
const QUESTION_LABEL = "Question";
const QUESTION_HINT = "English or Bahasa Indonesia. Enter asks; Shift+Enter breaks a line.";
const ASK = "Ask";
const ASK_AGAIN = "Ask again";
const MOMENT_GROUP = "Moment template";
const MOMENT_HINT = "Optional: the rule pack infers the moment from the question when none is pressed.";
const MODE_GROUP = "Mode";
const MODE_LABEL: Record<Mode, string> = { answer: "Answer", search: "Semantic search" };
const TEMPLATE_LABEL: Record<Template, string> = {
  readiness: "Start-up readiness",
  trip: "Why it tripped and what the trip did",
  job: "Before this job",
  reading: "Abnormal reading",
};
const EVIDENCE = "Evidence";
const CLAIMS = "Claims";
const TYPED_FACTS = "Typed facts";
const CONTRADICTIONS = "Contradictions";
const PROCEDURE = "Procedure";
const PERMIT_LINES = "Permit, LOTO and car-seal lines";
const NO_PERMIT_LINE = "No permit, LOTO or car-seal line of this lesson resolves to one of its spans.";
const STEPS = "Steps";
const HASH_OK = "hash ok";
const FUNCTIONS_AFFECTED = "Protective functions affected";
const SAFETY_NOTICE = "Safety notice";
const TRACE = "Trace";
const TRACE_READING = "Reading the trace for the gate results and the confidence inputs.";
const TRACE_UNREAD = "The trace could not be read here; the gate results are on the trace page.";
const STATUS_WAITING = "Waiting for line 1: scope and evidence.";
const STATUS_EVIDENCE = "Evidence listed. Composing the packet.";
const STATUS_SEARCHING = "Resolving scope and retrieving. Search mode makes no provider call.";
const STATUS_SEARCH = "Evidence listed. Search mode composes no answer.";
const STATUS_SERVED = "Packet served.";
const NO_EVIDENCE = "No chunk of a served current revision was retrieved for the assets in scope.";
const NO_LINE_ONE = "No evidence line: the request was answered before scope resolution.";
const REQUESTED = "requested";
const INFERRED = "inferred by the rule pack";
const NO_TEMPLATE = "no moment template";
const IDLE_TITLE = "No question on this sheet yet";
const IDLE_TEXT = "Type a question above, press a moment template, or open one of the seeded questions on Home; a seeded question is answered from its stored packet with no live call.";
const IDLE_ACTION = "Seeded questions on Home";
const SEEDED_LEAD = "Seeded question";
const CHIP_MISSING_TITLE = "This chip is not seeded yet";
const CHIP_MISSING_NEXT = "Back to Home";
const BUDGET_TITLE = "Live composing is off for today";
const BUDGET_NEXT = "Seeded questions on Home";
const PROVIDER_TITLE = "The model provider did not answer";
const PROVIDER_TAIL = "The abstention below lists what was retrieved; seeded questions and search mode keep working without a provider call.";
const STATE_NEXT_HOME = "Back to Home";

const HITS = "Retrieved units";
const HITS_LEAD =
  "The units retrieval ranked for this question, in rerank order: the lexical grade first, then cosine similarity. Each row carries the unit's own text at citation length, verbatim, and opens at its span.";
const NO_HITS_TITLE = "No unit matched in scope";
const NO_HITS_TEXT = "Retrieval read the current revisions of the assets this question resolved to and found no unit to rank. Name an equipment tag, an instrument tag or an area the corpus covers.";
const NO_HITS_ACTION = "Seeded questions on Home";
const SEARCH_SCOPE = "Scope";
const LEXICAL = "lexical";
const REFUSED_BEFORE_RETRIEVAL = "No unit is listed: the rule pack classified the request before scope resolution, so nothing was retrieved. Trace";

const ROWS = "rows";
const SOURCE = "Source";
const NONE = "none";
const SIL_NOT_STATED = "not stated";
const TRUNCATED = "truncated";

/* Small helpers ----------------------------------------------------------------------------------------------- */

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

// The numbered verbatim row of a permit line, a step or a reset note. The design system's `.permissives` shape is
// scoped to `.outcome` (the refusal and abstention cards); these lists live in packet panels, so the same three
// columns (index, verbatim, source) are set here rather than by widening a component class this surface owns none of.
const NUM_LIST = "m-0 grid list-none gap-1 p-0";
const NUM_ROW =
  "grid grid-cols-[minmax(28px,max-content)_minmax(0,1fr)_max-content] items-baseline gap-x-2.5 border-b border-edge py-1.5 text-[13.5px] last:border-b-0";

function utc(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Every Citation the packet and line 1 carry, by span id, so a Procedure step (span_id only) opens its chip. */
function citationsBySpan(packet: EvidencePacket | null, evidence: EvidenceLine | null): Map<string, Citation> {
  const out = new Map<string, Citation>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
      return;
    }
    if (!isRecord(value)) return;
    if (typeof value.span_id === "string" && typeof value.quote_hash === "string" && typeof value.document_id === "string") {
      const c = Citation.safeParse(value);
      if (c.success && !out.has(c.data.span_id)) out.set(c.data.span_id, c.data);
      return;
    }
    for (const v of Object.values(value)) walk(v);
  };
  walk(evidence?.evidence ?? []);
  walk(packet);
  return out;
}

const OUTCOME_TONE: Record<EvidencePacket["outcome"], "verified" | "caveat" | "accent" | "defect"> = {
  answer: "verified",
  partial: "caveat",
  abstention: "accent",
  refusal: "defect",
};

const MOMENT_ICON: Record<Template, ReactNode> = {
  readiness: (
    <svg viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M5 3.5v9l7.5-4.5z" />
    </svg>
  ),
  trip: (
    <svg viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M9 2 4 9h4l-1 5 5-7H8z" />
    </svg>
  ),
  job: (
    <svg viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.6 3.4a3 3 0 0 1-3.8 3.8L4 12l-1-1 4.8-4.8a3 3 0 0 1 3.8-3.8L9.9 4.1l.6 1.4 1.4.6z" />
    </svg>
  ),
  reading: (
    <svg viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2.5 11.5a5.5 5.5 0 1 1 11 0" />
      <path d="M8 11.5 10.6 6.8" />
    </svg>
  ),
};

/* The span drawer: the cited page, one page at a time, under the role check ------------------------------------ */

const DocumentHead = z.object({ document: z.object({ page_count: z.number().int(), sha256: z.string() }).loose() }).loose();

type DrawerState = { kind: "loading" } | { kind: "ok"; pageCount: number; sha256: string } | { kind: "failed"; status: number | null };

const DRAWER_LOADING = "Reading the document record.";
const DRAWER_FAILED = "The document record could not be read here; the viewer link below opens the span.";

function SpanDrawer({ citation }: { citation: Citation }) {
  const [state, setState] = useState<DrawerState>({ kind: "loading" });
  const [page, setPage] = useState(citation.page);

  useEffect(() => {
    let alive = true;
    // egress: none (same-origin route of this application; the provider is reached only by src/gateway)
    fetch(`/api/documents/${encodeURIComponent(citation.document_id)}`, { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw response.status;
        const detail = DocumentHead.parse(await response.json());
        if (alive) setState({ kind: "ok", pageCount: detail.document.page_count, sha256: detail.document.sha256 });
      })
      .catch((error: unknown) => {
        if (alive) setState({ kind: "failed", status: typeof error === "number" ? error : null });
      });
    return () => {
      alive = false;
    };
  }, [citation.document_id]);

  // PageViewer's previous and next are hash links; inside the drawer they turn the page here instead of the URL.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a[href^='#']");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const target = parseAnchor(anchor.getAttribute("href") ?? "");
    if (!target) return;
    event.preventDefault();
    setPage(target.page);
  };

  if (state.kind === "loading") return <p className="text-[12.5px] text-ink-700">{DRAWER_LOADING}</p>;
  if (state.kind === "failed") {
    return (
      <p className="text-[12.5px] text-caveat">
        {DRAWER_FAILED}
        {state.status !== null ? <span className="mono"> ({state.status})</span> : null}
      </p>
    );
  }
  return (
    <div onClick={onClick}>
      <PageViewer
        documentId={citation.document_id}
        page={page}
        pageCount={state.pageCount}
        src={`/api/documents/${encodeURIComponent(citation.document_id)}/pages/${page}`}
        sourceSha256={state.sha256}
        span={page === citation.page ? { id: citation.span_id } : null}
      />
    </div>
  );
}

const drawerFor = (citation: Citation) => <SpanDrawer citation={citation} />;

function Chip({ citation, compact = true }: { citation: Citation | null | undefined; compact?: boolean }) {
  if (!citation) return <span className="text-[12px] text-ink-500">{NONE}</span>;
  return (
    <CitationChip citation={citation} compact={compact}>
      {drawerFor(citation)}
    </CitationChip>
  );
}

/* Register table ---------------------------------------------------------------------------------------------- */

type RegRow = { key: string; cells: ReactNode[] };

function Reg({ head, rows, label }: { head: string[]; rows: RegRow[]; label: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="reg" aria-label={label}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((cell, i) => (
                <td key={`${r.key}:${i}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const V = ({ children }: { children: ReactNode }) => <span className="verbatim">{children}</span>;
const M = ({ children }: { children: ReactNode }) => <span className="mono">{children}</span>;

/* Blocks, typed per kind (9.8 Block.items; src/answer/types.ts) ----------------------------------------------- */

function PermissiveRows({ items, label }: { items: PermissiveItem[]; label: string }) {
  return (
    <Reg
      label={label}
      head={["LOGIC No", "No", "Permissive (verbatim)", "Signal tag", "Standing bypass", SOURCE]}
      rows={items.map((p) => ({
        key: `${p.seq_id}:${p.n}:${p.span_id}`,
        cells: [
          <M key="s">{p.seq_id}</M>,
          <M key="n">{p.n}</M>,
          <V key="t">{p.text}</V>,
          p.signal_tag ? <span key="g" className="tag">{p.signal_tag}</span> : null,
          p.standing_bypass_state ? (
            <span key="b" className="text-caveat">
              <V>{p.standing_bypass_state}</V>
            </span>
          ) : null,
          <Chip key="c" citation={p.citation} />,
        ],
      }))}
    />
  );
}

function ProofTestRows({ items }: { items: ProofTestItem[] }) {
  return (
    <>
      <Reg
        label="Proof tests"
        head={["Test class", "Completed", "Work order", "LOGIC No", "Device", "Result (verbatim)", "As found", "As left", SOURCE]}
        rows={items.map((t) => ({
          key: `${t.wo_number}:${t.test_class}`,
          cells: [
            TEST_CLASS_LABEL[t.test_class],
            <M key="d">{t.completion_date}</M>,
            <M key="w">{t.wo_number}</M>,
            t.seq_id ? <M key="s">{t.seq_id}</M> : null,
            t.device_tag ? <M key="v">{t.device_tag}</M> : null,
            <V key="r">{t.result_text}</V>,
            t.as_found ? <M key="f">{t.as_found}</M> : null,
            t.as_left ? <M key="l">{t.as_left}</M> : null,
            <Chip key="c" citation={t.citation} />,
          ],
        }))}
      />
      <p className="ptest-interval">{NO_INTERVAL_STATEMENT}</p>
    </>
  );
}

function StepList({ items }: { items: StepItem[] }) {
  return (
    <ol className={NUM_LIST} aria-label={STEPS}>
      {items.map((s) => (
        <li key={`${s.n}:${s.citation.span_id}`} className={NUM_ROW}>
          <M>{s.n}</M>
          <span>
            <V>{s.text}</V>
            {s.acceptance_criterion ? (
              <span className="mt-1 block text-[12.5px] text-ink-700">
                <span className="eyebrow">acceptance</span> <V>{s.acceptance_criterion}</V>
              </span>
            ) : null}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="badge" data-tone="verified" data-hash-ok={String(s.hash_ok)}>
              {HASH_OK}
            </span>
            <Chip citation={s.citation} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function PermitList({ items }: { items: PermitItem[] }) {
  return (
    <ol className={NUM_LIST} aria-label={PERMIT_LINES}>
      {items.map((p, i) => (
        <li key={`${p.citation.span_id}:${i}`} className={NUM_ROW}>
          <span className="tag">section {p.source_section}</span>
          <V>{p.text}</V>
          <Chip citation={p.citation} />
        </li>
      ))}
    </ol>
  );
}

/**
 * The setpoint as the sheet writes it. `value_text` is the cell verbatim and on this corpus already carries the
 * comparator and the unit that `comparator` and `unit` restate; a part the cell does not carry is added, so a fact
 * typed the other way (a bare number beside its comparator) still renders its whole setpoint.
 */
function setpointText(fact: TypedFact): string {
  const parts: string[] = [];
  if (fact.comparator && !fact.value_text.includes(fact.comparator)) parts.push(fact.comparator);
  parts.push(fact.value_text);
  if (fact.unit && !fact.value_text.includes(fact.unit)) parts.push(fact.unit);
  return parts.join(" ");
}

function InitiatorRows({ items }: { items: InterlockRowItem[] }) {
  return (
    <Reg
      label="Initiator rows"
      head={["Row", "Kind", "Initiator", "Instrument tag", "Setpoint", "Vote", SOURCE]}
      rows={items.map((r) => ({
        key: `${r.row_id}:${r.fact.source.span_id}`,
        cells: [
          <M key="r">{r.row_id}</M>,
          <span key="k" className="tag" data-tone={r.row_kind === "trip" ? "defect" : r.row_kind === "alarm" ? "caveat" : undefined}>
            {r.row_kind}
          </span>,
          r.initiator,
          <M key="i">{r.instrument_tag}</M>,
          <span key="s">
            <M>{setpointText(r.fact)}</M>
            {r.fact.qualifier ? (
              <span className="mt-1 block text-[12px] text-caveat">
                <V>{r.fact.qualifier}</V>
              </span>
            ) : null}
          </span>,
          r.voting ? <M key="v">{r.voting}</M> : null,
          <Chip key="c" citation={r.fact.source} />,
        ],
      }))}
    />
  );
}

function EffectItems({ items }: { items: EffectItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((e) => (
        <div key={`${e.row_id}:${e.citation.span_id}`} className="flex flex-col gap-2">
          <EffectsRow rowId={e.row_id} effects={e.effects} basis={e.effects_basis} />
          <p className="m-0 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-700">
            {e.seq_id ? <M>{e.seq_id}</M> : null}
            <M>{e.instrument_tag}</M>
            <Chip citation={e.citation} />
          </p>
        </div>
      ))}
    </div>
  );
}

function ResetNotes({ items }: { items: ResetNoteItem[] }) {
  return (
    <ol className={NUM_LIST} aria-label="Reset notes">
      {items.map((n) => (
        <li key={`${n.n}:${n.citation.span_id}`} className={NUM_ROW}>
          <M>{n.n}</M>
          <V>{n.text}</V>
          <Chip citation={n.citation} />
        </li>
      ))}
    </ol>
  );
}

function WorkOrderRows({ items }: { items: WorkOrderItem[] }) {
  return (
    <Reg
      label="Related work orders"
      head={["Work order", "Report date", "Work type", "Discipline", "Related interlock", "Breakdown", "Closeout", SOURCE]}
      rows={items.map((w) => ({
        key: w.wo_number,
        cells: [
          <M key="w">{w.wo_number}</M>,
          <M key="d">{w.report_date}</M>,
          w.work_type,
          w.discipline,
          w.related_interlock ? <M key="i">{w.related_interlock}</M> : null,
          <span key="b" className="tag" data-tone={w.breakdown_kind === "unplanned" ? "defect" : w.breakdown_kind === "planned_flagged" ? "caveat" : undefined}>
            {w.breakdown_kind}
          </span>,
          w.closeout_complete ? "complete" : <StatusBadge key="c" kind="incomplete_closeout" />,
          <Chip key="s" citation={w.citation} />,
        ],
      }))}
    />
  );
}

const FIELD_LABEL: Record<CausalLinkItem["linking_field"], string> = { root_cause: "root cause", problem_description: "problem description" };

function ChainItems({ items }: { items: CausalLinkItem[] }) {
  return (
    <ol className="chain" aria-label="Causal chain">
      {items.map((l, i) => (
        <li key={l.id} className="hop" data-link={l.id} style={stagger(i)}>
          <div className="hop-rail">
            <span className="wo">{l.from_wo}</span>
            <span className="days">{l.interval_days} days</span>
            <span className="wo">{l.to_wo}</span>
          </div>
          <div className="hop-body">
            <p>
              <span className="tag" data-tone="accent">
                {l.mechanism_noun}
              </span>
            </p>
            <p>
              <V>{l.linking_sentence}</V> <span className="text-[12px] text-ink-500">from {FIELD_LABEL[l.linking_field]}</span>
            </p>
            <p className="hop-basis">{CHAIN_BASIS_LINE}</p>
            <p>
              <Chip citation={l.citation} />
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function LessonRows({ items }: { items: LessonItem[] }) {
  return (
    <Reg
      label="Lessons"
      head={["Lesson", "Title", "Classification", "Aspect", "Status", SOURCE]}
      rows={items.map((o) => ({
        key: o.opl_id,
        cells: [
          <M key="i">{o.opl_id}</M>,
          <span key="t" className="text-ink-900">
            {o.title}
          </span>,
          <span key="c" className="tag">
            {o.classification}
          </span>,
          o.aspect,
          o.machine_drafted ? <StatusBadge key="m" kind="machine_drafted" approverAlias={o.approver_alias ?? undefined} /> : null,
          <Chip key="s" citation={o.citation} />,
        ],
      }))}
    />
  );
}

function BomRows({ items }: { items: BomPartItem[] }) {
  return (
    <Reg
      label="Bill-of-material parts"
      head={["Work order", "Part string (verbatim)", "Match", "Item", "Description", "Material", "Qty", "Alternative", SOURCE]}
      rows={items.map((p, i) => ({
        key: `${p.wo_number}:${i}`,
        cells: [
          <M key="w">{p.wo_number}</M>,
          <V key="p">{p.part_string}</V>,
          <span key="s" className="tag" data-tone={p.status === "matched" ? "verified" : "caveat"}>
            {p.status}
          </span>,
          p.item_no !== null ? <M key="n">{p.item_no}</M> : null,
          <span key="d">
            {p.description}
            {p.disambiguator_text ? <span className="block text-[12px] text-ink-500">{p.disambiguator_text}</span> : null}
          </span>,
          p.material,
          p.quantity ? <M key="q">{p.quantity}</M> : null,
          p.alternative_item_no !== null ? <M key="a">{p.alternative_item_no}</M> : null,
          <Chip key="c" citation={p.citation} />,
        ],
      }))}
    />
  );
}

function FunctionsOut({ items }: { items: FunctionOutOfServiceItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((f) => (
        <div key={`${f.seq_id}:${f.citation.span_id}`} className="flex flex-col gap-2 border-t border-edge pt-3 first:border-t-0 first:pt-0">
          <p className="m-0 flex flex-wrap items-center gap-2">
            <span className="tag" data-tone="accent">
              {f.seq_id}
            </span>
            <span className="tag" data-tone={f.sil === null ? "caveat" : "defect"}>
              SIL {f.sil === null ? SIL_NOT_STATED : f.sil}
            </span>
            <M>{f.ce_doc_no}</M>
            <Chip citation={f.citation} />
          </p>
          <p className="m-0 flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <span className="eyebrow">isolated</span>
            {f.isolated_elements.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="eyebrow mb-1">Effects through the isolated element</p>
              <ul className="effects">
                {f.effects_through_isolated_element.map((e) => (
                  <li key={e.effect_id} className="effect" data-marked="true">
                    <span className="id">{e.effect_id}</span>
                    <span>{e.final_element}</span>
                  </li>
                ))}
                {f.effects_through_isolated_element.length === 0 ? <li className="text-[12.5px] text-ink-500">{NONE}</li> : null}
              </ul>
            </div>
            <div>
              <p className="eyebrow mb-1">Surviving effects</p>
              <ul className="effects">
                {f.surviving_effects.map((e) => (
                  <li key={e.effect_id} className="effect" data-marked="false">
                    <span className="id">{e.effect_id}</span>
                    <span>{e.final_element}</span>
                  </li>
                ))}
                {f.surviving_effects.length === 0 ? <li className="text-[12.5px] text-ink-500">{NONE}</li> : null}
              </ul>
            </div>
          </div>
          <p className="m-0 text-[13px]">
            <span className="eyebrow">standing permissive defeated</span>{" "}
            {f.standing_permissive_defeated ? <V>{f.standing_permissive_defeated}</V> : <span className="text-ink-500">{NONE}</span>}
          </p>
          <p className="m-0 text-[12.5px] text-caveat">{f.permit_route}</p>
        </div>
      ))}
    </div>
  );
}

function ReturnToService({ items }: { items: ReturnToServiceItem[] }) {
  return (
    <div className="flex flex-col gap-5">
      {items.map((r) => (
        <div key={`${r.seq_id}:${r.citation.span_id}`} className="flex flex-col gap-3">
          <PermissiveGate seqId={r.seq_id} gate={r.permissive_gate} permissives={r.permissives} />
          {r.reset_notes.length > 0 ? <ResetNotes items={r.reset_notes} /> : null}
          <p className="m-0">
            <Chip citation={r.citation} />
          </p>
        </div>
      ))}
    </div>
  );
}

const TAG_IN_LABEL = /\(([A-Z]{1,5}-\d{2,5}[A-Z]?)\)\s*$/;

/** The instrument tag of a ladder, read from the lane's own fact labels ("T3 High vibration (VSHH-1201)"). */
function ladderTag(item: LadderItem, fallback: string): string {
  for (const fact of Object.values(item.layers)) {
    const m = fact?.label.match(TAG_IN_LABEL);
    if (m?.[1]) return m[1];
  }
  return fallback;
}

function LadderItems({ items, fallbackTag }: { items: LadderItem[]; fallbackTag: string }) {
  return (
    <div className="flex flex-col gap-5">
      {items.map((l, i) => (
        <div key={`${l.variable}:${i}`} className="flex flex-col gap-2">
          <Ladder instrumentTag={ladderTag(l, fallbackTag)} variable={l.variable} pressure={l.pressure} layers={l.layers} voteCellText={null} classesRead={l.classes_read} drawerFor={drawerFor} />
          {l.alarm_source_class ? (
            <p className="m-0 text-[12.5px] text-ink-700">
              <span className="eyebrow">alarm source</span> {l.alarm_source_class}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ResponseRows({ items }: { items: DocumentedResponseItem[] }) {
  return (
    <Reg
      label="Documented responses"
      head={["Lesson", "Row", "Problem", "Cause", "Action", "Quoted work order", SOURCE]}
      rows={items.map((r) => ({
        key: `${r.opl_id}:${r.n}`,
        cells: [
          <M key="o">{r.opl_id}</M>,
          <M key="n">{r.n}</M>,
          <V key="p">{r.problem}</V>,
          <V key="c">{r.cause}</V>,
          <span key="a">
            <V>{r.action}</V>
            {r.truncated ? (
              <span className="tag ml-2" data-tone="caveat">
                {TRUNCATED}
              </span>
            ) : null}
          </span>,
          r.quoted_wo_number ? <M key="w">{r.quoted_wo_number}</M> : null,
          <Chip key="s" citation={r.citation} />,
        ],
      }))}
    />
  );
}

const BASIS_LABEL: Record<PrecedentItem["basis"], string> = { analyst_classification: "analyst classification", agent_classification: "agent classification" };
const REVIEW_LABEL: Record<PrecedentItem["review_status"], string> = { reviewed: "reviewed", pending: "review pending" };

function PrecedentItems({ items }: { items: PrecedentItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((p) => (
        <section key={p.family_id} className="family" aria-label={p.label} data-family={p.family_id}>
          <div className="blockhead">
            <h4>{p.label}</h4>
            <span className="mono text-[12px] text-ink-500">
              {p.member_wo_numbers.length} members
            </span>
          </div>
          <p className="m-0 flex flex-wrap gap-1.5">
            {p.member_wo_numbers.map((wo) => (
              <M key={wo}>{wo}</M>
            ))}
          </p>
          <p className="family-basis">
            <span className="eyebrow">basis</span> {BASIS_LABEL[p.basis]}{" "}
            <span className="badge" data-tone={p.review_status === "reviewed" ? "verified" : "caveat"}>
              {REVIEW_LABEL[p.review_status]}
            </span>{" "}
            <Chip citation={p.citation} />
          </p>
        </section>
      ))}
    </div>
  );
}

function BlockBody({ block, fallbackTag }: { block: Block; fallbackTag: string }) {
  switch (block.kind) {
    case "permissives":
    case "standing_bypasses":
      return <PermissiveRows items={block.items as PermissiveItem[]} label={block.label} />;
    case "proof_tests":
      return <ProofTestRows items={block.items as ProofTestItem[]} />;
    case "steps":
      return <StepList items={block.items as StepItem[]} />;
    case "permit":
      return <PermitList items={block.items as PermitItem[]} />;
    case "initiator_row":
      return <InitiatorRows items={block.items as InterlockRowItem[]} />;
    case "effects":
      return <EffectItems items={block.items as EffectItem[]} />;
    case "reset_note":
      return <ResetNotes items={block.items as ResetNoteItem[]} />;
    case "related_work_orders":
      return <WorkOrderRows items={block.items as WorkOrderItem[]} />;
    case "causal_chain":
      return <ChainItems items={block.items as CausalLinkItem[]} />;
    case "lessons":
      return <LessonRows items={block.items as LessonItem[]} />;
    case "datasheet_limits":
      return <TypedFactGrid facts={block.items as TypedFact[]} drawerFor={(f) => drawerFor(f.source)} />;
    case "bom_parts":
      return <BomRows items={block.items as BomPartItem[]} />;
    case "functions_out_of_service":
      return <FunctionsOut items={block.items as FunctionOutOfServiceItem[]} />;
    case "return_to_service":
      return <ReturnToService items={block.items as ReturnToServiceItem[]} />;
    case "ladder":
      return <LadderItems items={block.items as LadderItem[]} fallbackTag={fallbackTag} />;
    case "documented_response":
      return <ResponseRows items={block.items as DocumentedResponseItem[]} />;
    case "precedent":
      return <PrecedentItems items={block.items as PrecedentItem[]} />;
  }
}

function BlockPanel({ block, fallbackTag }: { block: Block; fallbackTag: string }) {
  return (
    <GlassPanel as="article" className="flex flex-col gap-3 p-5" data-component="packet-block" data-kind={block.kind} aria-label={block.label}>
      <div className="blockhead">
        <h3>{block.label}</h3>
        <span className="mono text-[12px] text-ink-500">
          {block.order} · {block.items.length} {ROWS}
        </span>
      </div>
      <BlockBody block={block} fallbackTag={fallbackTag} />
    </GlassPanel>
  );
}

/* The procedure of a documented bypass or a cited lesson: permit lines above the steps, hash_ok on every step ---- */

function ProcedureView({ procedure, bySpan }: { procedure: Procedure; bySpan: Map<string, Citation> }) {
  return (
    <GlassPanel as="article" className="flex flex-col gap-4 p-5" data-component="procedure" data-opl={procedure.opl_id} aria-label={`${PROCEDURE} ${procedure.opl_id}`}>
      <div className="blockhead">
        <h3>
          {PROCEDURE} <span className="mono">{procedure.opl_id}</span>
        </h3>
        <span className="flex flex-wrap items-center gap-2">
          <span className="tag">rev {procedure.revision}</span>
          <span className="badge" data-tone="verified">
            {HASH_OK} on {procedure.steps.length} steps
          </span>
        </span>
      </div>
      <div>
        <p className="eyebrow mb-1">{PERMIT_LINES}</p>
        {procedure.permit_block.length > 0 ? (
          <ol className={NUM_LIST} aria-label={PERMIT_LINES}>
            {procedure.permit_block.map((line, i) => (
              <li key={`${line.span_id}:${i}`} className={NUM_ROW}>
                <M>{i + 1}</M>
                <V>{line.text}</V>
                <Chip citation={bySpan.get(line.span_id)} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-[12.5px] text-ink-700">{NO_PERMIT_LINE}</p>
        )}
      </div>
      <div>
        <p className="eyebrow mb-1">{STEPS}</p>
        <ol className={NUM_LIST} aria-label={STEPS}>
          {procedure.steps.map((s) => (
            <li key={`${s.n}:${s.span_id}`} className={NUM_ROW}>
              <M>{s.n}</M>
              <V>{s.text}</V>
              <span className="flex flex-wrap items-center gap-2">
                <span className="badge" data-tone="verified" data-hash-ok={String(s.hash_ok)}>
                  {HASH_OK}
                </span>
                <Chip citation={bySpan.get(s.span_id)} />
              </span>
            </li>
          ))}
        </ol>
      </div>
      {procedure.protective_functions_affected ? (
        <div>
          <p className="eyebrow mb-1">{FUNCTIONS_AFFECTED}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {procedure.protective_functions_affected.map((f) => (
              <li key={f.seq_id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="tag" data-tone="accent">
                  {f.seq_id}
                </span>
                <span className="tag" data-tone={f.sil === null ? "caveat" : "defect"}>
                  SIL {f.sil === null ? SIL_NOT_STATED : f.sil}
                </span>
                <span>
                  <span className="eyebrow">through the isolated element</span> {f.effects_through_isolated_element.length > 0 ? f.effects_through_isolated_element.join(", ") : NONE}
                </span>
                <span>
                  <span className="eyebrow">surviving</span> {f.surviving_effects.length > 0 ? f.surviving_effects.join(", ") : NONE}
                </span>
                {f.standing_permissive_defeated ? (
                  <span>
                    <span className="eyebrow">standing permissive defeated</span> <V>{f.standing_permissive_defeated}</V>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </GlassPanel>
  );
}

/* The packet ---------------------------------------------------------------------------------------------------- */

type TraceState = { kind: "idle" } | { kind: "loading" } | { kind: "ok"; trace: AnswerTrace } | { kind: "failed" };

function PacketView({
  packet,
  evidence,
  requestedTemplate,
  traceState,
}: {
  packet: EvidencePacket;
  evidence: EvidenceLine | null;
  requestedTemplate: Template | null;
  traceState: TraceState;
}) {
  const bySpan = useMemo(() => citationsBySpan(packet, evidence), [packet, evidence]);
  const traceHref = `/trace/${encodeURIComponent(packet.trace_id)}`;
  const providerDown = packet.abstention?.reason === PROVIDER_UNREACHABLE_REASON;
  const fallbackTag = evidence?.scope.tags.join(", ") || packet.trace_id;
  const blocks = [...packet.blocks].sort((a, b) => a.order - b.order);

  // The procedure renders once, permit lines above steps, where the packet's own order puts the first of them.
  const sections: ReactNode[] = [];
  let procedureDrawn = false;
  for (const block of blocks) {
    if (packet.procedure && (block.kind === "steps" || block.kind === "permit")) {
      if (!procedureDrawn) {
        sections.push(<ProcedureView key="procedure" procedure={packet.procedure} bySpan={bySpan} />);
        procedureDrawn = true;
      }
      continue;
    }
    sections.push(<BlockPanel key={`${block.kind}:${block.order}`} block={block} fallbackTag={fallbackTag} />);
  }
  if (packet.procedure && !procedureDrawn) sections.unshift(<ProcedureView key="procedure" procedure={packet.procedure} bySpan={bySpan} />);

  return (
    <section className="flex flex-col gap-4" aria-label="Evidence packet" data-component="packet" data-outcome={packet.outcome} data-mode={packet.mode}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="tag" data-tone={OUTCOME_TONE[packet.outcome]}>
          {packet.outcome}
        </span>
        {/* `.tag` is inline-flex, so a whitespace-only node between two of its items is dropped: the gap is set. */}
        {packet.template ? (
          <span className="tag gap-1.5" title={requestedTemplate ? REQUESTED : INFERRED}>
            {TEMPLATE_LABEL[packet.template]}
            <span className="font-normal text-ink-500">{requestedTemplate ? REQUESTED : INFERRED}</span>
          </span>
        ) : (
          <span className="tag">{NO_TEMPLATE}</span>
        )}
        <span className="tag">{packet.mode}</span>
        <span className="mono text-[12px] text-ink-500">
          corpus {packet.corpus_version} · rule pack {packet.rulepack.class} {packet.rulepack.version}
        </span>
        <Link href={traceHref} className="draw ml-auto text-[13px]">
          {TRACE} <span aria-hidden>&rarr;</span>
        </Link>
      </div>

      {packet.refusal ? <RefusalCard refusal={packet.refusal} /> : null}

      {providerDown && packet.abstention ? (
        <DesignedState inline tone="caveat" title={PROVIDER_TITLE} explanation={`${packet.abstention.reason} ${PROVIDER_TAIL}`} next={{ href: "/", label: STATE_NEXT_HOME }} />
      ) : null}

      {packet.abstention ? (
        <AbstentionCard
          abstention={packet.abstention}
          clusterHref={packet.abstention.cluster ? `/coverage/clusters/${encodeURIComponent(packet.abstention.cluster.id)}` : undefined}
          requestHref={packet.abstention.cluster ? `/coverage/clusters/${encodeURIComponent(packet.abstention.cluster.id)}` : undefined}
          drawerFor={drawerFor}
        />
      ) : null}

      {packet.gaps_declared.length > 0 ? <PartialAnswerBanner gaps={packet.gaps_declared} /> : null}

      {packet.safety_notice ? (
        <aside className="glass flex flex-col gap-2 p-4" role="note" data-component="safety-notice">
          <span className="tag self-start" data-tone="caveat">
            {SAFETY_NOTICE}
          </span>
          <p className="m-0 text-[13.5px] text-ink-900">{packet.safety_notice}</p>
        </aside>
      ) : null}

      {packet.claims.length > 0 ? (
        <GlassPanel className="p-5" aria-label={CLAIMS}>
          <div className="blockhead">
            <h3>{CLAIMS}</h3>
            <span className="mono text-[12px] text-ink-500">{packet.claims.length}</span>
          </div>
          <EvidenceList claims={packet.claims} drawerFor={drawerFor} aria-label={CLAIMS} />
        </GlassPanel>
      ) : null}

      {packet.typed_facts.length > 0 ? (
        <section aria-label={TYPED_FACTS} className="flex flex-col gap-2">
          <div className="blockhead">
            <h3>{TYPED_FACTS}</h3>
            <span className="mono text-[12px] text-ink-500">{packet.typed_facts.length}</span>
          </div>
          <TypedFactGrid facts={packet.typed_facts} drawerFor={(f) => drawerFor(f.source)} />
        </section>
      ) : null}

      {sections}

      {packet.contradictions.length > 0 ? (
        <section aria-label={CONTRADICTIONS} className="flex flex-col gap-2">
          <div className="blockhead">
            <h3>{CONTRADICTIONS}</h3>
            <span className="mono text-[12px] text-ink-500">{packet.contradictions.length}</span>
          </div>
          {packet.contradictions.map((c, i) => (
            <ContradictionChip key={`${c.subject}:${i}`} contradiction={c} drawerFor={drawerFor} />
          ))}
        </section>
      ) : null}

      {packet.caveat ? <CaveatLine kind="as_built" /> : null}

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-edge pt-3" data-component="packet-foot">
        {traceState.kind === "ok" ? (
          <ConfidenceBand band={packet.confidence.band} inputs={traceState.trace.confidence.inputs} />
        ) : (
          <span className="tag">confidence {packet.confidence.band}</span>
        )}
        {traceState.kind === "ok" ? (
          <VerdictStrip results={traceState.trace.gate_results} repairRounds={traceState.trace.repair_rounds} traceHref={traceHref} className="flex-1" />
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-700">
            {traceState.kind === "failed" ? TRACE_UNREAD : TRACE_READING}
            <Link href={traceHref} className="draw">
              {TRACE} <span aria-hidden>&rarr;</span>
            </Link>
          </span>
        )}
      </footer>
    </section>
  );
}

/* The designed failure states of 6.3 ---------------------------------------------------------------------------- */

function FailureView({ failure, retry }: { failure: AskFailure; retry: () => void }) {
  const retryButton = (
    <p className="rise mt-6" style={stagger(4)}>
      <NeumorphicChip onClick={retry}>{ASK_AGAIN}</NeumorphicChip>
    </p>
  );
  switch (failure.kind) {
    case "rate_limited":
      return (
        <DesignedState
          inline
          code="429"
          tone="caveat"
          title="Rate limit reached"
          explanation={`The limit is ${failure.limit} requests per minute for this ${failure.scope === "addr" ? "address" : "account"}. The window resets at ${utc(failure.resets_at)}; seeded questions and every read-only surface keep working.`}
          reason={`scope ${failure.scope} · limit ${failure.limit} · resets_at ${failure.resets_at}${failure.request_id ? ` · request ${failure.request_id}` : ""}`}
          next={{ href: "/", label: BUDGET_NEXT }}
        />
      );
    case "budget_exhausted":
      return <BudgetState budget={{ role: failure.role, tokens_per_day: failure.budget.tokens_per_day, spend_cap_idr_per_day: failure.budget.spend_cap_idr_per_day, resets_at: failure.resets_at }} requestId={failure.request_id} />;
    case "forbidden":
      return (
        <DesignedState
          inline
          code="403"
          tone="defect"
          title="This role cannot ask"
          explanation="The session's role holds no ask_read column in the permission matrix, so the request was refused and audited as auth.role_violation. Sign in with a demo account that holds it."
          reason={failure.request_id ? `request ${failure.request_id}` : undefined}
          next={{ href: "/login", label: "Sign in" }}
        />
      );
    case "unauthenticated":
      return (
        <DesignedState
          inline
          code="401"
          tone="caveat"
          title="The session has ended"
          explanation="Sessions last eight hours and this one is no longer valid. Sign in again to ask; the question is kept in the box above."
          next={{ href: "/login?next=/ask", label: "Sign in" }}
        />
      );
    case "hash_mismatch":
      return (
        <DesignedState
          inline
          code="409"
          tone="defect"
          title="Procedure blocked by an integrity error"
          explanation={`A stored step of lesson ${failure.opl_id} no longer hashes to its source, so the render is blocked and never paraphrased; the event render.integrity_blocked was written.`}
          reason={`opl ${failure.opl_id}${failure.step_n !== null ? ` · step ${failure.step_n}` : ""}${failure.span_id ? ` · span ${failure.span_id}` : ""}${failure.request_id ? ` · request ${failure.request_id}` : ""}`}
          next={{ href: "/integrity", label: "Integrity Register" }}
        />
      );
    case "http":
      return (
        <DesignedState inline code={String(failure.status)} tone="defect" title="The ask route did not serve a packet" explanation="The route answered with an error code instead of the two-line stream; nothing is shown in the packet's place." reason={`${failure.code}${failure.request_id ? ` · request ${failure.request_id}` : ""}`}>
          {retryButton}
        </DesignedState>
      );
    case "network":
      return (
        <DesignedState inline tone="defect" title="The Hub did not answer" explanation="The request did not reach the server, or the connection dropped before a reply. Nothing is shown in the packet's place." reason={failure.message}>
          {retryButton}
        </DesignedState>
      );
    case "stream":
      return (
        <DesignedState
          inline
          tone="defect"
          title="The packet did not arrive"
          explanation="The stream closed before the packet line. The evidence listed above stays as it was received; if a trace was written it is readable on its page."
          reason={`${failure.message}${failure.trace_id ? ` · trace ${failure.trace_id}` : ""}`}
          next={failure.trace_id ? { href: `/trace/${encodeURIComponent(failure.trace_id)}`, label: TRACE } : undefined}
        >
          {retryButton}
        </DesignedState>
      );
    case "aborted":
      return null;
  }
}

function BudgetState({ budget, requestId }: { budget: LiveBudget; requestId?: string | null }) {
  return (
    <DesignedState
      inline
      code="429"
      tone="caveat"
      title={BUDGET_TITLE}
      explanation={`The daily budget of the ${budget.role} role is spent: ${budget.tokens_per_day} tokens or IDR ${budget.spend_cap_idr_per_day} per UTC day, whichever comes first. Live composing resumes at ${utc(budget.resets_at)}; seeded questions and search mode make no provider call and keep working.`}
      reason={`role ${budget.role} · tokens_per_day ${budget.tokens_per_day} · spend_cap_idr_per_day ${budget.spend_cap_idr_per_day} · resets_at ${budget.resets_at}${requestId ? ` · request ${requestId}` : ""}`}
      next={{ href: "/", label: BUDGET_NEXT }}
    />
  );
}

/* The run: one question through the stream ---------------------------------------------------------------------- */

type Run = {
  question: string;
  template: Template | null;
  mode: Mode;
  streaming: boolean;
  evidence: EvidenceLine | null;
  packet: EvidencePacket | null;
  /** The body of the search-mode entry point; null on an answer-mode run. */
  search: SearchResult | null;
  failure: AskFailure | null;
  trace: TraceState;
};

async function fetchTrace(id: string, signal: AbortSignal): Promise<AnswerTrace | null> {
  try {
    const response = await fetch(`/api/trace/${encodeURIComponent(id)}`, { credentials: "same-origin", signal });
    if (!response.ok) return null;
    const parsed = AnswerTrace.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The live region of the two-stage stream: line 1 landed, line 2 landed, and the closing word once it has. */
function RunStatus({ run }: { run: Run }) {
  if (!run.streaming && !run.packet && !run.search) return null;
  // A refused search listed no evidence: the card below states what happened, so the line would only contradict it.
  if (run.search?.refusal) return null;
  const text = run.mode === "search" ? (run.streaming ? STATUS_SEARCHING : STATUS_SEARCH) : !run.streaming ? STATUS_SERVED : run.evidence ? STATUS_EVIDENCE : STATUS_WAITING;
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2" data-component="ask-status">
      {run.streaming ? (
        <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]" aria-hidden>
          <span className="ask-sweep absolute inset-y-0 left-0 w-1/4 rounded-full bg-accent" />
        </div>
      ) : null}
      <p className="m-0 text-[12.5px] text-ink-700">{text}</p>
    </div>
  );
}

function EvidencePanel({ line }: { line: EvidenceLine }) {
  return (
    <GlassPanel className="flex flex-col gap-3 p-5" aria-label={EVIDENCE} data-component="evidence-line-1">
      <div className="blockhead">
        <h3>{EVIDENCE}</h3>
        <span className="flex flex-wrap items-center gap-2">
          <span className="mono text-[12px] text-ink-500">
            {line.evidence.length} citations
          </span>
          <span className="tag" data-tone={line.rulepack.class === "none" ? undefined : line.rulepack.class === "documented_bypass" ? "caveat" : "defect"}>
            rule pack {line.rulepack.class} {line.rulepack.version}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="eyebrow">scope</span>
        {line.scope.tags.length > 0 ? (
          line.scope.tags.map((t) => (
            <span key={t} className="tag" data-tone="accent">
              {t}
            </span>
          ))
        ) : (
          <span className="text-[12.5px] text-ink-500">no asset in scope</span>
        )}
      </div>
      {line.scope.basis ? <p className="m-0 text-[12.5px] text-ink-700">{line.scope.basis}</p> : null}
      {line.evidence.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Retrieved citations in rerank order">
          {line.evidence.map((c, i) => (
            <li key={`${c.document_id}:${c.span_id}`} className="flex items-center gap-2">
              <span className="mono w-6 text-right text-[11.5px] text-ink-500">{i + 1}</span>
              <Chip citation={c} compact={false} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-[12.5px] text-ink-700">{NO_EVIDENCE}</p>
      )}
      <p className="m-0 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
        <span className="eyebrow">trace</span>
        <span className="mono">{line.trace_id}</span>
        <CopyId value={line.trace_id} label="trace id" />
        <span className="eyebrow">corpus</span>
        <span className="mono">{line.corpus_version}</span>
      </p>
    </GlassPanel>
  );
}

/* Search mode: the retrieval-only body of GET /api/search, no answer composed (D-22) --------------------------- */

const COSINE_DIGITS = 3;

function SearchView({ result }: { result: SearchResult }) {
  const traceHref = `/trace/${encodeURIComponent(result.trace_id)}`;
  // The rule pack runs inbound on this entry point too: a refused request never reached scope resolution, so the
  // sheet carries the refusal alone and states why no unit is listed rather than showing an empty register.
  if (result.refusal) {
    return (
      <section className="flex flex-col gap-4" aria-label={MODE_LABEL.search} data-component="search-result" data-trace={result.trace_id}>
        <RefusalCard refusal={result.refusal} />
        <p className="m-0 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-700">
          {REFUSED_BEFORE_RETRIEVAL}
          <span className="mono">{result.trace_id}</span>
          <CopyId value={result.trace_id} label="trace id" />
          <Link href={traceHref} className="draw">
            {TRACE} <span aria-hidden>&rarr;</span>
          </Link>
        </p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-4" aria-label={MODE_LABEL.search} data-component="search-result" data-trace={result.trace_id}>
      <PartialAnswerBanner gaps={[SEARCH_MODE_GAP]} />

      <GlassPanel className="flex flex-col gap-3 p-5" aria-label={HITS} data-component="search-hits">
        <div className="blockhead">
          <h3>{HITS}</h3>
          <span className="flex flex-wrap items-center gap-2">
            <span className="mono text-[12px] text-ink-500">
              {result.hits.length} {ROWS} · {result.evidence.length} citations
            </span>
            <Link href={traceHref} className="draw text-[13px]">
              {TRACE} <span aria-hidden>&rarr;</span>
            </Link>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow">{SEARCH_SCOPE}</span>
          {result.scope.tags.length > 0 ? (
            result.scope.tags.map((t) => (
              <span key={t} className="tag" data-tone="accent">
                {t}
              </span>
            ))
          ) : (
            <span className="text-[12.5px] text-ink-500">no asset in scope</span>
          )}
        </div>
        {result.scope.basis.length > 0 ? <p className="m-0 text-[12.5px] text-ink-700">{result.scope.basis.join("; ")}</p> : null}
        {result.hits.length > 0 ? (
          <>
            <p className="m-0 max-w-prose text-[12.5px] text-ink-700">{HITS_LEAD}</p>
            <SearchResultList aria-label={HITS}>
              {result.hits.map((hit) => (
                <SearchResultRow
                  key={hit.chunk_id}
                  href={documentHref(hit.citation)}
                  title={hit.citation.doc_no}
                  kind={hit.unit_kind}
                  meta={[`#${hit.rank.position}`, `rev ${hit.citation.revision}`, `p. ${hit.citation.page}`, `${LEXICAL} ${hit.rank.lexical}`]}
                  snippet={hit.snippet}
                  score={Number(hit.rank.cosine.toFixed(COSINE_DIGITS))}
                  citation={hit.citation}
                  drawer={drawerFor(hit.citation)}
                />
              ))}
            </SearchResultList>
          </>
        ) : (
          <EmptyState title={NO_HITS_TITLE} explanation={NO_HITS_TEXT} action={{ href: "/", label: NO_HITS_ACTION }} />
        )}
        <p className="m-0 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
          <span className="eyebrow">trace</span>
          <span className="mono">{result.trace_id}</span>
          <CopyId value={result.trace_id} label="trace id" />
          <span className="eyebrow">corpus</span>
          <span className="mono">{result.corpus_version}</span>
        </p>
      </GlassPanel>
    </section>
  );
}

function RunView({ run, retry }: { run: Run; retry: () => void }) {
  return (
    <div className="flex flex-col gap-4" data-component="ask-run">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="eyebrow">question</span>
        {/* The question is quoted as typed (AC-ANS-13); once the trace is read it carries the detected language. */}
        <p className="m-0 max-w-[80ch] text-[15px] text-ink-900" lang={run.trace.kind === "ok" ? run.trace.trace.language_detected : undefined}>
          {run.question}
        </p>
        <span className="tag">{MODE_LABEL[run.mode]}</span>
        <span className="tag">{run.template ? `${TEMPLATE_LABEL[run.template]} · ${REQUESTED}` : NO_TEMPLATE}</span>
      </div>
      <RunStatus run={run} />
      {run.search ? <SearchView result={run.search} /> : null}
      {run.evidence ? <EvidencePanel line={run.evidence} /> : null}
      {run.packet && !run.evidence ? <p className="m-0 text-[12.5px] text-ink-500">{NO_LINE_ONE}</p> : null}
      {run.packet ? <PacketView packet={run.packet} evidence={run.evidence} requestedTemplate={run.template} traceState={run.trace} /> : null}
      {run.failure ? <FailureView failure={run.failure} retry={retry} /> : null}
    </div>
  );
}

/* The surface ----------------------------------------------------------------------------------------------------- */

const MAX_QUESTION = 2000;
const MAGNET_PULL = 0.18;
const MAGNET_MAX = 6;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AskClient({ version, chip, chipParam, budget }: AskClientProps) {
  const inputId = useId();
  const [question, setQuestion] = useState(chip?.question ?? "");
  const [template, setTemplate] = useState<Template | null>(null);
  const [mode, setMode] = useState<Mode>("answer");
  const [run, setRun] = useState<Run | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const playedRef = useRef(false);

  const ask = useCallback(async (q: string, t: Template | null, m: Mode) => {
    const text = q.trim();
    if (text.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRun({ question: text, template: t, mode: m, streaming: true, evidence: null, packet: null, search: null, failure: null, trace: { kind: "idle" } });
    try {
      // Search mode is one retrieval-only body (D-22); answer mode is the two-line stream of 9.8.
      if (m === "search") {
        const result = await searchQuery({ question: text, template: t ?? undefined }, controller.signal);
        if (controller.signal.aborted) return;
        setRun((r) => (r ? { ...r, streaming: false, search: result } : r));
        return;
      }
      const { trace_id } = await askStream(
        { question: text, template: t ?? undefined, mode: m },
        {
          onEvidence: (line) => setRun((r) => (r ? { ...r, evidence: line } : r)),
          onPacket: (line) => setRun((r) => (r ? { ...r, packet: line.packet } : r)),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setRun((r) => (r ? { ...r, streaming: false, trace: { kind: "loading" } } : r));
      const trace = await fetchTrace(trace_id, controller.signal);
      if (controller.signal.aborted) return;
      setRun((r) => (r ? { ...r, trace: trace ? { kind: "ok", trace } : { kind: "failed" } } : r));
    } catch (error) {
      if (controller.signal.aborted) return;
      const failure: AskFailure = error instanceof AskError ? error.failure : { kind: "network", message: error instanceof Error ? error.message : String(error) };
      setRun((r) => (r ? { ...r, streaming: false, failure } : r));
    }
  }, []);

  // A seeded chip plays on arrival: the stored packet through the real stream, zero provider calls (9.17, AC-UI-05).
  useEffect(() => {
    if (!chip || playedRef.current) return;
    playedRef.current = true;
    void ask(chip.question, null, "answer");
  }, [chip, ask]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = () => void ask(question, template, mode);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  // 7.2: magnetic attraction with elastic return on the primary action of the surface only.
  const onMagnetMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (reducedMotion() || event.pointerType !== "mouse") return;
    const r = event.currentTarget.getBoundingClientRect();
    const dx = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, (event.clientX - (r.left + r.width / 2)) * MAGNET_PULL));
    const dy = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, (event.clientY - (r.top + r.height / 2)) * MAGNET_PULL));
    event.currentTarget.style.transition = "transform 0.08s linear";
    event.currentTarget.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  };
  const onMagnetLeave = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.transition = "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)";
    event.currentTarget.style.transform = "";
  };

  const busy = run?.streaming === true;

  return (
    <div className="flex flex-col gap-6">
      <style>{`@keyframes ask-sweep{from{transform:translateX(-100%)}to{transform:translateX(400%)}}.ask-sweep{animation:ask-sweep 1.4s cubic-bezier(.4,0,.2,1) infinite}`}</style>

      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <h1 className="text-[34px]">{TITLE}</h1>
          <p className="mt-1 max-w-prose text-[13.5px] text-ink-700">{SUBTITLE}</p>
        </div>
        {version ? <VersionBadge label={version.label} digestPrefix={version.digestPrefix} active /> : null}
      </header>

      {chipParam && !chip ? (
        <div className="rise" style={stagger(1)}>
          <DesignedState
            inline
            tone="caveat"
            title={CHIP_MISSING_TITLE}
            explanation="The seeded question chips arrive with the recorded packets of the bundle (9.17, from bundle 1.1.0 on); until they are seeded, a chip link resolves to no stored packet and nothing plays in its place. Type the question instead and it is answered live."
            reason={`chip ${chipParam}`}
            next={{ href: "/", label: CHIP_MISSING_NEXT }}
          />
        </div>
      ) : null}

      {budget ? (
        <div className="rise" style={stagger(1)}>
          <BudgetState budget={budget} />
        </div>
      ) : null}

      <div className="rise" style={stagger(2)}>
        <GlassPanel className="p-5" aria-labelledby={`${inputId}-label`} data-component="ask-form">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label id={`${inputId}-label`} htmlFor={inputId} className="eyebrow">
                {QUESTION_LABEL}
              </label>
              <span className="text-[12px] text-ink-500">{QUESTION_HINT}</span>
            </div>
            {chip ? (
              <p className="m-0 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-700" data-component="seeded-chip-lead">
                <span className="eyebrow">{SEEDED_LEAD}</span>
                <span className="mono">{chip.id}</span>
                <span className="tag" data-tone="accent">
                  {chip.equipment_tag}
                </span>
                {chip.golden_case_id ? <span className="tag">{chip.golden_case_id}</span> : null}
              </p>
            ) : null}
            <textarea
              id={inputId}
              name="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value.slice(0, MAX_QUESTION))}
              onKeyDown={onKeyDown}
              rows={3}
              maxLength={MAX_QUESTION}
              spellCheck={false}
              autoComplete="off"
              required
              className="w-full resize-y rounded-[8px] bg-paper px-4 py-3 text-[16px] leading-relaxed text-ink-900 shadow-[inset_0_0_0_1px_var(--film-edge),inset_0_1px_2px_rgba(27,25,22,0.06)] outline-none placeholder:text-ink-500 focus-visible:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]"
              placeholder="Why did GA-1201A trip, and what is the trip setpoint? / Apa syarat start-up KC-4501?"
            />
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
              <div role="group" aria-label={MOMENT_GROUP} className="flex flex-wrap gap-2" title={MOMENT_HINT}>
                {(Object.keys(TEMPLATE_LABEL) as Template[]).map((t) => (
                  <NeumorphicChip key={t} size="sm" icon={MOMENT_ICON[t]} active={template === t} onClick={() => setTemplate(template === t ? null : t)}>
                    {TEMPLATE_LABEL[t]}
                  </NeumorphicChip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 md:ml-auto">
                <div role="group" aria-label={MODE_GROUP} className="flex gap-2">
                  {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                    <NeumorphicChip key={m} size="sm" active={mode === m} onClick={() => setMode(m)}>
                      {MODE_LABEL[m]}
                    </NeumorphicChip>
                  ))}
                </div>
                {/* Not a submit: the sheet is composed by reading a stream, so a click before hydration must do
                    nothing rather than submit the form natively and reload the sheet without the question. */}
                <button
                  type="button"
                  onClick={submit}
                  className={cx("neu cursor-pointer", busy && "opacity-70")}
                  aria-busy={busy}
                  onPointerMove={onMagnetMove}
                  onPointerLeave={onMagnetLeave}
                  data-component="ask-submit"
                >
                  {busy ? ASK_AGAIN : ASK}
                  <span aria-hidden className="mono">
                    &rarr;
                  </span>
                </button>
              </div>
            </div>
          </form>
        </GlassPanel>
      </div>

      <div className="rise" style={stagger(3)}>
        {run ? (
          <RunView run={run} retry={() => void ask(run.question, run.template, run.mode)} />
        ) : (
          <EmptyState title={IDLE_TITLE} explanation={IDLE_TEXT} action={{ href: "/", label: IDLE_ACTION }} />
        )}
      </div>
    </div>
  );
}
