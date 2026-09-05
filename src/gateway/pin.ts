// The embedding pin (ADR-009, bundle/embedding_pin.json): the model name, the three files with their SHA-256 and
// byte counts, the dimension and the pooling convention. Read by the runtime loader (embedding.ts) and by the
// build-time fetch (scripts/models/fetch.ts); both fail closed on a file that does not match the pin.
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { EMBEDDING_DIM } from "@/db/embedding";
import { EMBEDDING_MODEL, MODELS_DIR } from "./config";

export const EMBEDDING_PIN_PATH = path.join(process.cwd(), "bundle", "embedding_pin.json");

export const EmbeddingPin = z
  .object({
    model: z.literal(EMBEDDING_MODEL),
    files: z
      .array(
        z
          .object({
            path: z.string().min(1),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            bytes: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1),
    dim: z.literal(EMBEDDING_DIM),
    pooling: z.literal("mean"),
    normalize: z.literal(true),
    query_prefix: z.string().min(1),
    passage_prefix: z.string().min(1),
  })
  .strict();
export type EmbeddingPin = z.infer<typeof EmbeddingPin>;

export function readPin(file: string = EMBEDDING_PIN_PATH): EmbeddingPin {
  return EmbeddingPin.parse(JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8")));
}

// models/<model>/<path>: the layout @huggingface/transformers resolves under env.localModelPath.
export function modelFilePath(relative: string): string {
  return path.join(MODELS_DIR, EMBEDDING_MODEL, relative);
}

export function fileSha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}
