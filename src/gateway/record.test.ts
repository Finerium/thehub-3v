// Recorded replay (blueprint 9.16, ARCHITECTURE 9.4): the recording carries request_sha256 over the hydrated
// canonical envelope while the stored request is dehydrated so no corpus text is tracked (a text beside a span_id
// becomes { span_id, quote_hash }, beside a chunk_id { chunk_id, quote_hash }, any other string over the citation
// limit { quote_hash, chars }); responses are truncated to the citation limit; replay serves a recording whose hash,
// prompt version and model id all match and otherwise throws naming both sides. Files go to a temporary directory.
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Recording } from "@/contracts/generated/gateway";
import { canonicalJson, MODEL_ID, PROMPTS, sha256Hex } from "./config";
import { ReplayMismatchError } from "./errors";
import {
  canonicalText,
  CITATION_MAX_CHARS,
  dehydrate,
  quoteHash,
  record,
  recordDir,
  recordingsFor,
  recordMode,
  replay,
  truncateStrings,
} from "./record";

const LONG = "x".repeat(CITATION_MAX_CHARS + 1);
const SHORT = "x".repeat(CITATION_MAX_CHARS);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "thehub-recordings-"));
  process.env.RECORD_DIR = dir;
  delete process.env.RECORD_MODE;
});

afterEach(() => {
  delete process.env.RECORD_DIR;
  delete process.env.RECORD_MODE;
  rmSync(dir, { recursive: true, force: true });
});

describe("the canonical text and the quote hash", () => {
  it("NFKC, soft hyphens joined, whitespace collapsed, trimmed; the hash is over the utf8 canonical form", () => {
    expect(canonicalText("  Con­firm the ﬁt\n of  PSV-8901 ")).toBe("Confirm the fit of PSV-8901");
    expect(quoteHash("a  b")).toBe(sha256Hex(Buffer.from("a b", "utf8")));
    expect(quoteHash("a  b")).toBe(quoteHash("a b"));
  });
});

describe("dehydrate", () => {
  it("replaces a text beside a span_id or a chunk_id by its hash and keeps everything else", () => {
    const envelope = {
      question: "why?",
      evidence: [
        { span_id: "sp-1", text: "The pump tripped.", page: 3 },
        { chunk_id: "ch-1", text: "A chunk." },
      ],
      spans: [{ span_id: "sp-2", text: 7 }],
    };
    expect(dehydrate(envelope)).toEqual({
      question: "why?",
      evidence: [
        { span_id: "sp-1", text: { span_id: "sp-1", quote_hash: quoteHash("The pump tripped.") }, page: 3 },
        { chunk_id: "ch-1", text: { chunk_id: "ch-1", quote_hash: quoteHash("A chunk.") } },
      ],
      spans: [{ span_id: "sp-2", text: 7 }],
    });
  });

  it("replaces any other string over the citation limit by { quote_hash, chars } and keeps one at the limit", () => {
    expect(CITATION_MAX_CHARS).toBe(200);
    expect(dehydrate({ note: LONG, ok: SHORT, list: [LONG] })).toEqual({
      note: { quote_hash: quoteHash(LONG), chars: LONG.length },
      ok: SHORT,
      list: [{ quote_hash: quoteHash(LONG), chars: LONG.length }],
    });
    expect(dehydrate(null)).toBeNull();
  });
});

describe("truncateStrings", () => {
  it("cuts every string over the limit, at any depth", () => {
    expect(truncateStrings({ a: LONG, b: [LONG, SHORT], c: { d: LONG }, n: 1 })).toEqual({
      a: SHORT,
      b: [SHORT, SHORT],
      c: { d: SHORT },
      n: 1,
    });
  });
});

describe("recordMode and recordDir", () => {
  it("is off without RECORD_DIR, record with it, replay with RECORD_MODE=replay", () => {
    expect(recordMode()).toBe("record");
    expect(recordDir()).toBe(path.resolve(dir));
    process.env.RECORD_MODE = "replay";
    expect(recordMode()).toBe("replay");
    delete process.env.RECORD_DIR;
    expect(recordMode()).toBe("off");
    expect(() => recordDir()).toThrow("RECORD_DIR is not set");
  });
});

const ENVELOPE = { pairs: [{ sentence_id: "s1", sentence: "The pump tripped.", spans: [{ span_id: "sp-1", text: LONG }] }] };
const RESPONSE = { verdicts: [{ sentence_id: "s1", verdict: "entailed", span_id: "sp-1", reason: LONG }] };

describe("record", () => {
  it("writes recordings/<case>/<role>.json in the Recording shape, dehydrated and truncated, then <role>.2.json", () => {
    const requestSha256 = sha256Hex(canonicalJson(ENVELOPE));
    const first = record({ case_id: "case-r1", task: "AG-4", envelope: ENVELOPE, request_sha256: requestSha256, response: RESPONSE });
    expect(first).toBe(path.join(dir, "case-r1", "AG-4.json"));
    const recording = Recording.parse(JSON.parse(readFileSync(first, "utf8")));
    expect(recording).toMatchObject({ request_sha256: requestSha256, model_id: MODEL_ID, prompt_version: PROMPTS["AG-4"].version });
    expect(recording.request).toEqual({
      pairs: [{ sentence_id: "s1", sentence: "The pump tripped.", spans: [{ span_id: "sp-1", text: { span_id: "sp-1", quote_hash: quoteHash(LONG) } }] }],
    });
    expect(recording.response).toEqual({ verdicts: [{ sentence_id: "s1", verdict: "entailed", span_id: "sp-1", reason: SHORT }] });
    expect(readFileSync(first, "utf8")).not.toContain(LONG);
    expect(new Date(recording.recorded_at).toISOString()).toBe(recording.recorded_at);

    const second = record({ case_id: "case-r1", task: "AG-4", envelope: ENVELOPE, request_sha256: requestSha256, response: RESPONSE });
    expect(second).toBe(path.join(dir, "case-r1", "AG-4.2.json"));
    expect(recordingsFor("case-r1", "AG-4").map((r) => r.request_sha256)).toEqual([requestSha256, requestSha256]);
  });

  it("the redline task records under the role name AG-4 with its own prompt version", () => {
    const file = record({ case_id: "case-r2", task: "AG-4/redline", envelope: { draft: {} }, request_sha256: sha256Hex("{}"), response: { verdict: "pass" } });
    expect(path.basename(file)).toBe("AG-4.json");
    expect(recordingsFor("case-r2", "AG-4")[0].prompt_version).toBe(PROMPTS["AG-4/redline"].version);
  });
});

describe("replay", () => {
  it("serves the recorded response on a hash, prompt version and model id match", () => {
    record({ case_id: "case-p1", task: "AG-4", envelope: ENVELOPE, request_sha256: sha256Hex(canonicalJson(ENVELOPE)), response: RESPONSE });
    expect(replay("AG-4", ENVELOPE, "case-p1")).toEqual(truncateStrings(RESPONSE));
  });

  it("throws a ReplayMismatchError naming the recomputed and the recorded hashes on a different envelope", () => {
    const recorded = sha256Hex(canonicalJson(ENVELOPE));
    record({ case_id: "case-p2", task: "AG-4", envelope: ENVELOPE, request_sha256: recorded, response: RESPONSE });
    const other = { pairs: [] };
    const recomputed = sha256Hex(canonicalJson(other));
    let thrown: unknown;
    try {
      replay("AG-4", other, "case-p2");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ReplayMismatchError);
    const e = thrown as ReplayMismatchError;
    expect(e).toMatchObject({ case_id: "case-p2", role: "AG-4", recomputed_sha256: recomputed, recorded_sha256: [recorded] });
    expect(e.message).toContain(recomputed);
    expect(e.message).toContain(recorded);
    expect(e.message).toContain(PROMPTS["AG-4"].version);
  });

  it("does not serve a recording made under another prompt version, and names 'no recording' for an unknown case", () => {
    const requestSha256 = sha256Hex(canonicalJson(ENVELOPE));
    mkdirSync(path.join(dir, "case-p3"), { recursive: true });
    writeFileSync(
      path.join(dir, "case-p3", "AG-4.json"),
      JSON.stringify({ request_sha256: requestSha256, request: {}, response: RESPONSE, model_id: MODEL_ID, prompt_version: "0".repeat(64), recorded_at: "2026-09-05T00:00:00.000Z" }),
    );
    expect(() => replay("AG-4", ENVELOPE, "case-p3")).toThrow(/prompt_version 0{64}/);
    expect(recordingsFor("case-none", "AG-4")).toEqual([]);
    expect(() => replay("AG-4", ENVELOPE, "case-none")).toThrow(/recorded no recording$/);
  });
});
