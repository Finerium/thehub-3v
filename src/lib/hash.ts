// SHA-256 helpers of the ingestion lane (blueprint 9.1, 9.2): the identity of a quoted span is the SHA-256 of its
// canonical form encoded as UTF-8 (harness/canonical.py quote_hash); a bundle file is verified by the digest of its
// bytes (manifest.json files[].sha256, harness/pdftext.py file_sha256).
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { canonical } from "./canonical";

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** sha256 over canonical(text) encoded as UTF-8, hex (9.2 Span.quote_hash, OplStep.source_hash). */
export function quoteHash(text: string): string {
  return sha256Hex(Buffer.from(canonical(text), "utf8"));
}

/** Streamed digest of one file's bytes. */
export function fileSha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}
