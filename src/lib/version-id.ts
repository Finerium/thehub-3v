// The seeded corpus version id (ARCHITECTURE 2 and 13 decision 10; AC-ING-10): "cv-" + bundle_version + "-" +
// sha256(manifest.json bytes).slice(0, 12), deterministic so the seed, CI, the nightly job and the smoke script name
// the same version from bundle/manifest.json. The hash is over the file's bytes as pulled, never over a re-serialised
// object, so a byte-identical manifest is the only way to the same id. The seed imports seededVersionFromBundle for
// the id and the full manifest_sha256 of the corpus_version row; scripts/seeded-version-id.ts prints the id.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Manifest } from "@/contracts/generated/manifest";

export const VERSION_ID_PREFIX = "cv-";
// The manifest digest prefix carried in the id (decision 10 of ARCHITECTURE 13).
export const MANIFEST_DIGEST_LENGTH = 12;

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function seededVersionId(bundleVersion: string, manifestSha256: string): string {
  return `${VERSION_ID_PREFIX}${bundleVersion}-${manifestSha256.slice(0, MANIFEST_DIGEST_LENGTH)}`;
}

export type SeededVersion = {
  id: string;
  bundle_version: string;
  manifest_sha256: string;
  manifest: Manifest;
};

// bundle/manifest.json read as bytes, validated against the 9.1 Manifest contract, and the id derived from it.
// Throws when the file is absent or fails its contract; nothing is guessed from a partial manifest.
export function seededVersionFromBundle(bundleDir: string): SeededVersion {
  const bytes = readFileSync(path.join(bundleDir, "manifest.json"));
  const manifest = Manifest.parse(JSON.parse(bytes.toString("utf8")));
  const manifestSha256 = sha256Hex(bytes);
  return {
    id: seededVersionId(manifest.bundle_version, manifestSha256),
    bundle_version: manifest.bundle_version,
    manifest_sha256: manifestSha256,
    manifest,
  };
}
