// The bundle reader behind G1 (blueprint 9.1, ARCHITECTURE 2): the manifest and its file digests, every file
// validated against the Zod type contracts/bundle_map.json names, and the typed contents the checks and the seed
// consume. Violations are collected, never thrown; a file that fails leaves its slot empty so the later checks can
// still report. No detail ever carries document text: ids, paths, counts and schema paths only.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type * as asset from "@/contracts/generated/asset";
import type * as coverage from "@/contracts/generated/coverage";
import type * as document from "@/contracts/generated/document";
import type { Root as Fixtures } from "@/contracts/generated/fixtures";
import type { GoldenCase } from "@/contracts/generated/golden_case";
import { Manifest } from "@/contracts/generated/manifest";
import type * as operations from "@/contracts/generated/operations";
import type { RulePack } from "@/contracts/generated/rulepack";
import { fileSha256, sha256Hex } from "@/lib/hash";
import { BundleMap, schemaFor, type MapEntry } from "./map";

export type ViolationKind = "hash" | "schema" | "count" | "closure" | "closed_set" | "quote_hash" | "missing_file";
export type Violation = { kind: ViolationKind; file: string; detail: string };

export type ReadOptions = {
  /** The public release (D-17): the seed-time files may be absent; the seed never passes this. */
  publicOnly?: boolean;
  /** bundle_map.json; default `<bundle>/bundle_map.json`, else `<harness>/contracts/bundle_map.json`. */
  mapPath?: string;
  /** The harness checkout; default HARNESS_DIR, else the sibling thehub-harness. */
  harnessDir?: string;
  /** A YAML parser for golden/cases.yaml (the `yaml` package's parse); without one the file is counted, not typed. */
  parseYaml?: (text: string) => unknown;
};

// The registry files beside their 9.x parts (bundle_map.json notes): only the keys G1 and the seed read are typed.
const InventoryFile = z.looseObject({ document_id: z.string(), sha256: z.string() });
const Inventory = z.looseObject({ corpus_sha256: z.string(), extractor: z.string(), files: z.array(InventoryFile) });
const LabelRecord = z.looseObject({ wo_number: z.string(), covered_by: z.array(z.string()).nullable().optional() });
const Labels = z.looseObject({ records: z.array(LabelRecord), uncovered_ids: z.array(z.string()) });
export const Finding = z.looseObject({
  id: z.string(),
  rule_id: z.string(),
  severity: z.string(),
  discipline: z.string().nullable(),
  observation_only: z.boolean(),
  document_id: z.string().nullable(),
  span_id: z.string().nullable(),
  state: z.enum(["open", "resolved"]),
  safety_function: z.string().nullable(),
  routing_recommendation: z.string().nullable(),
});
export type Finding = z.infer<typeof Finding>;
const Integrity = z.looseObject({ total: z.number().int(), rules: z.record(z.string(), z.number().int()), findings: z.array(Finding) });
const HandVerified = z.looseObject({ sets: z.array(z.looseObject({ document_id: z.string() })) });
export const PagesIndex = z.looseObject({
  width: z.number().int().positive(),
  format: z.string().min(1),
  documents: z.array(z.object({ document_id: z.string(), source_sha256: z.string(), page_count: z.number().int().nonnegative() }).strict()),
});
export type PagesIndex = z.infer<typeof PagesIndex>;
const PAGES_INDEX = "pages/index.json";

type ClaimsFile = { spans: document.Span[]; claims: document.Claim[]; edges: document.DocumentEdge[]; unresolved_references: unknown[] };
type InterlocksFile = {
  equipment: asset.Equipment[];
  interlocks: asset.Interlock[];
  rows: asset.InterlockRow[];
  permissives: asset.StartPermissive[];
  instrument_tags: asset.InstrumentTag[];
};
type CoverageFile = { method: coverage.CoverageMethod; assessments: coverage.CoverageAssessment[]; summaries: coverage.CoverageSummary[] };
type BomFile = { items: operations.BomItem[]; matches: operations.BomMatch[] };
type OplsFile = { lessons: coverage.Opl[]; steps: coverage.OplStep[]; troubleshooting_rows: coverage.TroubleshootingRow[] };

export type Bundle = {
  dir: string;
  manifest: Manifest;
  manifestSha256: string;
  fixtures: Fixtures | null;
  inventory: z.infer<typeof Inventory> | null;
  documents: document.Document[];
  revisions: document.DocumentRevision[];
  claims: ClaimsFile;
  /** null when chunks.jsonl is absent (a public release under --public-only). */
  chunks: document.Chunk[] | null;
  interlocks: InterlocksFile;
  datasheetParams: asset.DatasheetParam[];
  datasheetSpot: asset.DatasheetParam[];
  revisionSpot: document.DocumentRevision[];
  sidecars: asset.PidSidecar[];
  handVerifiedSets: { document_id: string }[];
  workOrders: operations.WorkOrder[];
  failureEvents: operations.FailureEvent[];
  families: operations.FailureFamily[];
  chains: operations.CausalLink[];
  proofTests: operations.ProofTest[];
  coverage: CoverageFile | null;
  labels: z.infer<typeof Labels> | null;
  debt: coverage.DebtCluster[];
  areas: asset.Area[];
  bom: BomFile;
  integrity: z.infer<typeof Integrity> | null;
  /** null when opls.json is absent (a public release under --public-only). */
  opls: OplsFile | null;
  rulepack: RulePack | null;
  /** The parsed golden set when a YAML parser was supplied, else the file's text for the line count. */
  golden: GoldenCase[] | null;
  goldenText: string | null;
  pagesIndex: PagesIndex | null;
};

export type ReadResult = { manifest: Manifest | null; bundle: Bundle | null; violations: Violation[]; checks: string[] };

const versionTuple = (v: string): number[] => v.split(".").map(Number);

function versionAtLeast(version: string, floor: string): boolean {
  const a = versionTuple(version);
  const b = versionTuple(floor);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "invalid";
  const where = issue.path.map(String).join("/") || "(root)";
  return `${where}: ${issue.message}`;
}

// Never the parser's message: it quotes the text around the error, which may be document text.
function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

export function defaultHarnessDir(): string {
  return process.env.HARNESS_DIR ?? path.resolve(process.cwd(), "../thehub-harness");
}

export function resolveMapPath(dir: string, options: ReadOptions): string {
  const candidates = [
    options.mapPath,
    path.join(dir, "bundle_map.json"),
    path.join(options.harnessDir ?? defaultHarnessDir(), "contracts", "bundle_map.json"),
  ].filter((p): p is string => typeof p === "string");
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`bundle_map.json not found (looked at ${candidates.join(", ")})`);
  return found;
}

export async function readBundle(dir: string, options: ReadOptions = {}): Promise<ReadResult> {
  const violations: Violation[] = [];
  const checks: string[] = [];
  const fail = (kind: ViolationKind, file: string, detail: string) => violations.push({ kind, file, detail });

  const mapPath = resolveMapPath(dir, options);
  const map = BundleMap.parse(JSON.parse(readFileSync(mapPath, "utf8")));
  // The contract files for the byte comparison of the connector copies: the harness checkout when at hand.
  const harnessContracts = path.join(options.harnessDir ?? defaultHarnessDir(), "contracts");
  const contractsDir = path.basename(path.dirname(mapPath)) === "contracts" ? path.dirname(mapPath) : existsSync(harnessContracts) ? harnessContracts : null;
  const isSeedTime = (rel: string): boolean =>
    map.files[rel]?.seed_time === true || Object.entries(map.prefixes).some(([p, e]) => e.seed_time === true && rel.startsWith(p));

  // ---- manifest and digests --------------------------------------------------------------------------------------
  const manifestPath = path.join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    fail("missing_file", "manifest.json", "manifest.json missing");
    return { manifest: null, bundle: null, violations, checks };
  }
  const manifestBytes = readFileSync(manifestPath);
  const manifestJson = parseJson(manifestBytes.toString("utf8"));
  const parsedManifest = manifestJson.ok ? Manifest.safeParse(manifestJson.value) : null;
  if (!parsedManifest?.success) {
    fail("schema", "manifest.json", parsedManifest ? firstIssue(parsedManifest.error) : "not valid JSON");
    return { manifest: null, bundle: null, violations, checks };
  }
  const manifest = parsedManifest.data;
  const manifestSha256 = sha256Hex(manifestBytes);

  const missing = new Set<string>();
  let verified = 0;
  let absentSeedTime = 0;
  for (const f of manifest.files) {
    if (f.path.split("/").includes("..") || path.isAbsolute(f.path)) {
      fail("schema", "manifest.json", `files[].path escapes the bundle: ${f.path}`);
      continue;
    }
    const full = path.join(dir, f.path);
    if (!existsSync(full)) {
      if (isSeedTime(f.path) && options.publicOnly) absentSeedTime += 1;
      else {
        missing.add(f.path);
        fail("missing_file", f.path, "listed in manifest.json, not present");
      }
      continue;
    }
    const size = statSync(full).size;
    if (size !== f.bytes) {
      fail("hash", f.path, `${size} bytes on disk, manifest ${f.bytes}`);
      continue;
    }
    const sha = await fileSha256(full);
    if (sha !== f.sha256) {
      fail("hash", f.path, `sha256 ${sha.slice(0, 12)} on disk, manifest ${f.sha256.slice(0, 12)}`);
      continue;
    }
    verified += 1;
  }
  checks.push(`manifest: ${manifest.files.length} files listed, ${verified} verified by sha256 and size, ${missing.size} missing, ${absentSeedTime} seed-time absent`);

  // ---- schemas ---------------------------------------------------------------------------------------------------
  const parsed = new Map<string, unknown>();
  let goldenText: string | null = null;
  let valid = 0;
  for (const [rel, entry] of Object.entries(map.files)) {
    const full = path.join(dir, rel);
    if (!existsSync(full)) {
      if (missing.has(rel)) continue; // already named
      if (entry.required_from !== undefined) {
        if (versionAtLeast(manifest.bundle_version, entry.required_from)) fail("missing_file", rel, `required from bundle_version ${entry.required_from}`);
      } else if (entry.optional) {
        // absent by design (POLISH)
      } else if (entry.seed_time) {
        if (!options.publicOnly) fail("missing_file", rel, "seed-time file required for a seed (D-17)");
      } else fail("missing_file", rel, "required file not present");
      continue;
    }
    if (rel !== "manifest.json" && !manifest.files.some((f) => f.path === rel)) fail("hash", rel, "present but not listed in manifest.json");
    const outcome = validateFile(full, entry, contractsDir, options.parseYaml);
    if (outcome.ok) {
      valid += 1;
      if (outcome.value !== undefined) parsed.set(rel, outcome.value);
      if (outcome.goldenText !== undefined) goldenText = outcome.goldenText;
      if (outcome.note) checks.push(`${rel}: ${outcome.note}`);
    } else fail("schema", rel, outcome.detail);
  }
  checks.push(`schema: ${valid} files valid against bundle_map.json${contractsDir ? "" : " (connector contracts not byte-compared: no harness checkout)"}`);

  // The page index is under a prefix the map types as binary; it is read for the seed and the closure check.
  let pagesIndex: PagesIndex | null = null;
  if (existsSync(path.join(dir, PAGES_INDEX))) {
    const json = parseJson(readFileSync(path.join(dir, PAGES_INDEX), "utf8"));
    const result = json.ok ? PagesIndex.safeParse(json.value) : null;
    if (result?.success) pagesIndex = result.data;
    else fail("schema", PAGES_INDEX, result ? firstIssue(result.error) : "not valid JSON");
  }

  // The registry files typed on the keys the checks and the seed read (their map schema is the fixture block).
  const loose = <T>(rel: string, schema: z.ZodType<T>): T | null => {
    const full = path.join(dir, rel);
    if (!existsSync(full)) return null;
    const json = parseJson(readFileSync(full, "utf8"));
    const result = json.ok ? schema.safeParse(json.value) : null;
    if (result?.success) return result.data;
    fail("schema", rel, result ? firstIssue(result.error) : "not valid JSON");
    return null;
  };

  // `parsed` holds the output of the exact Zod type the map names for the file, which is the type read here.
  const get = <T>(rel: string, fallback: T): T => (parsed.has(rel) ? (parsed.get(rel) as T) : fallback);
  const sidecars = Object.keys(map.files)
    .filter((rel) => rel.startsWith("pid_sidecars/") && parsed.has(rel))
    .sort()
    .map((rel) => parsed.get(rel) as asset.PidSidecar);

  const bundle: Bundle = {
    dir,
    manifest,
    manifestSha256,
    fixtures: get<Fixtures | null>("fixtures.json", null),
    inventory: loose("inventory.json", Inventory),
    documents: get<document.Document[]>("documents.json", []),
    revisions: get<document.DocumentRevision[]>("revisions.json", []),
    claims: get<ClaimsFile>("claims.json", { spans: [], claims: [], edges: [], unresolved_references: [] }),
    chunks: get<document.Chunk[] | null>("chunks.jsonl", null),
    interlocks: get<InterlocksFile>("interlocks.json", { equipment: [], interlocks: [], rows: [], permissives: [], instrument_tags: [] }),
    datasheetParams: get<asset.DatasheetParam[]>("datasheet_params.json", []),
    datasheetSpot: get<asset.DatasheetParam[]>("datasheet_spot.json", []),
    revisionSpot: get<document.DocumentRevision[]>("revision_spot.json", []),
    sidecars,
    handVerifiedSets: loose("hand_verified.json", HandVerified)?.sets ?? [],
    workOrders: get<operations.WorkOrder[]>("work_orders.json", []),
    failureEvents: get<operations.FailureEvent[]>("failure_events.json", []),
    families: get<operations.FailureFamily[]>("families.json", []),
    chains: get<operations.CausalLink[]>("chains.json", []),
    proofTests: get<operations.ProofTest[]>("proof_tests.json", []),
    coverage: get<CoverageFile | null>("coverage_scores.json", null),
    labels: loose("coverage_labels.json", Labels),
    debt: get<coverage.DebtCluster[]>("debt.json", []),
    areas: get<asset.Area[]>("area_aliases.json", []),
    bom: get<BomFile>("bom.json", { items: [], matches: [] }),
    integrity: loose("integrity_findings.json", Integrity),
    opls: get<OplsFile | null>("opls.json", null),
    rulepack: get<RulePack | null>("rulepack/v1.json", null),
    golden: get<GoldenCase[] | null>("golden/cases.yaml", null),
    goldenText,
    pagesIndex,
  };
  return { manifest, bundle, violations, checks };
}

type FileOutcome = { ok: true; value?: unknown; goldenText?: string; note?: string } | { ok: false; detail: string };

function validateFile(full: string, entry: MapEntry, contractsDir: string | null, parseYaml?: (text: string) => unknown): FileOutcome {
  const size = statSync(full).size;
  if (entry.format === "markdown" || entry.format === "text" || entry.format === "binary") {
    return size > 0 ? { ok: true } : { ok: false, detail: "empty file" };
  }
  if (entry.format === "json_schema") {
    const text = readFileSync(full, "utf8");
    const json = parseJson(text);
    if (!json.ok) return { ok: false, detail: "not valid JSON" };
    const head = z.looseObject({ $schema: z.string().includes("2020-12"), $id: z.string().min(1) }).safeParse(json.value);
    if (!head.success) return { ok: false, detail: `not a JSON Schema 2020-12 document: ${firstIssue(head.error)}` };
    if (contractsDir && entry.schema !== null) {
      const contract = path.join(contractsDir, entry.schema);
      if (!existsSync(contract) || readFileSync(contract, "utf8") !== text) return { ok: false, detail: `differs from contracts/${entry.schema}` };
    }
    return { ok: true };
  }
  const schema = schemaFor(entry);
  if (entry.format === "jsonl") {
    const items: unknown[] = [];
    const lines = readFileSync(full, "utf8").split("\n");
    for (let n = 0; n < lines.length; n += 1) {
      const line = lines[n] ?? "";
      if (line.trim().length === 0) continue;
      const json = parseJson(line);
      if (!json.ok) return { ok: false, detail: `line ${n + 1}: not valid JSON` };
      const result = schema ? schema.safeParse(json.value) : ({ success: true, data: json.value } as const);
      if (!result.success) return { ok: false, detail: `line ${n + 1}: ${firstIssue(result.error)}` };
      items.push(result.data);
    }
    return { ok: true, value: items };
  }
  if (entry.format === "yaml") {
    const text = readFileSync(full, "utf8");
    if (!parseYaml) return { ok: true, goldenText: text, note: "no YAML parser supplied; counted by case lines, not typed" };
    let value: unknown;
    try {
      value = parseYaml(text);
    } catch {
      return { ok: false, detail: "not valid YAML" };
    }
    const result = schema ? schema.safeParse(value) : null;
    if (result && !result.success) return { ok: false, detail: firstIssue(result.error) };
    return { ok: true, value: result ? result.data : value };
  }
  const json = parseJson(readFileSync(full, "utf8"));
  if (!json.ok) return { ok: false, detail: "not valid JSON" };
  if (schema === null) {
    const want = entry.root === "array" ? Array.isArray(json.value) : typeof json.value === "object" && json.value !== null && !Array.isArray(json.value);
    return want ? { ok: true, value: json.value } : { ok: false, detail: `root is not a JSON ${entry.root}` };
  }
  const result = schema.safeParse(json.value);
  return result.success ? { ok: true, value: result.data } : { ok: false, detail: firstIssue(result.error) };
}
