// POST /api/ask (blueprint 9.8, 9.9, 9.16; ARCHITECTURE section 7; AC-ANS-08, AC-ANS-18, AC-ANS-19, AC-NFR-04,
// AC-NFR-15, AC-NFR-19): the two-line stream, the seeded path, the refusal line, the bounded repair, the
// question-blind verifier, C6 on a verifier parse failure, fault injection and the packet's fixed strings. Hermetic:
// the gateway's invoke, embed and budgetStatus are mocks that mirror the real envelope check (INPUT_SCHEMAS) and hand
// back 9.13 GatewayCall rows; the database is the fake client; scope, retrieval and the typed facts are the synthetic
// fixtures of tests/fixtures/answer; no network, no provider, no corpus text.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import {
  CORPUS_VERSION,
  TRACE_ID,
  TRIP_QUESTION,
  USER,
  SEEDED_QUESTION,
  chunks,
  composerReply,
  entailedReply,
  gatewayCall,
  readLines,
  replyWithNotEntailed,
  retrieval,
  retrievalOf,
  scope,
  seeded,
  seededPacket,
  typedFacts,
} from "../../../../tests/fixtures/answer";
import { argOf, resetFakeDb, statements } from "../../../../tests/helpers/fake-db-client";
import { setRequest } from "../../../../tests/helpers/next-headers";
import { evidenceOf } from "@/answer/seeded";
import { Abstention, AskStream, Refusal, type EvidencePacket } from "@/contracts/generated/evidence_packet";
import { AG4VerifyInput, type GatewayCall } from "@/contracts/generated/gateway";
import { answerTrace } from "@/db/schema";
import { INPUT_SCHEMAS, type ChatTask } from "@/gateway/config";
import { utcDayStart } from "@/gateway/budget";
import type { AuditInput } from "@/lib/audit";
import {
  AS_BUILT_CAVEAT,
  COMPOSER_FAILED_REASON,
  NO_ENTAILED_CLAIM_REASON,
  PROVIDER_UNREACHABLE_REASON,
  SEARCH_MODE_GAP,
  droppedSentencesGap,
} from "@/lib/fixed-strings";
import { ROUTE_TEXT_NO_FUNCTION, classify, pack, protectiveRow, routingText } from "@/rulepack";
import { POST } from "./route";

// Blueprint 9.8, verbatim: the pin the packet's caveat is compared against, byte for byte.
const BLUEPRINT_9_8_CAVEAT =
  "Values are read from the cited document revision. Confirm them against the panel or the safety instrumented system before any action is taken. The Hub holds no as-built state.";

type Outcome = GatewayCall["outcome"];
type Reply = { outcome: Outcome; data?: unknown };
type Recorded = { task: ChatTask; envelope: Record<string, unknown>; at: number };

const gw = vi.hoisted(() => ({ invoke: vi.fn(), embed: vi.fn(), budgetStatus: vi.fn() }));
const audit = vi.hoisted(() => ({ writeAudit: vi.fn(), activeCorpusVersion: vi.fn() }));
const lane = vi.hoisted(() => ({
  resolveScope: vi.fn(),
  retrieve: vi.fn(),
  typedFacts: vi.fn(),
  findSeeded: vi.fn(),
  refusalFor: vi.fn(),
  clusterFor: vi.fn(),
  procedureFor: vi.fn(),
}));

vi.mock("@/gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/gateway")>()),
  invoke: gw.invoke,
  embed: gw.embed,
  budgetStatus: gw.budgetStatus,
}));
vi.mock("@/lib/audit", () => ({ writeAudit: audit.writeAudit, activeCorpusVersion: audit.activeCorpusVersion }));
vi.mock("@/auth/session", () => ({ getSession: vi.fn(async () => USER), LANDING_PATH: "/tour" }));
vi.mock("@/auth/sandbox", () => ({ getSandbox: vi.fn(async () => null), visibleVersionIds: vi.fn(async () => [CORPUS_VERSION.id]) }));
vi.mock("@/lib/ratelimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ratelimit")>()),
  limit: vi.fn(async (scope: string) => ({ allowed: true, count: 1, limit: scope === "addr" ? 120 : 30, resets_at: new Date() })),
}));
vi.mock("@/answer/scope", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/answer/scope")>()), resolveScope: lane.resolveScope }));
vi.mock("@/answer/retrieve", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/answer/retrieve")>()), retrieve: lane.retrieve }));
vi.mock("@/answer/templates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/answer/templates")>()), typedFacts: lane.typedFacts }));
vi.mock("@/answer/seeded", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/answer/seeded")>()), findSeeded: lane.findSeeded }));
vi.mock("@/answer/outcome", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/answer/outcome")>()),
  refusalFor: lane.refusalFor,
  clusterFor: lane.clusterFor,
  procedureFor: lane.procedureFor,
}));

let recorded: Recorded[];
let events: string[];

/** The mocked gateway: replies per task in order, the real envelope check, a 2 ms wait so every timestamp is later than decided_at. */
function script(replies: { "AG-2"?: Reply[]; "AG-4"?: Reply[] }) {
  const queues: Record<"AG-2" | "AG-4", Reply[]> = { "AG-2": [...(replies["AG-2"] ?? [])], "AG-4": [...(replies["AG-4"] ?? [])] };
  gw.invoke.mockImplementation(async (task: ChatTask, envelope: Record<string, unknown>, outputSchema: z.ZodType<unknown>) => {
    if (task !== "AG-2" && task !== "AG-4") throw new Error(`unexpected gateway task ${task}`);
    INPUT_SCHEMAS[task].parse(envelope);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const reply = queues[task].shift();
    if (reply === undefined) throw new Error(`no scripted reply left for ${task}`);
    recorded.push({ task, envelope: structuredClone(envelope), at: Date.now() });
    events.push(`gateway:${task}`);
    const data = reply.outcome === "ok" ? outputSchema.parse(reply.data) : null;
    return { outcome: reply.outcome, data, call: gatewayCall(task, reply.outcome) };
  });
}

function ask(body: unknown, requestId = TRACE_ID): NextRequest {
  return new NextRequest("http://localhost/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId, "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify(body),
  });
}

async function stream(body: unknown) {
  const response = await POST(ask(body), undefined);
  expect(response.status).toBe(200);
  const lines = (await readLines(response)).map((line) => AskStream.parse(line));
  return { response, lines };
}

function packetOf(lines: AskStream[]): EvidencePacket {
  const line = lines.find((l) => l.stage === "packet");
  if (line === undefined || line.stage !== "packet") throw new Error("no packet line");
  return line.packet;
}

function evidenceLineOf(lines: AskStream[]) {
  const line = lines[0];
  if (line === undefined || line.stage !== "evidence") throw new Error("line 1 is not the evidence line");
  return line;
}

/** The one answer_trace insert the lane wrote, as the row Drizzle received. */
function insertedTrace(): typeof answerTrace.$inferInsert {
  const inserts = statements.filter((s) => s[0]?.method === "insert" && s[0]?.args[0] === answerTrace);
  expect(inserts, "exactly one answer_trace insert").toHaveLength(1);
  return argOf(inserts[0] ?? [], "values") as typeof answerTrace.$inferInsert;
}

function audits(): AuditInput[] {
  return audit.writeAudit.mock.calls.map((call) => call[0] as AuditInput);
}

function calls(task: ChatTask): Recorded[] {
  return recorded.filter((r) => r.task === task);
}

const REPLY_OK = { "AG-2": [{ outcome: "ok", data: composerReply }], "AG-4": [{ outcome: "ok", data: entailedReply("s") }] } satisfies Record<string, Reply[]>;

beforeEach(() => {
  resetFakeDb();
  setRequest();
  recorded = [];
  events = [];
  const original = AskStream.parse.bind(AskStream);
  vi.spyOn(AskStream, "parse").mockImplementation((input, params) => {
    const stage = (input as { stage?: unknown }).stage;
    events.push(`line:${String(stage)}`);
    return original(input, params);
  });
  gw.embed.mockResolvedValue([[0.1, 0.2, 0.3]]);
  gw.budgetStatus.mockImplementation(async (task: ChatTask) => ({
    role: task,
    day: "2026-09-06",
    tokens_used: 0,
    tokens_per_day: 3_000_000,
    spend_idr: 0,
    spend_cap_idr_per_day: 20_000,
    exhausted: false,
  }));
  audit.activeCorpusVersion.mockResolvedValue({ ...CORPUS_VERSION });
  audit.writeAudit.mockImplementation(async (input: AuditInput) => input.id ?? "audit-id");
  lane.resolveScope.mockResolvedValue(structuredClone(scope));
  lane.retrieve.mockResolvedValue(retrievalOf());
  lane.typedFacts.mockResolvedValue({ typed_facts: structuredClone(typedFacts), blocks: [], procedure: null, contradictions: [] });
  lane.findSeeded.mockResolvedValue(null);
  lane.clusterFor.mockResolvedValue({ id: "cluster-syn-ga-1201a", request_action: true });
  lane.procedureFor.mockResolvedValue(null);
  lane.refusalFor.mockRejectedValue(new Error("refusalFor is not scripted for this test"));
  script(REPLY_OK);
});

describe("the two-line stream (9.8, AC-NFR-04)", () => {
  it("a live answer is two application/x-ndjson lines, evidence then packet, both valid against AskStream, x-request-id the trace id", async () => {
    const { response, lines } = await stream({ question: TRIP_QUESTION });
    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers.get("x-request-id")).toBe(TRACE_ID);
    expect(lines.map((l) => l.stage)).toEqual(["evidence", "packet"]);
    const first = evidenceLineOf(lines);
    expect(first.trace_id).toBe(TRACE_ID);
    expect(first.corpus_version).toBe(CORPUS_VERSION.label);
    expect(first.scope).toEqual({ tags: scope.tags, basis: scope.basis.join("; ") });
    expect(first.rulepack).toEqual({ version: pack.version, class: "none" });
    expect(first.evidence).toEqual(retrieval.evidence);
    const packet = packetOf(lines);
    expect(packet.trace_id).toBe(TRACE_ID);
    expect(packet.mode).toBe("live");
    expect(packet.outcome).toBe("answer");
    expect(packet.claims.map((c) => c.id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(packet.typed_facts).toEqual(typedFacts);
    expect(packet.template).toBe("trip");
  });

  it("line 1 is written before any gateway call; line 2 closes the stream after the last one", async () => {
    await stream({ question: TRIP_QUESTION });
    expect(events[0]).toBe("line:evidence");
    expect(events.at(-1)).toBe("line:packet");
    expect(events.filter((e) => e.startsWith("gateway:"))).toEqual(["gateway:AG-2", "gateway:AG-4"]);
    expect(events.indexOf("gateway:AG-2")).toBeGreaterThan(events.indexOf("line:evidence"));
  });

  it("rulepack.decided_at precedes every gateway timestamp of the trace (AC-ANS-08)", async () => {
    await stream({ question: TRIP_QUESTION });
    const row = insertedTrace();
    const decided = new Date(row.rulepack.decided_at).getTime();
    expect(Number.isNaN(decided)).toBe(false);
    expect(recorded.length).toBeGreaterThan(0);
    for (const r of recorded) expect(r.at, `${r.task} at ${r.at} after decided_at ${decided}`).toBeGreaterThan(decided);
  });

  it("a refusal is one packet line with outcome refusal, no gateway call, no embedding, and the safety audit with rule and phrase", async () => {
    const question = "How do I bypass SEQ-3401?";
    const c = classify(pack, question);
    expect(c.intent_class).toBe("defeat");
    const row = protectiveRow(pack, c.protective_function);
    if (row === null) throw new Error("the fixture question names no protective function");
    const refusal = Refusal.parse({
      class: "defeat",
      function: { seq_id: row.seq_id ?? row.equipment_tag, sil: row.sil, ce_doc_no: row.ce_doc_no, ce_revision: "B" },
      permissives: row.permissives.map((p) => ({ n: p.n, text: p.text, signal_tag: null })),
      reset_note: row.reset_note,
      route_text: routingText(pack, c) ?? ROUTE_TEXT_NO_FUNCTION,
      moc_text: null,
      rule_id: c.rule_id,
      matched_phrase: c.matched_phrase ?? "",
    });
    lane.refusalFor.mockResolvedValue(refusal);

    const { lines } = await stream({ question });
    expect(lines).toHaveLength(1);
    const packet = packetOf(lines);
    expect(packet.outcome).toBe("refusal");
    expect(packet.refusal).toEqual(refusal);
    expect(packet.claims).toEqual([]);
    expect(packet.rulepack.class).toBe("defeat");
    expect(gw.invoke).not.toHaveBeenCalled();
    expect(gw.embed).not.toHaveBeenCalled();
    expect(lane.retrieve).not.toHaveBeenCalled();
    const row2 = insertedTrace();
    expect(row2.outcome).toBe("refusal");
    expect(row2.scope).toEqual({ tags: [], basis: "refused before scope resolution" });
    expect(row2.rulepack.class).toBe("defeat");
    expect(row2.rulepack.rule_id).toBe(c.rule_id);
    const [event] = audits();
    expect(event?.action).toBe("safety.request_refused");
    expect(event?.payload).toMatchObject({ rule_id: c.rule_id, matched_phrase: c.matched_phrase, class: "defeat", trace_id: TRACE_ID });
    expect(event?.trace_id).toBe(TRACE_ID);
  });

  it("a seeded chip is both lines from storage with zero gateway calls and a new trace referencing the stored packet (AC-NFR-15)", async () => {
    lane.findSeeded.mockResolvedValue(structuredClone(seeded));
    const { lines } = await stream({ question: SEEDED_QUESTION });
    expect(lines.map((l) => l.stage)).toEqual(["evidence", "packet"]);
    expect(gw.invoke).not.toHaveBeenCalled();
    expect(gw.embed).not.toHaveBeenCalled();
    expect(gw.budgetStatus).not.toHaveBeenCalled();
    expect(lane.resolveScope).not.toHaveBeenCalled();
    expect(lane.retrieve).not.toHaveBeenCalled();
    const first = evidenceLineOf(lines);
    expect(first.trace_id).toBe(TRACE_ID);
    expect(first.evidence).toEqual(evidenceOf(seededPacket));
    expect(first.scope).toEqual(seeded.trace.scope);
    const packet = packetOf(lines);
    expect(packet).toEqual(seededPacket);
    expect(packet.mode).toBe("seeded");
    const row = insertedTrace();
    expect(row.id).toBe(TRACE_ID);
    expect(row.question).toBe(SEEDED_QUESTION);
    expect(row.userAlias).toBe(USER.alias);
    expect(row.packet).toEqual(seededPacket);
    expect(row.retrievedChunkIds).toEqual(seeded.trace.retrieved_chunk_ids);
    expect(row.gateResults).toEqual(seeded.trace.gate_results);
    expect(row.corpusVersionId).toBe(CORPUS_VERSION.id);
    const [event] = audits();
    expect(event?.action).toBe("answer.issued");
    expect(event?.payload).toMatchObject({ gate_outcome: "seeded", mode: "seeded", trace_id: TRACE_ID });
  });

  it("mode search streams line 1 and a partial packet with the fixed search-mode gap and no gateway or budget call", async () => {
    const { lines } = await stream({ question: TRIP_QUESTION, mode: "search" });
    expect(lines.map((l) => l.stage)).toEqual(["evidence", "packet"]);
    const packet = packetOf(lines);
    expect(packet.outcome).toBe("partial");
    expect(packet.claims).toEqual([]);
    expect(packet.gaps_declared).toEqual([SEARCH_MODE_GAP]);
    expect(evidenceLineOf(lines).evidence).toEqual(retrieval.evidence);
    expect(gw.invoke).not.toHaveBeenCalled();
    expect(gw.budgetStatus).not.toHaveBeenCalled();
    expect(gw.embed).toHaveBeenCalledTimes(1);
    const row = insertedTrace();
    expect(row.outcome).toBe("partial");
    expect(row.prompts).toEqual([]);
    expect(row.modelIds).toEqual({});
  });

  it("an invalid body is the designed 400 with the request id, before any work", async () => {
    const response = await POST(ask({ question: "" }), undefined);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body", request_id: TRACE_ID });
    expect(lane.findSeeded).not.toHaveBeenCalled();
    expect(gw.invoke).not.toHaveBeenCalled();
  });
});

describe("bounded repair (AC-ANS-19)", () => {
  it("a clean pass is one composer call and one verifier call, repair_rounds 0, and no call after it", async () => {
    const { lines } = await stream({ question: TRIP_QUESTION });
    expect(calls("AG-2")).toHaveLength(1);
    expect(calls("AG-4")).toHaveLength(1);
    expect(packetOf(lines).outcome).toBe("answer");
    const row = insertedTrace();
    expect(row.repairRounds).toBe(0);
    expect(row.modelIds).toMatchObject({ gateway_calls: "2" });
    expect(row.verifierVerdicts).toEqual(entailedReply("s").verdicts);
    expect(Object.values(row.gateResults).every((g) => g.pass)).toBe(true);
    expect(calls("AG-2")[0]?.envelope.repair).toBeNull();
  });

  it("a C6 drop starts exactly one repair carrying the verdicts of the dropped sentences; a second failure is a partial, never a third call", async () => {
    script({
      "AG-2": [
        { outcome: "ok", data: composerReply },
        { outcome: "ok", data: composerReply },
      ],
      "AG-4": [
        { outcome: "ok", data: replyWithNotEntailed(["s2"], "s") },
        { outcome: "ok", data: replyWithNotEntailed(["r2"], "r") },
      ],
    });
    const { lines } = await stream({ question: TRIP_QUESTION });
    expect(calls("AG-2")).toHaveLength(2);
    expect(calls("AG-4")).toHaveLength(2);
    const repair = calls("AG-2")[1]?.envelope.repair;
    expect(repair).toEqual({ verdicts: [{ sentence_id: "s2", verdict: "not_entailed", span_id: null, reason: "The span does not state the value." }] });
    const packet = packetOf(lines);
    expect(packet.outcome).toBe("partial");
    expect(packet.claims.map((c) => c.id)).toEqual(["r1", "r3", "r4", "r5"]);
    expect(packet.gaps_declared).toEqual([droppedSentencesGap(1)]);
    expect(packet.abstention?.reason).toBe(droppedSentencesGap(1));
    const row = insertedTrace();
    expect(row.repairRounds).toBe(1);
    expect(row.verifierVerdicts).toHaveLength(10);
    expect(row.gateResults.C6).toEqual({ pass: false, detail: expect.stringContaining("r2: not_entailed") });
    expect(row.modelIds).toMatchObject({ gateway_calls: "4" });
  });

  it("a parse failure on the first composer call is retried once; a C6 drop after that cannot start a repair because two calls is the ceiling", async () => {
    script({
      "AG-2": [{ outcome: "parse_failed" }, { outcome: "ok", data: composerReply }],
      "AG-4": [{ outcome: "ok", data: replyWithNotEntailed(["s1"], "s") }],
    });
    const { lines } = await stream({ question: TRIP_QUESTION });
    expect(calls("AG-2")).toHaveLength(2);
    expect(calls("AG-4")).toHaveLength(1);
    const packet = packetOf(lines);
    expect(packet.outcome).toBe("partial");
    expect(packet.claims.map((c) => c.id)).toEqual(["s2", "s3", "s4", "s5"]);
    expect(packet.gaps_declared).toEqual([droppedSentencesGap(1)]);
    expect(insertedTrace().repairRounds).toBe(0);
  });

  it("two parse failures from the composer end in the composer-failed abstention with no verifier call and no third composer call", async () => {
    script({ "AG-2": [{ outcome: "parse_failed" }, { outcome: "parse_failed" }] });
    const { lines } = await stream({ question: TRIP_QUESTION });
    expect(calls("AG-2")).toHaveLength(2);
    expect(calls("AG-4")).toHaveLength(0);
    const packet = packetOf(lines);
    expect(packet.outcome).toBe("abstention");
    expect(packet.abstention?.reason).toBe(COMPOSER_FAILED_REASON);
    expect(packet.claims).toEqual([]);
    const row = insertedTrace();
    expect(row.modelIds).toMatchObject({ gateway_calls: "2" });
    expect(Object.values(row.gateResults).map((g) => g.detail)).toEqual(Array<string>(6).fill("not run"));
  });

  it("whatever the replies, the composer is never called more than twice per question", async () => {
    script({
      "AG-2": [
        { outcome: "ok", data: composerReply },
        { outcome: "ok", data: composerReply },
        { outcome: "ok", data: composerReply },
      ],
      "AG-4": [{ outcome: "parse_failed" }, { outcome: "parse_failed" }, { outcome: "parse_failed" }],
    });
    await stream({ question: TRIP_QUESTION });
    expect(calls("AG-2").length).toBeLessThanOrEqual(2);
    expect(calls("AG-4").length).toBeLessThanOrEqual(2);
  });
});

describe("the verifier is question-blind (blueprint section 1 invariant 4, 9.16; AC-ANS-18, AC-LOOP-06)", () => {
  it("the recorded AG-4 envelope is exactly { pairs } and never contains the question", async () => {
    await stream({ question: TRIP_QUESTION });
    const [request] = calls("AG-4");
    if (request === undefined) throw new Error("no verifier call recorded");
    const json = JSON.stringify(request.envelope);
    expect(json).not.toContain(TRIP_QUESTION);
    expect(json).not.toContain("February");
    expect(Object.keys(request.envelope)).toEqual(["pairs"]);
    const parsed = AG4VerifyInput.parse(request.envelope);
    const claimTexts = new Set(composerReply.claims.map((c) => c.text));
    const chunkTexts = new Set(chunks.map((c) => c.text));
    expect(parsed.pairs.map((p) => p.sentence_id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    for (const pair of parsed.pairs) {
      expect(claimTexts.has(pair.sentence)).toBe(true);
      expect(pair.sentence).not.toBe(TRIP_QUESTION);
      expect(pair.spans.length).toBeGreaterThan(0);
      for (const s of pair.spans) expect(chunkTexts.has(s.text)).toBe(true);
    }
  });

  it("the composer envelope carries the question; the verifier envelope on the repair round still does not", async () => {
    script({
      "AG-2": [
        { outcome: "ok", data: composerReply },
        { outcome: "ok", data: composerReply },
      ],
      "AG-4": [
        { outcome: "ok", data: replyWithNotEntailed(["s3"], "s") },
        { outcome: "ok", data: entailedReply("r") },
      ],
    });
    await stream({ question: TRIP_QUESTION });
    for (const c of calls("AG-2")) expect(c.envelope.question).toBe(TRIP_QUESTION);
    expect(calls("AG-4")).toHaveLength(2);
    for (const v of calls("AG-4")) expect(JSON.stringify(v.envelope)).not.toContain(TRIP_QUESTION);
  });
});

describe("C6 on a verifier parse failure", () => {
  it("drops every sentence: nothing kept, every verdict not_entailed, C6 failed, and the abstention shape of 9.8", async () => {
    script({
      "AG-2": [
        { outcome: "ok", data: composerReply },
        { outcome: "ok", data: composerReply },
      ],
      "AG-4": [{ outcome: "parse_failed" }, { outcome: "parse_failed" }],
    });
    const { lines } = await stream({ question: TRIP_QUESTION });
    const packet = packetOf(lines);
    expect(packet.outcome).toBe("abstention");
    expect(packet.claims).toEqual([]);
    expect(packet.abstention?.reason).toBe(NO_ENTAILED_CLAIM_REASON);
    expect(packet.abstention?.nearest_documents).toHaveLength(3);
    expect(Abstention.shape.escalation_role.options).toContain(packet.abstention?.escalation_role);
    expect(packet.abstention?.served_beside).toEqual(typedFacts);
    expect(packet.abstention?.cluster).toEqual({ id: "cluster-syn-ga-1201a", request_action: true });
    const row = insertedTrace();
    expect(row.verifierVerdicts).toHaveLength(10);
    for (const v of row.verifierVerdicts) {
      expect(v.verdict).toBe("not_entailed");
      expect(v.reason).toContain("parse_failed");
    }
    expect(row.gateResults.C6.pass).toBe(false);
    for (const check of ["C1", "C2", "C3", "C4", "C5"] as const) expect(row.gateResults[check].pass).toBe(true);
    expect(row.repairRounds).toBe(1);
    expect(audits()[0]?.action).toBe("answer.abstained");
  });
});

describe("fault injection (AC-NFR-19, blueprint 6.3)", () => {
  it.each<[string, Outcome]>([
    ["a provider timeout", "timeout"],
    ["a 5xx (provider_error)", "provider_error"],
    ["a budget exhausted at the gateway", "budget_exhausted"],
  ])("%s on the composer renders the provider-unreachable abstention with the evidence listed and the outcome traced", async (_name, outcome) => {
    script({ "AG-2": [{ outcome }] });
    const { lines } = await stream({ question: TRIP_QUESTION });
    expect(evidenceLineOf(lines).evidence).toEqual(retrieval.evidence);
    const packet = packetOf(lines);
    expect(packet.outcome).toBe("abstention");
    expect(packet.abstention?.reason).toBe(PROVIDER_UNREACHABLE_REASON);
    expect(packet.typed_facts).toEqual(typedFacts);
    expect(calls("AG-2")).toHaveLength(1);
    expect(calls("AG-4")).toHaveLength(0);
    const row = insertedTrace();
    expect(row.outcome).toBe("abstention");
    expect(row.modelIds).toMatchObject({ gateway_calls: "1" });
    expect(row.prompts.map((p) => p.role)).toEqual(["AG-2"]);
    expect(row.gateResults.C6.detail).toBe("not run");
    const [event] = audits();
    expect(event?.action).toBe("answer.abstained");
    expect(event?.payload?.gate_outcome).toContain("provider unreachable");
  });

  it("a verifier timeout keeps no sentence, starts no repair and renders provider unreachable", async () => {
    script({ "AG-2": [{ outcome: "ok", data: composerReply }], "AG-4": [{ outcome: "timeout" }] });
    const { lines } = await stream({ question: TRIP_QUESTION });
    const packet = packetOf(lines);
    expect(packet.outcome).toBe("abstention");
    expect(packet.abstention?.reason).toBe(PROVIDER_UNREACHABLE_REASON);
    expect(calls("AG-2")).toHaveLength(1);
    expect(calls("AG-4")).toHaveLength(1);
    const row = insertedTrace();
    expect(row.repairRounds).toBe(0);
    expect(row.verifierVerdicts).toHaveLength(5);
    for (const v of row.verifierVerdicts) expect([v.verdict, v.reason]).toEqual(["not_entailed", expect.stringContaining("timeout")]);
    expect(row.gateResults.C6.pass).toBe(false);
  });

  it("malformed JSON from the composer on both calls is the composer-failed abstention, with the outcome traced", async () => {
    script({ "AG-2": [{ outcome: "parse_failed" }, { outcome: "parse_failed" }] });
    const { lines } = await stream({ question: TRIP_QUESTION });
    expect(packetOf(lines).abstention?.reason).toBe(COMPOSER_FAILED_REASON);
    expect(insertedTrace().modelIds).toMatchObject({ gateway_calls: "2" });
  });

  it("a spent daily budget before a live question is the designed 429 naming the role, the budget and the reset; the seeded path is untouched", async () => {
    gw.budgetStatus.mockImplementation(async (task: ChatTask) => ({
      role: task,
      day: "2026-09-06",
      tokens_used: 3_000_000,
      tokens_per_day: 3_000_000,
      spend_idr: 0,
      spend_cap_idr_per_day: 20_000,
      exhausted: true,
    }));
    const response = await POST(ask({ question: TRIP_QUESTION }), undefined);
    expect(response.status).toBe(429);
    expect(response.headers.get("x-request-id")).toBe(TRACE_ID);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      error: "budget_exhausted",
      request_id: TRACE_ID,
      role: "AG-2",
      budget: { tokens_per_day: 3_000_000, spend_cap_idr_per_day: 20_000 },
      resets_at: new Date(utcDayStart().getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(gw.invoke).not.toHaveBeenCalled();
    expect(statements.filter((s) => s[0]?.method === "insert")).toHaveLength(0);

    lane.findSeeded.mockResolvedValue(structuredClone(seeded));
    const { lines } = await stream({ question: SEEDED_QUESTION });
    expect(lines.map((l) => l.stage)).toEqual(["evidence", "packet"]);
    expect(packetOf(lines).mode).toBe("seeded");
    expect(gw.invoke).not.toHaveBeenCalled();
  });
});

describe("the packet (9.8)", () => {
  it("every protective-function answer ends with the fixed as-built caveat, byte-identical to blueprint 9.8", async () => {
    const { lines } = await stream({ question: TRIP_QUESTION });
    expect(packetOf(lines).caveat).toBe(BLUEPRINT_9_8_CAVEAT);
    expect(AS_BUILT_CAVEAT).toBe(BLUEPRINT_9_8_CAVEAT);
    expect(Buffer.from(AS_BUILT_CAVEAT, "utf8").equals(Buffer.from(BLUEPRINT_9_8_CAVEAT, "utf8"))).toBe(true);
  });

  it("an abstention carries exactly three nearest same-asset documents where three exist, the escalation role from the fixed set, and the typed facts beside it", async () => {
    script({ "AG-2": [{ outcome: "ok", data: { claims: [], gaps: [], suggested_outcome: "abstention" } }] });
    const { lines } = await stream({ question: TRIP_QUESTION });
    const packet = packetOf(lines);
    expect(packet.outcome).toBe("abstention");
    expect(calls("AG-4")).toHaveLength(0);
    const abstention = packet.abstention;
    if (abstention === null) throw new Error("no abstention on the packet");
    expect(abstention.nearest_documents).toHaveLength(3);
    expect(new Set(abstention.nearest_documents.map((c) => c.document_id)).size).toBe(3);
    expect(abstention.nearest_documents.map((c) => c.document_id)).toEqual([...new Set(retrieval.evidence.map((c) => c.document_id))].slice(0, 3));
    expect(Abstention.shape.escalation_role.options).toContain(abstention.escalation_role);
    expect(abstention.escalation_role).toBe("On-call Instrument and Control engineer");
    expect(abstention.served_beside).toEqual(typedFacts);
    expect(abstention.reason).toBe(NO_ENTAILED_CLAIM_REASON);
  });

  it("where fewer than three documents exist, the abstention lists what exists and never pads", async () => {
    lane.retrieve.mockResolvedValue(retrievalOf(chunks.slice(0, 3)));
    script({ "AG-2": [{ outcome: "ok", data: { claims: [], gaps: [], suggested_outcome: "abstention" } }] });
    const { lines } = await stream({ question: TRIP_QUESTION });
    const nearest = packetOf(lines).abstention?.nearest_documents ?? [];
    expect(nearest.map((c) => c.document_id)).toEqual(["doc-syn-ds-ga-1201a", "doc-syn-il-ga-1201a"]);
  });

  it("the audit event of an answer carries ids, route, alias, version, class, gate outcome and band, never the question or a span", async () => {
    await stream({ question: TRIP_QUESTION });
    const [event] = audits();
    if (event === undefined) throw new Error("no audit event");
    expect(event.action).toBe("answer.issued");
    expect(event.entity_id).toBe(TRACE_ID);
    expect(event.route).toBe("/api/ask");
    expect(event.payload).toMatchObject({ trace_id: TRACE_ID, role_alias: USER.alias, corpus_version: CORPUS_VERSION.id, band: expect.any(String), mode: "live" });
    const json = JSON.stringify(event);
    expect(json).not.toContain(TRIP_QUESTION);
    for (const c of chunks) expect(json).not.toContain(c.text);
  });
});
