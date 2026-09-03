# ADR-009 Embedding pin under the one-provider lock

## Context

The pin lives on the corpus version and a change is a full re-embed. No second API is allowed. Whether Z.ai's global endpoint served `embedding-3` was unknown at planning; the blueprint's decision had two branches. Verified on 2026-09-03: a live call to `embedding-3` on api.z.ai returns "Unknown Model". The second branch applies.

## Decision

No hosted embedding API is used. The embedding role is one open-weights multilingual model pinned by file hash: `Xenova/multilingual-e5-small` (BERT architecture, 384 dimensions), the quantized ONNX file `onnx/model_quantized.onnx`, chosen for size and for English plus Indonesian query coverage. The identical file computes chunk embeddings in the Python build lane and query embeddings in the Node runtime through ONNX, so no third-party call exists on the retrieval path. The model name, dimension and file SHA-256 are written to `corpus_version.embedding_model` and `embedding_dim` at seed time and recorded below; the pgvector column dimension equals `embedding_dim` (384); the bundle manifest carries `embedding_model: null`, set on the corpus version at seed. Lexical retrieval is authoritative for tag matching.

## Alternatives

- Z.ai `embedding-3` at 1024 dimensions, the first branch: not served on the locked endpoint.
- Any other hosted embedding API: forbidden by the one-provider lock.

## Consequences

- The vector side is a ranking aid; a switch of pin is a new corpus version.
- The model file must fit the function size limit, and its cold start is measured on AC-NFR-04's validated instrument before it is accepted.

## Records

- Embedding model name, file SHA-256 and `embedding_dim` as written to `corpus_version` at seed: pending, recorded here when the seed lands.

## Status

Accepted 2026-09-03
