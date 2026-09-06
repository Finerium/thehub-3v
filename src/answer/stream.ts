// The two-line application/x-ndjson stream of POST /api/ask (blueprint 9.8, 9.9; ARCHITECTURE 7 steps 7 and 14;
// AC-NFR-04): line 1 { stage: "evidence", ... } is flushed before any provider call, line 2 { stage: "packet", ... }
// closes the stream; a refusal is one packet line; a seeded chip is both lines from storage. Every line is parsed
// against the AskStream contract before it is written (Zod at the boundary), so a field outside 9.8 never leaves.
// The response status is committed with line 1, so a failure after it is written into the packet by the lane,
// never as a raw error line; a failure that escapes the producer is logged and the stream is closed.
import { AskStream } from "@/contracts/generated/evidence_packet";
import { logError } from "@/lib/log";
import { REQUEST_ID_HEADER } from "@/lib/request-id";

export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export type Emit = (line: AskStream) => void;

/** The streamed response; `produce` receives `emit` and writes its lines in order, each flushed as it is written. */
export function ndjsonResponse(traceId: string, route: string, produce: (emit: Emit) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (line) => controller.enqueue(encoder.encode(`${JSON.stringify(AskStream.parse(line))}\n`));
      try {
        await produce(emit);
      } catch (error) {
        logError(traceId, route, error);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": NDJSON_CONTENT_TYPE,
      "cache-control": "private, no-store",
      "x-accel-buffering": "no",
      [REQUEST_ID_HEADER]: traceId,
    },
  });
}
