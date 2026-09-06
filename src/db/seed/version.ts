// Family: the corpus version row (blueprint 9.7, ARCHITECTURE 2, AC-ING-10). One row: id and manifest digest from
// src/lib/version-id.ts (the manifest bytes as pulled), label v1, the corpus digest and extractor string from the
// manifest, the embedding pin as "<model>/<file> sha256:<hex>" with its dimension (ARCHITECTURE 6), the model pins
// of D-05 (glm-5.3-flash on every GLM role, local_embedding for the vectors), created by "seed". Inactive on
// insert and never re-activated by the upsert: activation is the separate, audited step of src/db/versions.ts, so
// a re-run cannot steal or clear activation state.
import { CorpusVersion } from "@/contracts/generated/serving";
import type { Tx } from "@/db/client";
import { corpusVersion } from "@/db/schema";
import type { Bundle } from "@/gates/g1";
import { readPin, type EmbeddingPin } from "@/gateway/pin";
import { seededVersionFromBundle } from "@/lib/version-id";
import { upsert, type FamilyResult } from "./upsert";

export const V1_LABEL = "v1";
export const SEED_ALIAS = "seed";
export const SEED_ROUTE = "pnpm db:seed";
const GLM_PIN = { provider: "zai", model_id: "glm-5.3-flash", prompt_version: null } as const; // D-05
const MODEL_FILE = "onnx/model_quantized.onnx"; // ARCHITECTURE 6 and 13 decision 9

/** "Xenova/multilingual-e5-small/onnx/model_quantized.onnx sha256:<hex>" (ARCHITECTURE 6). */
export function embeddingModelString(pin: EmbeddingPin): string {
  const file = pin.files.find((f) => f.path === MODEL_FILE);
  if (!file) throw new Error(`embedding pin lists no ${MODEL_FILE}`);
  return `${pin.model}/${file.path} sha256:${file.sha256}`;
}

// The 9.7 row for this bundle, validated by the generated Zod; the pin defaults to bundle/embedding_pin.json of
// the repository (the runtime embedder's pin), which the harness bundle does not carry.
export function versionRow(bundle: Bundle, pin: EmbeddingPin = readPin()): CorpusVersion {
  const seeded = seededVersionFromBundle(bundle.dir);
  if (seeded.manifest_sha256 !== bundle.manifestSha256) {
    throw new Error(`manifest digest differs between G1 (${bundle.manifestSha256.slice(0, 12)}) and the version id (${seeded.manifest_sha256.slice(0, 12)})`);
  }
  const embeddingModel = embeddingModelString(pin);
  return CorpusVersion.parse({
    id: seeded.id,
    label: V1_LABEL,
    is_active: false,
    manifest_sha256: seeded.manifest_sha256,
    corpus_sha256: bundle.manifest.corpus_sha256,
    extractor: bundle.manifest.extractor,
    embedding_model: embeddingModel,
    embedding_dim: pin.dim,
    model_pins: {
      "AG-1": GLM_PIN,
      "AG-2": GLM_PIN,
      "AG-3": GLM_PIN,
      "AG-4": GLM_PIN,
      embedding: { provider: "local_embedding", model_id: embeddingModel, prompt_version: null },
    },
    created_by_alias: SEED_ALIAS,
    created_at: new Date().toISOString(),
    activated_by_alias: null,
    activated_at: null,
    parent_version_id: null,
  });
}

export async function seedVersion(tx: Tx, v: CorpusVersion): Promise<FamilyResult> {
  const n = await upsert(
    tx,
    corpusVersion,
    [
      {
        id: v.id,
        label: v.label,
        isActive: v.is_active,
        manifestSha256: v.manifest_sha256,
        corpusSha256: v.corpus_sha256,
        extractor: v.extractor,
        embeddingModel: v.embedding_model,
        embeddingDim: v.embedding_dim,
        modelPins: v.model_pins,
        createdByAlias: v.created_by_alias,
        createdAt: new Date(v.created_at),
        activatedByAlias: v.activated_by_alias,
        activatedAt: v.activated_at === null ? null : new Date(v.activated_at),
        parentVersionId: v.parent_version_id,
      },
    ],
    [corpusVersion.id],
    { insertOnly: ["isActive", "createdAt", "activatedByAlias", "activatedAt", "parentVersionId"] },
  );
  return { rows: { corpus_version: n } };
}
