// `pnpm models:fetch` (CI and the Vercel build step): downloads the pinned files of bundle/embedding_pin.json from
// huggingface.co into models/<model>/, verifies each SHA-256 and byte count against the pin, deletes and fails on a
// mismatch, and skips a file already present and valid. A build-time fetch of a pinned open model under a hash check
// is not a provider call (ADR-009); the runtime never downloads (src/gateway/embedding.ts disables remote models).
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, statSync, unlinkSync, renameSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { finished } from "node:stream/promises";
import { EMBEDDING_MODEL } from "../../src/gateway/config";
import { fileSha256, modelFilePath, readPin, type EmbeddingPin } from "../../src/gateway/pin";

const HUB_BASE = "https://huggingface.co";

type PinnedFile = EmbeddingPin["files"][number];

async function presentAndValid(file: string, want: PinnedFile): Promise<boolean> {
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return false;
  }
  if (size !== want.bytes) return false;
  return (await fileSha256(file)) === want.sha256;
}

async function download(url: string, target: string): Promise<{ sha256: string; bytes: number }> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`download failed: ${url} -> HTTP ${response.status}`);
  }
  mkdirSync(path.dirname(target), { recursive: true });
  const hash = createHash("sha256");
  let bytes = 0;
  const out = createWriteStream(target);
  const counter = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>).map((chunk: Uint8Array) => {
    hash.update(chunk);
    bytes += chunk.byteLength;
    return chunk;
  });
  counter.pipe(out);
  await finished(out);
  return { sha256: hash.digest("hex"), bytes };
}

async function main(): Promise<void> {
  const pin = readPin();
  for (const want of pin.files) {
    const target = modelFilePath(want.path);
    if (await presentAndValid(target, want)) {
      console.log(`present  ${want.path}  ${want.bytes} bytes  sha256 ${want.sha256.slice(0, 12)}`);
      continue;
    }
    const url = `${HUB_BASE}/${EMBEDDING_MODEL}/resolve/main/${want.path}`;
    const partial = `${target}.partial`;
    console.log(`fetching ${want.path} from ${url}`);
    const got = await download(url, partial);
    if (got.sha256 !== want.sha256 || got.bytes !== want.bytes) {
      unlinkSync(partial);
      throw new Error(
        `pin mismatch on ${want.path}: downloaded ${got.bytes} bytes sha256 ${got.sha256}, pin ${want.bytes} bytes sha256 ${want.sha256}; file deleted`,
      );
    }
    renameSync(partial, target);
    console.log(`verified ${want.path}  ${got.bytes} bytes  sha256 ${got.sha256.slice(0, 12)}`);
  }
  console.log(`models:fetch ok: ${pin.files.length} files under ${path.dirname(modelFilePath("x"))}`);
}

main().catch((error: unknown) => {
  console.error(`models:fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
