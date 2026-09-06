// Family: chunks.jsonl (blueprint 9.2 Chunk), a seed-time artefact (D-17): text, quote hash and the 384-dim
// vector of the pinned local model; text_tsv is a generated column and is never written. Absent under
// --public-only, in which case nothing is written and the retrieval index stays as it was.
import type { Tx } from "@/db/client";
import { chunk } from "@/db/schema";
import type { Bundle } from "@/gates/g1";
import { upsert, type FamilyResult } from "./upsert";

// 384 floats per row is about 8 KB of parameters; 50 rows keep a statement under half a megabyte.
const CHUNK_BATCH = 50;

export async function seedChunks(tx: Tx, b: Bundle): Promise<FamilyResult> {
  if (b.chunks === null) return { rows: { chunk: 0 }, notes: ["chunks.jsonl absent (public release): no chunk written"] };
  const n = await upsert(
    tx,
    chunk,
    b.chunks.map((c) => ({
      id: c.id,
      documentRevisionId: c.document_revision_id,
      page: c.page,
      ordinal: c.ordinal,
      unitKind: c.unit_kind,
      text: c.text,
      quoteHash: c.quote_hash,
      embedding: c.embedding,
    })),
    [chunk.id],
    { batch: CHUNK_BATCH },
  );
  return { rows: { chunk: n } };
}
