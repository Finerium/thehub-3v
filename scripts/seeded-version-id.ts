// `pnpm seeded:version-id [bundle-dir]`: prints the corpus version id the seed inserts for the pulled bundle
// (ARCHITECTURE 2: "cv-" + bundle_version + "-" + sha256(manifest.json bytes).slice(0, 12), the one rule in
// src/lib/version-id.ts) as the only line of stdout, so a workflow takes it with `tail -n 1` (nightly.yml).
// Exit 1 with the reason on stderr when bundle/manifest.json is absent or fails the 9.1 Manifest contract.
import path from "node:path";
import { seededVersionFromBundle } from "../src/lib/version-id";

const bundleDir = path.resolve(process.cwd(), process.argv[2] ?? "bundle");

try {
  console.log(seededVersionFromBundle(bundleDir).id);
} catch (error: unknown) {
  console.error(`seeded:version-id failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
