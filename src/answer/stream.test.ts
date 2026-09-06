// The two-line application/x-ndjson stream (blueprint 9.8, 9.9; ARCHITECTURE 7 steps 7 and 14; AC-NFR-04): lines
// are flushed in the order the producer writes them, each parsed against the AskStream contract before it leaves,
// the status and headers are committed with line 1, and a failure inside the producer is logged and closes the
// stream, never written as a raw error line.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AskStream } from "@/contracts/generated/evidence_packet";
import { readLines, retrieval, seededPacket } from "../../tests/fixtures/answer";
import { NDJSON_CONTENT_TYPE, ndjsonResponse } from "./stream";

const logs = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock("@/lib/log", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/log")>()), logError: logs.logError }));

const evidenceLine: AskStream = {
  stage: "evidence",
  trace_id: "trace-stream-1",
  corpus_version: "v1",
  scope: { tags: ["GA-1201A"], basis: "equipment tag GA-1201A named in the question" },
  rulepack: { version: "1", class: "none" },
  evidence: retrieval.evidence,
};
const packetLine: AskStream = { stage: "packet", packet: seededPacket };

beforeEach(() => {
  logs.logError.mockReset();
});

describe("ndjsonResponse", () => {
  it("streams the lines in producer order, one JSON object per line, with the ndjson headers and the trace id", async () => {
    const response = ndjsonResponse("trace-stream-1", "/api/ask", async (emit) => {
      emit(evidenceLine);
      await Promise.resolve();
      emit(packetLine);
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(NDJSON_CONTENT_TYPE);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("x-request-id")).toBe("trace-stream-1");
    const raw = await response.clone().text();
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.split("\n").filter((l) => l.length > 0)).toHaveLength(2);
    const lines = await readLines(response);
    expect(lines.map((l) => AskStream.parse(l))).toEqual([evidenceLine, packetLine]);
  });

  it("line 1 is enqueued synchronously when the producer starts, before its first await", () => {
    let seen = 0;
    const original = AskStream.parse.bind(AskStream);
    vi.spyOn(AskStream, "parse").mockImplementation((input, params) => {
      seen += 1;
      return original(input, params);
    });
    ndjsonResponse("trace-stream-2", "/api/ask", async (emit) => {
      emit(evidenceLine);
      await new Promise((resolve) => setTimeout(resolve, 5));
      emit(packetLine);
    });
    expect(seen).toBe(1);
  });

  it("a line outside the 9.8 contract never leaves: the parse throws, the error is logged and the stream closes with what was written", async () => {
    const response = ndjsonResponse("trace-stream-3", "/api/ask", async (emit) => {
      emit(evidenceLine);
      emit({ stage: "packet", packet: { ...seededPacket, extra_field: true } } as unknown as AskStream);
      emit(packetLine);
    });
    const lines = await readLines(response);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.stage).toBe("evidence");
    expect(logs.logError).toHaveBeenCalledTimes(1);
    expect(logs.logError.mock.calls[0]?.[0]).toBe("trace-stream-3");
    expect(logs.logError.mock.calls[0]?.[1]).toBe("/api/ask");
  });

  it("a producer that throws after line 1 leaves a 200 with line 1 only and no error text in the body", async () => {
    const response = ndjsonResponse("trace-stream-4", "/api/ask", async (emit) => {
      emit(evidenceLine);
      throw new Error("secret detail that must stay in the log");
    });
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain("secret detail");
    expect(raw.split("\n").filter((l) => l.length > 0)).toHaveLength(1);
    expect(logs.logError).toHaveBeenCalledTimes(1);
  });
});
