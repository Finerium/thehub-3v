// G1, the admission gate (blueprint 9.1 and 11.2 AC-ING-09; ARCHITECTURE 2): the clean synthetic bundle admits, and
// one mutation of one fact names its violation by kind and file and nothing else. Every mutation runs on a fresh copy
// of the bundle tests/fixtures/bundle/synthetic.ts writes into a temporary directory; a rewritten file gets its
// manifest entry refreshed so only the mutated fact is named, except in the hash tests where the stale entry is the
// point. The lower half walks every reader and map branch so the gate's lines are all executed (AC-EVAL-08). The
// suite needs the harness checkout beside the application (bundle_map.json and the connector contracts) and skips
// itself, with a message, when it is absent.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type * as document from "@/contracts/generated/document";
import type { Manifest } from "@/contracts/generated/manifest";
import { readJson, refreshManifest, SYN, writeJson, writeSyntheticBundle } from "../../tests/fixtures/bundle/synthetic";
import { admit, formatViolations, type Admission, type Violation, type ViolationKind } from "./g1";
import { defaultHarnessDir, readBundle, resolveMapPath } from "./g1/bundle";
import { BundleMap, schemaFor } from "./g1/map";

const harness = defaultHarnessDir();
const hasHarness = existsSync(path.join(harness, "contracts", "bundle_map.json"));
if (!hasHarness) console.warn(`G1 tests skipped: no harness checkout at ${harness} (set HARNESS_DIR or check out thehub-harness beside the application)`);

type ClaimsFile = { spans: document.Span[]; claims: document.Claim[]; edges: document.DocumentEdge[]; unresolved_references: unknown[] };

const violations = (a: Admission): Violation[] => (a.ok ? [] : a.violations);
const kinds = (a: Admission): ViolationKind[] => [...new Set(violations(a).map((v) => v.kind))].sort();
const named = (a: Admission, kind: ViolationKind, file?: string) => violations(a).filter((v) => v.kind === kind && (file === undefined || v.file === file));

function rewrite<T>(dir: string, rel: string, mutate: (value: T) => T | void): void {
  const value = readJson<T>(dir, rel);
  writeJson(dir, rel, mutate(value) ?? value);
  if (rel !== "manifest.json") refreshManifest(dir, rel); // the manifest lists every file but itself
}

function rewriteText(dir: string, rel: string, text: string | Buffer, refresh = true): void {
  writeFileSync(path.join(dir, rel), text);
  if (refresh) refreshManifest(dir, rel);
}

function dropFromManifest(dir: string, rel: string): void {
  const manifest = readJson<Manifest>(dir, "manifest.json");
  manifest.files = manifest.files.filter((f) => f.path !== rel);
  writeJson(dir, "manifest.json", manifest);
}

function removeFile(dir: string, rel: string): void {
  unlinkSync(path.join(dir, rel));
  dropFromManifest(dir, rel);
}

describe.skipIf(!hasHarness)("G1 over the synthetic bundle (AC-ING-09)", () => {
  let work: string;
  let clean: string;
  let admitted: Admission;

  beforeAll(async () => {
    work = mkdtempSync(path.join(os.tmpdir(), "thehub-g1-"));
    clean = path.join(work, "clean");
    writeSyntheticBundle(clean);
    admitted = await admit(clean);
  });

  afterAll(() => {
    rmSync(work, { recursive: true, force: true });
  });

  let n = 0;
  const mutant = (): string => {
    const dir = path.join(work, `mutant-${(n += 1)}`);
    cpSync(clean, dir, { recursive: true });
    return dir;
  };

  it("admits the clean copy with zero violations, the manifest and the typed bundle", () => {
    expect(admitted.ok, formatViolations(violations(admitted))).toBe(true);
    if (!admitted.ok) return;
    expect(admitted.manifest.bundle_version).toBe(SYN.bundleVersion);
    expect(admitted.checks).toContain(`counts.files: ${SYN.files} documents, ${SYN.files} inventory entries, fixture ${SYN.files}`);
    expect(admitted.checks).toContain(`counts.work_orders: ${SYN.workOrders} work orders, fixture ${SYN.workOrders}`);
    expect(admitted.checks).toContain("counts.golden: 2 golden cases, fixture 2");
    expect(admitted.checks.some((c) => c.startsWith("quote_hash.spans: 13 span hashes recomputed, 0 mismatched"))).toBe(true);
    expect(admitted.bundle.documents).toHaveLength(SYN.files);
    expect(admitted.bundle.chunks).toHaveLength(2);
    expect(admitted.bundle.opls?.lessons).toHaveLength(SYN.lessons);
    expect(admitted.bundle.pagesIndex?.documents.map((d) => d.document_id)).toEqual([SYN.pageDocumentId]);
    expect(admitted.bundle.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash: one flipped byte names the hash violation on that file and nothing else", async () => {
    const dir = mutant();
    const rel = "adjudication_log.md";
    const bytes = Buffer.from(readFileSync(path.join(dir, rel)));
    bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    rewriteText(dir, rel, bytes, false);
    const a = await admit(dir);
    expect(kinds(a)).toEqual(["hash"]);
    expect(named(a, "hash", rel)).toHaveLength(1);
    expect(named(a, "hash", rel)[0]?.detail).toMatch(/^sha256 [0-9a-f]{12} on disk, manifest [0-9a-f]{12}$/);
  });

  it("closed_set: a claim bound to an entity outside its candidate set names the closed_set violation on claims.json", async () => {
    const dir = mutant();
    rewrite<ClaimsFile>(dir, "claims.json", (cl) => {
      cl.claims[0]!.entity_binding = "SY-9999Z";
    });
    const a = await admit(dir);
    expect(kinds(a)).toEqual(["closed_set"]);
    const [hit] = named(a, "closed_set", "claims.json");
    expect(hit?.detail).toContain("closed_set.claim.binding");
    expect(hit?.detail).toContain("1 of 5 unresolved (first: SY-9999Z)");
  });

  it("schema: an enum value renamed on one row names the schema violation on that file, at the row and field", async () => {
    const dir = mutant();
    rewrite<Array<Record<string, unknown>>>(dir, "work_orders.json", (wos) => {
      wos[0]!.work_type = "Reactive"; // not one of the six 9.4 work types
    });
    const a = await admit(dir);
    // the failed file leaves its slot empty, so the counts and the closure over work orders follow; the schema line names the fact
    expect(kinds(a)).toContain("schema");
    expect(named(a, "schema")).toHaveLength(1);
    expect(named(a, "schema", "work_orders.json")[0]?.detail).toMatch(/^0\/work_type: /);
    expect(named(a, "count", "work_orders.json")[0]?.detail).toBe(`counts.work_orders: 0 work orders, fixture ${SYN.workOrders}`);
  });

  it("closure: a claim whose span_id resolves to nothing names the closure violation with the ghost id", async () => {
    const dir = mutant();
    rewrite<ClaimsFile>(dir, "claims.json", (cl) => {
      cl.claims[0]!.span_id = "span-syn-ghost";
    });
    const a = await admit(dir);
    expect(kinds(a)).toEqual(["closure"]);
    const [hit] = named(a, "closure", "claims.json");
    expect(hit?.detail).toContain("closure.claim.span");
    expect(hit?.detail).toContain("(first: span-syn-ghost)");
  });

  it("quote_hash: one character of an anchor text swapped in case names the quote_hash violation with the span id", async () => {
    const dir = mutant();
    rewrite<ClaimsFile>(dir, "claims.json", (cl) => {
      const span = cl.spans[0]!;
      span.anchor_text = span.anchor_text[0]!.toLowerCase() + span.anchor_text.slice(1); // same length, same ordinals
    });
    const a = await admit(dir);
    expect(kinds(a)).toEqual(["quote_hash"]);
    const [hit] = named(a, "quote_hash", "claims.json");
    expect(hit?.detail).toContain("13 span hashes recomputed, 1 mismatched (first: span-syn-01)");
  });

  it("count: one work order removed names the count violation against the fixture", async () => {
    const dir = mutant();
    rewrite<unknown[]>(dir, "work_orders.json", (wos) => wos.slice(0, -1));
    const a = await admit(dir);
    expect(kinds(a)).toContain("count");
    const hit = named(a, "count", "work_orders.json").find((v) => v.detail.startsWith("counts.work_orders"));
    expect(hit?.detail).toBe(`counts.work_orders: ${SYN.workOrders - 1} work orders, fixture ${SYN.workOrders}`);
  });

  it("the public release (chunks, lessons and pages absent) admits under publicOnly and is refused for a seed (D-17)", async () => {
    const dir = path.join(work, "public");
    writeSyntheticBundle(dir, { publicOnly: true });
    const release = await admit(dir, { publicOnly: true });
    expect(release.ok, formatViolations(violations(release))).toBe(true);
    if (release.ok) {
      expect(release.bundle.chunks).toBeNull();
      expect(release.bundle.opls).toBeNull();
      expect(release.bundle.pagesIndex).toBeNull();
      expect(release.checks.some((c) => c.startsWith("manifest: ") && c.endsWith("0 seed-time absent"))).toBe(true);
    }
    const seed = await admit(dir);
    expect(kinds(seed)).toEqual(["missing_file"]);
    expect(named(seed, "missing_file").map((v) => v.file).sort()).toEqual(["chunks.jsonl", "opls.json"]);
    expect(named(seed, "missing_file")[0]?.detail).toBe("seed-time file required for a seed (D-17)");
  });

  it("a seed-time file the manifest lists but the tree lacks is absent under publicOnly and missing for a seed", async () => {
    const dir = mutant();
    unlinkSync(path.join(dir, "chunks.jsonl"));
    const release = await admit(dir, { publicOnly: true });
    expect(release.ok, formatViolations(violations(release))).toBe(true);
    if (release.ok) expect(release.checks.some((c) => c.endsWith("1 seed-time absent"))).toBe(true);
    const seed = await admit(dir);
    expect(named(seed, "missing_file", "chunks.jsonl")[0]?.detail).toBe("listed in manifest.json, not present");
  });

  it("formatViolations renders one aligned line per violation", () => {
    const lines = formatViolations([
      { kind: "hash", file: "a.json", detail: "x" },
      { kind: "quote_hash", file: "claims.json", detail: "y" },
    ]).split("\n");
    expect(lines).toEqual(["hash         a.json: x", "quote_hash   claims.json: y"]);
  });

  describe("every other fact G1 pins, one mutation each", () => {
    type Case = [name: string, mutate: (dir: string) => void, kind: ViolationKind, file: string, detail: string];
    const cases: Case[] = [
      ["a listed file whose size changed", (d) => rewriteText(d, "adjudication_log.md", "# changed\n", false), "hash", "adjudication_log.md", "bytes on disk, manifest"],
      ["a mapped file present but not listed in the manifest", (d) => writeJson(d, "simulated/ga-1201a.json", { provenance: "SIMULATED" }), "hash", "simulated/ga-1201a.json", "present but not listed in manifest.json"],
      ["a required file removed from the tree and the manifest", (d) => removeFile(d, "area_aliases.json"), "missing_file", "area_aliases.json", "required file not present"],
      ["seeded/* absent from bundle_version 1.1.0 on", (d) => rewrite<Manifest>(d, "manifest.json", (m) => void (m.bundle_version = "1.1.0")), "missing_file", "seeded/packets.json", "required from bundle_version 1.1.0"],
      ["a manifest path that escapes the bundle", (d) => rewrite<Manifest>(d, "manifest.json", (m) => void m.files.push({ path: "../outside.json", sha256: "0".repeat(64), bytes: 1 })), "schema", "manifest.json", "files[].path escapes the bundle: ../outside.json"],
      ["an empty markdown file", (d) => rewriteText(d, "adjudication_log.md", ""), "schema", "adjudication_log.md", "empty file"],
      ["a JSON file that is not JSON", (d) => rewriteText(d, "documents.json", "{not json"), "schema", "documents.json", "not valid JSON"],
      ["a connector contract copy that is not JSON", (d) => rewriteText(d, "contracts/edms.schema.json", "{"), "schema", "contracts/edms.schema.json", "not valid JSON"],
      ["a connector contract copy without the 2020-12 head", (d) => rewriteText(d, "contracts/edms.schema.json", JSON.stringify({ $id: "x" })), "schema", "contracts/edms.schema.json", "not a JSON Schema 2020-12 document"],
      ["a connector contract copy that differs from the harness contract", (d) => rewriteText(d, "contracts/aims.schema.json", JSON.stringify(readJson(d, "contracts/aims.schema.json"))), "schema", "contracts/aims.schema.json", "differs from contracts/connectors/aims.schema.json"],
      ["a chunks line that is not JSON", (d) => rewriteText(d, "chunks.jsonl", "{bad\n"), "schema", "chunks.jsonl", "line 1: not valid JSON"],
      ["a chunks line outside the Chunk contract", (d) => rewriteText(d, "chunks.jsonl", `${JSON.stringify({ id: "c" })}\n`), "schema", "chunks.jsonl", "line 1: "],
      ["a chunk whose vector is not 384 wide", (d) => rewriteChunk(d, (c) => void (c.embedding = [0.1, 0.2, 0.3])), "count", "chunks.jsonl", "embedding dimensions 3|384, column 384"],
      ["a chunk whose text no longer hashes to its quote_hash", (d) => rewriteChunk(d, (c) => void (c.text = `${c.text}.`)), "quote_hash", "chunks.jsonl", "2 chunk hashes recomputed, 1 mismatched (first: chunk-syn-1)"],
      ["a schema-less object file whose root is an array", (d) => rewrite<unknown>(d, "hand_verified.json", () => []), "schema", "hand_verified.json", "root is not a JSON object"],
      ["a page index outside its shape", (d) => rewrite<unknown>(d, "pages/index.json", () => ({ width: 1200 })), "schema", "pages/index.json", "format: "],
      ["a page whose source digest is not the document's", (d) => rewrite<{ documents: Array<{ source_sha256: string }> }>(d, "pages/index.json", (p) => void (p.documents[0]!.source_sha256 = "f".repeat(64))), "hash", "pages/index.json", `1 page sources equal documents.json (first: ${SYN.pageDocumentId})`],
      ["an inventory digest that is not the document's", (d) => rewrite<{ files: Array<{ sha256: string }> }>(d, "inventory.json", (i) => void (i.files[0]!.sha256 = "e".repeat(64))), "hash", "inventory.json", "98 inventory digests equal documents.json (first: doc-syn-pid-01)"],
      ["a fixture that fails its contract leaves no count pinned", (d) => rewrite<Record<string, unknown>>(d, "fixtures.json", (fx) => void delete fx.inventory), "count", "fixtures.json", "counts: fixtures.json unavailable, no count can be pinned"],
      ["a lesson step whose text no longer hashes to source_hash", (d) => rewrite<{ steps: Array<{ action_text: string }> }>(d, "opls.json", (o) => void (o.steps[0]!.action_text += " now")), "quote_hash", "opls.json", "1 mismatched (first: OPL-SYN-0101A-01#1)"],
      ["a lesson section whose body no longer hashes to body_hash", (d) => rewrite<{ lessons: Array<{ sections: Array<{ body_text: string }> }> }>(d, "opls.json", (o) => void (o.lessons[1]!.sections[0]!.body_text += " now")), "quote_hash", "opls.json", "1 mismatched (first: OPL-SYN-0101A-02#1)"],
      ["a hotspot bound to nothing without a reason", (d) => rewrite<{ hotspots: Array<{ unbound_reason: string | null }> }>(d, "pid_sidecars/set_01.json", (s) => void (s.hotspots[1]!.unbound_reason = null)), "closed_set", "pid_sidecars", "1 null bindings without a reason"],
      ["a hotspot bound to a tag outside the sheet, datasheet and identities", (d) => rewrite<{ hotspots: Array<{ bound_tag: string | null }> }>(d, "pid_sidecars/set_01.json", (s) => void (s.hotspots[0]!.bound_tag = "XX-0000")), "closed_set", "pid_sidecars", "hotspot bound_tag: 1 of 1 unresolved (first: XX-0000)"],
      ["an agent-transcribed sidecar marked reviewed (D-12)", (d) => rewrite<{ provenance: { review_status: string } }>(d, "pid_sidecars/set_02.json", (s) => void (s.provenance.review_status = "reviewed")), "closed_set", "pid_sidecars", "8 sidecars"],
      ["a manifest extractor string that is not the fixture's", (d) => rewrite<Manifest>(d, "manifest.json", (m) => void (m.extractor = "pdftotext -layout")), "closed_set", "manifest.json", "closed_set.extractor: extractor pdftotext -layout"],
      ["a manifest rulepack_version that is not the pack's", (d) => rewrite<Manifest>(d, "manifest.json", (m) => void (m.rulepack_version = "2")), "closed_set", "manifest.json", "closed_set.rulepack: rulepack_version 2"],
      ["a manifest recipe digest that is not the fixture's", (d) => rewrite<Manifest>(d, "manifest.json", (m) => void (m.recipe_sha256 = "a".repeat(64))), "hash", "manifest.json", "hash.recipe"],
      ["a manifest corpus digest that is not the fixture's", (d) => rewrite<Manifest>(d, "manifest.json", (m) => void (m.corpus_sha256 = "b".repeat(64))), "hash", "manifest.json", "hash.corpus"],
      ["a document without a current revision", (d) => rewrite<document.DocumentRevision[]>(d, "revisions.json", (rs) => void (rs.find((r) => r.id === SYN.revId("pid", 8))!.is_current = false)), "closure", "revisions.json", "closure.current_revision: 97 of 98 documents carry one current revision"],
      ["a manual sidecar keeps admitting (the other allowed provenance)", (d) => rewrite<{ provenance: { basis: string } }>(d, "pid_sidecars/set_03.json", (s) => void (s.provenance.basis = "manual")), "hash", "manifest.json", "never"],
    ];

    function rewriteChunk(dir: string, mutate: (chunk: document.Chunk) => void): void {
      const lines = readFileSync(path.join(dir, "chunks.jsonl"), "utf8").split("\n").filter((l) => l.trim().length > 0);
      const chunks = lines.map((l) => JSON.parse(l) as document.Chunk);
      mutate(chunks[0]!);
      rewriteText(dir, "chunks.jsonl", `${chunks.map((c) => JSON.stringify(c)).join("\n")}\n`);
    }

    it.each(cases)("%s", async (_name, mutate, kind, file, detail) => {
      const dir = mutant();
      mutate(dir);
      const a = await admit(dir);
      if (detail === "never") {
        expect(a.ok, formatViolations(violations(a))).toBe(true);
        return;
      }
      const hits = named(a, kind, file);
      expect(hits.map((v) => v.detail), formatViolations(violations(a))).toSatisfy((details: string[]) => details.some((x) => x.includes(detail)));
    });
  });

  describe("the reader (src/gates/g1/bundle.ts)", () => {
    it("names a missing manifest and stops", async () => {
      const dir = path.join(work, "empty");
      mkdirSync(dir, { recursive: true });
      const read = await readBundle(dir);
      expect(read.manifest).toBeNull();
      expect(read.bundle).toBeNull();
      expect(read.violations).toEqual([{ kind: "missing_file", file: "manifest.json", detail: "manifest.json missing" }]);
      const a = await admit(dir);
      expect(kinds(a)).toEqual(["missing_file"]);
    });

    it("names a manifest that is not JSON, then one that fails the 9.1 contract", async () => {
      const dir = mutant();
      rewriteText(dir, "manifest.json", "{", false);
      expect((await readBundle(dir)).violations).toEqual([{ kind: "schema", file: "manifest.json", detail: "not valid JSON" }]);
      rewriteText(dir, "manifest.json", JSON.stringify({ bundle_version: "1.0.0" }), false);
      const [only] = (await readBundle(dir)).violations;
      expect(only).toMatchObject({ kind: "schema", file: "manifest.json" });
      expect(only?.detail).toMatch(/^harness_commit: /);
    });

    it("types the golden set when a YAML parser is supplied, and names a parser failure or a case outside 9.11", async () => {
      const cases = readJson<unknown>(clean, "fixtures.json") as { golden: { size: number } };
      const typed = await readBundle(clean, {
        parseYaml: () =>
          Array.from({ length: cases.golden.size }, (_, i) => ({
            id: `GS-SYN-${i}`,
            category: "Grounded answering",
            hard_gate: false,
            tier: "A",
            input: { question: "q" },
            expected: { outcome: "answer", must_cite: [], must_contain: [], must_not_contain: [], numerals_allowed: [] },
            sources: [],
            checks: [],
            origin: "team",
          })),
      });
      expect(typed.violations).toEqual([]);
      expect(typed.bundle?.golden).toHaveLength(2);
      expect(typed.bundle?.goldenText).toBeNull();

      const broken = await readBundle(clean, {
        parseYaml: () => {
          throw new Error("bad yaml");
        },
      });
      expect(broken.violations).toEqual([{ kind: "schema", file: "golden/cases.yaml", detail: "not valid YAML" }]);

      const untyped = await readBundle(clean, { parseYaml: () => [{ id: "GS-1" }] });
      expect(untyped.violations[0]).toMatchObject({ kind: "schema", file: "golden/cases.yaml" });
      expect(untyped.violations[0]?.detail).toMatch(/^0\/category: /);
    });

    it("counts the golden cases by line and notes it when no parser is supplied", async () => {
      const read = await readBundle(clean);
      expect(read.checks).toContain("golden/cases.yaml: no YAML parser supplied; counted by case lines, not typed");
      expect(read.bundle?.golden).toBeNull();
      expect(read.bundle?.goldenText).toContain("- id: GS-SYN-01");
    });

    it("resolves bundle_map.json from the bundle, the option or the harness, and throws when none exists", () => {
      expect(resolveMapPath(clean, {})).toBe(path.join(harness, "contracts", "bundle_map.json"));
      const explicit = path.join(harness, "contracts", "bundle_map.json");
      expect(resolveMapPath(clean, { mapPath: explicit, harnessDir: "/nonexistent" })).toBe(explicit);
      const dir = mutant();
      cpSync(explicit, path.join(dir, "bundle_map.json"));
      expect(resolveMapPath(dir, { harnessDir: "/nonexistent" })).toBe(path.join(dir, "bundle_map.json"));
      expect(() => resolveMapPath(clean, { harnessDir: "/nonexistent" })).toThrow(/bundle_map\.json not found/);
    });

    it("skips the byte comparison of the connector copies, and says so, when no harness checkout is at hand", async () => {
      const dir = mutant();
      cpSync(path.join(harness, "contracts", "bundle_map.json"), path.join(dir, "bundle_map.json"));
      rewriteText(dir, "contracts/historian.schema.json", JSON.stringify(readJson(dir, "contracts/historian.schema.json")));
      const read = await readBundle(dir, { harnessDir: "/nonexistent" });
      expect(read.violations).toEqual([]);
      expect(read.checks.some((c) => c.endsWith("(connector contracts not byte-compared: no harness checkout)"))).toBe(true);
    });

    it("keeps the sidecars in set order and the registry files typed on the keys the seed reads", async () => {
      const read = await readBundle(clean);
      expect(read.bundle?.sidecars.map((s) => s.set)).toEqual([101, 102, 103, 104, 105, 106, 107, 108]);
      expect(read.bundle?.inventory?.files).toHaveLength(SYN.files);
      expect(read.bundle?.labels?.records.map((r) => r.wo_number)).toEqual([SYN.wo(1), SYN.wo(2)]);
      expect(read.bundle?.integrity?.findings.map((f) => f.id)).toEqual(["if-syn-1", "if-syn-2"]);
      expect(read.bundle?.handVerifiedSets).toEqual([{ document_id: SYN.pageDocumentId, file: `synthetic/${SYN.pageDocumentId}.png` }]);
    });
  });

  it("the tracked public copy under bundle/ admits under publicOnly", async () => {
    const tracked = path.resolve("bundle");
    if (!existsSync(path.join(tracked, "manifest.json"))) return;
    const a = await admit(tracked, { publicOnly: true });
    expect(a.ok, formatViolations(violations(a))).toBe(true);
  });
});

describe("the bundle map (src/gates/g1/map.ts)", () => {
  const entry = (partial: Record<string, unknown>) => BundleMap.shape.files.valueType.parse({ format: "json", root: "object", schema: "entities/document.schema.json", ...partial });

  it("resolves a def, an array of a def, a pointer and a multi-type object root onto the generated Zod", () => {
    expect(schemaFor(entry({ def: "Document", root: "array" }))!.safeParse([]).success).toBe(true);
    expect(schemaFor(entry({ def: "Document" }))!.safeParse({}).success).toBe(false);
    expect(schemaFor(entry({ schema: "fixtures.schema.json", pointer: "#" }))).toBeInstanceOf(z.ZodObject);
    const inventory = schemaFor(entry({ schema: "fixtures.schema.json", pointer: "#/properties/inventory" }))!;
    expect(inventory.safeParse({ files_total: 98, by_class: {}, corpus_sha256: "a".repeat(64), extractor: "x", canonical_form_version: "1" }).success).toBe(true);
    const claims = schemaFor(entry({ properties: { spans: { root: "array", def: "Span" }, unresolved_references: { root: "array", def: null }, edge: { root: "object", def: "DocumentEdge" } } }))!;
    expect(claims.safeParse({ spans: [], unresolved_references: [{ anything: true }], edge: { from_document_id: "a", to_document_id: "b", edge_kind: "note", source_span_id: "s" } }).success).toBe(true);
    expect(claims.safeParse({ spans: [], unresolved_references: [], edge: {}, extra: 1 }).success).toBe(false);
  });

  it("is null for a file without a schema, and throws for a def, pointer or entry the contracts do not carry", () => {
    expect(schemaFor(entry({ schema: null }))).toBeNull();
    expect(() => schemaFor(entry({ def: "Nope" }))).toThrow(/names Nope of entities\/document\.schema\.json/);
    expect(() => schemaFor(entry({ schema: "fixtures.schema.json", pointer: "#/definitions/x" }))).toThrow(/unsupported pointer/);
    expect(() => schemaFor(entry({ schema: "fixtures.schema.json", pointer: "#/properties/nope" }))).toThrow(/names no property/);
    expect(() => schemaFor(entry({ def: null }))).toThrow(/neither a def nor a pointer/);
  });
});
