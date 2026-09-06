// G1, the admission gate of the package bundle (blueprint 9.1 and 11.2 AC-ING-09, INV-5; ARCHITECTURE 2), the
// TypeScript lane beside harness/g1.py. admit() reads a bundle directory and either admits it with its manifest or
// names every violation by kind and file: every file the manifest lists exists with the recorded sha256 and byte
// count; every file validates against the Zod type contracts/bundle_map.json names; the fixture counts hold, read
// from the fixture's own keys; every span_id, document_id, document_revision_id, wo_number, opl_id, bom_item_id and
// equipment tag resolves inside the bundle; every enum and entity binding is a member of its closed set; every
// quoted span's hash recomputes as sha256(canonical(text)) from the bundle's own text. seeded/* is required from
// bundle_version 1.1.0; opls.json, chunks.jsonl and pages/ are seed-time artefacts (D-17) required unless
// publicOnly names a public release. Nothing here touches a database.
import path from "node:path";
import type { Manifest } from "@/contracts/generated/manifest";
import { readBundle, type Bundle, type ReadOptions, type Violation } from "./g1/bundle";
import { runChecks } from "./g1/checks";

export type { Bundle, Violation, ViolationKind } from "./g1/bundle";
export type AdmitOptions = ReadOptions;

export type Admission =
  | { ok: true; manifest: Manifest; bundle: Bundle; checks: string[] }
  | { ok: false; violations: Violation[]; checks: string[] };

export async function admit(bundleDir: string, options: AdmitOptions = {}): Promise<Admission> {
  const dir = path.resolve(bundleDir);
  const read = await readBundle(dir, options);
  const report = { violations: [...read.violations], checks: [...read.checks] };
  if (read.bundle) runChecks(read.bundle, report);
  if (!read.manifest || !read.bundle || report.violations.length > 0) {
    return { ok: false, violations: report.violations, checks: report.checks };
  }
  return { ok: true, manifest: read.manifest, bundle: read.bundle, checks: report.checks };
}

/** One line per violation, `kind file: detail`, for a console or a CI log. */
export function formatViolations(violations: ReadonlyArray<Violation>): string {
  return violations.map((v) => `${v.kind.padEnd(12)} ${v.file}: ${v.detail}`).join("\n");
}
