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

- The pin, `bundle/embedding_pin.json` (the public part of the bundle, written by `harness/embed.py --pin` as `packages/embedding_pin.json`), recorded 2026-09-05: model `Xenova/multilingual-e5-small`, dim 384, pooling mean, normalize true, query prefix `query: `, passage prefix `passage: `; files:
  - `onnx/model_quantized.onnx`, sha256 `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`, 118,308,185 bytes
  - `tokenizer.json`, sha256 `0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39`, 17,082,730 bytes
  - `tokenizer_config.json`, sha256 `a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b`, 443 bytes
- The string the seed writes to `corpus_version.embedding_model`: `Xenova/multilingual-e5-small/onnx/model_quantized.onnx sha256:f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`, with `embedding_dim = 384` (equal to `EMBEDDING_DIM` in `src/db/embedding.ts` and the `chunk.embedding` column; asserted by AC-ING-10 and AC-ING-13). The v1 seed row's values are appended here by the main thread when the seed lands.
- Node runtime (`src/gateway/embedding.ts`): `@huggingface/transformers` 4.2.0 with `onnxruntime-node` 1.24.3 (pnpm-lock.yaml), `env.allowRemoteModels = false`, `env.localModelPath = models/`, `dtype: "q8"` (loads `onnx/model_quantized.onnx`), one intra-op and one inter-op thread, each text embedded alone, mean pooling over the attention mask, L2 normalisation, six decimals, a text over 512 tokens refused; the same steps as the Python lane (`harness/embed.py`). The model configuration is the published `config.json` of the pinned repository, held in the loader, so only the three pinned files are on disk. `pnpm models:fetch` (`scripts/models/fetch.ts`) downloads them from huggingface.co at build time and verifies each SHA-256 and byte count against the pin, deleting and failing on a mismatch; the runtime verifies the three files again on first load and fails closed.

## Status

Accepted 2026-09-03
