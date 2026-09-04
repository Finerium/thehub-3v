// M0 seed (ARCHITECTURE 2 and 12): corpus version v0 from the harness packages, the eight areas, the eight P&ID
// documents, the eight equipment rows and the four accounts of blueprint 9.7. Deterministic and idempotent: every
// row is an upsert on its primary key and a second run changes nothing. Every value comes from a package file, the
// corpus inventory (hashes and paths), the pinned extractor's text cache or the environment; nothing is typed here.
// Run as `pnpm db:seed:m0` (dotenv loads .env.local; this file only reads process.env and never prints a value).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as asset from "../../src/contracts/generated/asset";
import * as documentContract from "../../src/contracts/generated/document";
import * as serving from "../../src/contracts/generated/serving";
import { withTransaction, type Tx } from "../../src/db/client";
import { EMBEDDING_DIM } from "../../src/db/embedding";
import { appUser, area, corpusVersion, documentTable, equipment } from "../../src/db/schema";

// ---------------------------------------------------------------------------------------------------------------
// Fixed strings and locations
// ---------------------------------------------------------------------------------------------------------------
const V0_LABEL = "v0-equipment-master";
const SEED_ALIAS = "seed";
const EMBEDDING_MODEL_PENDING = "pending-local-onnx";
const GLM_PIN = { provider: "zai", model_id: "glm-5.3-flash", prompt_version: null } as const; // D-05
const EMBEDDING_PIN = { provider: "local_embedding", model_id: EMBEDDING_MODEL_PENDING, prompt_version: null } as const;
const BCRYPT_COST = 12; // ARCHITECTURE 5
const PNG_PAGE_COUNT = 1; // a PNG holds exactly one image; the P&ID sheets are single PNG files
const DOCUMENT_CLASS_PID = "pid" as const; // harness/pdftext.py doc_class: a .png is a P&ID

const REPO_ROOT = process.cwd();
const HARNESS_DIR = process.env.HARNESS_DIR ?? path.resolve(REPO_ROOT, "../thehub-harness");
const CORPUS_DIR = process.env.CORPUS_DIR ?? path.resolve(REPO_ROOT, "../thehub-corpus");
const FIXTURES_PATH = path.join(HARNESS_DIR, "packages", "fixtures.json");
const AREA_ALIASES_PATH = path.join(HARNESS_DIR, "packages", "area_aliases.json");
const SIDECAR_DIR = path.join(HARNESS_DIR, "packages", "pid_sidecars");
const EXTRACT_CACHE_DIR = path.join(HARNESS_DIR, ".cache"); // <sha256>-raw.txt, the pinned extractor's output
const INVENTORY_PATH = path.join(CORPUS_DIR, "INVENTORY.sha256");

// The four accounts of 9.7 (ARCHITECTURE 5; usernames per the foundation close-out decision in .crown/notes.md)
const ACCOUNTS = [
  { username: "engineer_demo", role: "Engineer", alias: "ENG-DEMO", is_demo: true, env: "DEMO_ENGINEER_PASSWORD" },
  { username: "supervisor_demo", role: "Reviewing Supervisor", alias: "SUP-DEMO", is_demo: true, env: "DEMO_SUPERVISOR_PASSWORD" },
  { username: "manager_demo", role: "Manager", alias: "MGR-DEMO", is_demo: true, env: "DEMO_MANAGER_PASSWORD" },
  { username: "admin", role: "Admin", alias: "ADMIN", is_demo: false, env: "ADMIN_PASSWORD" },
] as const;

// ---------------------------------------------------------------------------------------------------------------
// Package files, validated on the keys this seed reads (the adopted fixtures.json layout, ARCHITECTURE 13)
// ---------------------------------------------------------------------------------------------------------------
const Fixtures = z.object({
  inventory: z.object({ corpus_sha256: z.string().regex(/^[0-9a-f]{64}$/), extractor: z.string() }),
  equipment_master: z.array(
    z.object({
      tag: z.string(),
      name: z.string(),
      functional_location: z.string(),
      area_datasheet: z.string(),
      criticality_datasheet: asset.Equipment.shape.criticality_datasheet,
      criticality_workbook: z.string(),
    }),
  ),
  revision_spot: z.record(
    z.string(),
    z.object({
      datasheet: z.object({ doc_no: z.string() }),
      ga_drawing: z.object({ dwg_no: z.string() }),
      plot_plan: z.object({ dwg_no: z.string() }),
      interlock: z.object({ doc_no: z.string() }),
    }),
  ),
  interlock_rows: z.record(z.string(), z.object({ header: z.object({ doc_no: z.string(), logic_no_text: z.string() }) })),
});
const AreaAliases = z.record(
  z.string(),
  z.object({ datasheet: z.string(), opl: z.string(), plot_plan_title: z.string(), workbook: z.string() }),
);
const Sidecar = z.object({ set: z.number().int(), file: z.string(), tag: z.string() });

const INVENTORY_LINE = /^([0-9a-f]{64})  (.+)$/; // shasum format: hash, two spaces, path
const TAG_IN_SET = /Set_\d{2}_([A-Z]{2}-\d{4}[A-Z]?)/; // harness/pdftext.py TAG_IN_SET
const SET_IN_PATH = /Set_(\d{2})_/;
const AREA_CODE = /^(\d{4}) - /; // harness/master.py DS_AREA: "AREA <dddd> - <name>"
const SERVICE_LINE = /^SERVICE (.+)$/m; // the datasheet title block's SERVICE line, first occurrence

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8")) as unknown;

type InventoryEntry = { sha256: string; path: string };

function readInventory(): InventoryEntry[] {
  if (!existsSync(INVENTORY_PATH)) throw new Error(`corpus inventory not found at ${INVENTORY_PATH} (set CORPUS_DIR)`);
  return readFileSync(INVENTORY_PATH, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const m = INVENTORY_LINE.exec(line);
      if (!m) throw new Error(`unreadable inventory line: ${line.slice(0, 40)}`);
      return { sha256: m[1] as string, path: m[2] as string };
    });
}

// The asset's datasheet in the inventory (folder tag plus the harness doc_class rule "Datasheet" in the file name).
function datasheetOf(tag: string, inventory: InventoryEntry[]): InventoryEntry {
  const hits = inventory.filter((e) => TAG_IN_SET.exec(e.path)?.[1] === tag && path.basename(e.path).includes("Datasheet"));
  if (hits.length !== 1) throw new Error(`expected one datasheet for ${tag} in the inventory, found ${hits.length}`);
  return hits[0] as InventoryEntry;
}

// Equipment.service (9.3) is not carried by the packages yet; read it from the pinned extractor's text of the asset's
// datasheet (the same cache the harness computes from), failing closed when the cache or the line is missing.
function serviceOf(tag: string, inventory: InventoryEntry[]): string {
  const file = path.join(EXTRACT_CACHE_DIR, `${datasheetOf(tag, inventory).sha256}-raw.txt`);
  if (!existsSync(file)) throw new Error(`extracted datasheet text for ${tag} not found under ${EXTRACT_CACHE_DIR} (run make fixtures)`);
  const m = SERVICE_LINE.exec(readFileSync(file, "utf8"));
  if (!m) throw new Error(`no SERVICE line in the extracted datasheet text of ${tag}`);
  return (m[1] as string).trim();
}

function areaCodeOf(row: { tag: string; area_datasheet: string; functional_location: string }): string {
  const code = AREA_CODE.exec(row.area_datasheet)?.[1];
  if (!code) throw new Error(`no area code prefix in area_datasheet of ${row.tag}`);
  if (!row.functional_location.includes(`-${code}-`)) throw new Error(`area code ${code} absent from functional_location of ${row.tag}`);
  return code;
}

// ---------------------------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------------------------
function buildRows() {
  const fixturesBytes = readFileSync(FIXTURES_PATH);
  const fixtures = Fixtures.parse(JSON.parse(fixturesBytes.toString("utf8")));
  const aliases = AreaAliases.parse(readJson(AREA_ALIASES_PATH));
  const inventory = readInventory();
  const manifestSha256 = sha256(fixturesBytes);

  const version = serving.CorpusVersion.parse({
    id: `cv-v0-${manifestSha256.slice(0, 12)}`, // ARCHITECTURE 13 decision 10 pattern with bundle_version v0
    label: V0_LABEL,
    is_active: true,
    manifest_sha256: manifestSha256,
    corpus_sha256: fixtures.inventory.corpus_sha256,
    extractor: fixtures.inventory.extractor,
    embedding_model: EMBEDDING_MODEL_PENDING,
    embedding_dim: EMBEDDING_DIM,
    model_pins: { "AG-1": GLM_PIN, "AG-2": GLM_PIN, "AG-3": GLM_PIN, "AG-4": GLM_PIN, embedding: EMBEDDING_PIN },
    created_by_alias: SEED_ALIAS,
    created_at: new Date().toISOString(),
    activated_by_alias: null,
    activated_at: null,
    parent_version_id: null,
  });

  // The eight P&ID PNGs: sha256 and path from the inventory, tag from the set folder, cross-checked with the sidecar.
  const documents = inventory
    .filter((e) => e.path.toLowerCase().endsWith(".png"))
    .map((e) => {
      const tag = TAG_IN_SET.exec(e.path)?.[1];
      const set = SET_IN_PATH.exec(e.path)?.[1];
      if (!tag || !set) throw new Error(`P&ID outside a set folder: ${path.basename(e.path)}`);
      const sidecar = Sidecar.parse(readJson(path.join(SIDECAR_DIR, `set_${set}.json`)));
      if (sidecar.tag !== tag || sidecar.file !== path.basename(e.path)) {
        throw new Error(`sidecar set_${set}.json does not describe ${path.basename(e.path)} (${tag})`);
      }
      return documentContract.Document.parse({
        id: `doc-${e.sha256.slice(0, 12)}`,
        doc_no: null,
        class: DOCUMENT_CLASS_PID,
        subject_tag: tag,
        sha256: e.sha256,
        source_path: e.path,
        page_count: PNG_PAGE_COUNT,
        file_marker: null,
      });
    });
  const pidDocumentByTag = new Map(documents.map((d) => [d.subject_tag, d.id] as const));

  const areasByCode = new Map<string, asset.Area>();
  const equipmentRows = fixtures.equipment_master.map((row) => {
    const names = aliases[row.tag];
    const spot = fixtures.revision_spot[row.tag];
    const interlockHeader = fixtures.interlock_rows[row.tag]?.header;
    const pidDocumentId = pidDocumentByTag.get(row.tag);
    if (!names || !spot || !interlockHeader || !pidDocumentId) throw new Error(`packages incomplete for ${row.tag}`);
    if (names.datasheet !== row.area_datasheet) throw new Error(`area_aliases datasheet name differs from equipment_master for ${row.tag}`);
    if (spot.interlock.doc_no !== interlockHeader.doc_no) throw new Error(`revision_spot and interlock_rows disagree on the C&E doc_no of ${row.tag}`);

    const code = areaCodeOf(row);
    const areaRow = asset.Area.parse({
      code,
      workbook_name: names.workbook,
      datasheet_name: names.datasheet,
      opl_header_name: names.opl,
      plot_plan_title_name: names.plot_plan_title,
    });
    const seen = areasByCode.get(code);
    if (seen && JSON.stringify(seen) !== JSON.stringify(areaRow)) throw new Error(`two assets name area ${code} differently`);
    areasByCode.set(code, areaRow);

    return asset.Equipment.parse({
      tag: row.tag,
      name: row.name,
      functional_location: row.functional_location,
      area_code: code,
      service: serviceOf(row.tag, inventory),
      criticality_datasheet: row.criticality_datasheet,
      criticality_workbook: row.criticality_workbook,
      interlock_ref: interlockHeader.logic_no_text,
      datasheet_doc_no: spot.datasheet.doc_no,
      ga_drawing_doc_no: spot.ga_drawing.dwg_no,
      pid_document_id: pidDocumentId,
      plot_plan_doc_no: spot.plot_plan.dwg_no,
      ce_doc_no: spot.interlock.doc_no,
    });
  });

  return { version, documents, areas: [...areasByCode.values()], equipmentRows };
}

// ---------------------------------------------------------------------------------------------------------------
// Upserts, in foreign-key order, inside one transaction
// ---------------------------------------------------------------------------------------------------------------
async function upsertAll(tx: Tx, rows: ReturnType<typeof buildRows>, passwords: Record<string, string>) {
  const v = rows.version;
  await tx
    .insert(corpusVersion)
    .values({
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
    })
    // is_active and created_at are set on insert only: a re-run never steals activation from a later version
    .onConflictDoUpdate({
      target: corpusVersion.id,
      set: {
        label: v.label,
        manifestSha256: v.manifest_sha256,
        corpusSha256: v.corpus_sha256,
        extractor: v.extractor,
        embeddingModel: v.embedding_model,
        embeddingDim: v.embedding_dim,
        modelPins: v.model_pins,
        createdByAlias: v.created_by_alias,
      },
    });

  for (const a of rows.areas) {
    const values = {
      code: a.code,
      workbookName: a.workbook_name,
      datasheetName: a.datasheet_name,
      oplHeaderName: a.opl_header_name,
      plotPlanTitleName: a.plot_plan_title_name,
    };
    await tx.insert(area).values(values).onConflictDoUpdate({ target: area.code, set: values });
  }

  for (const d of rows.documents) {
    const values = {
      id: d.id,
      docNo: d.doc_no,
      class: d.class,
      subjectTag: d.subject_tag,
      sha256: d.sha256,
      sourcePath: d.source_path,
      pageCount: d.page_count,
      fileMarker: d.file_marker,
    };
    await tx.insert(documentTable).values(values).onConflictDoUpdate({ target: documentTable.id, set: values });
  }

  for (const e of rows.equipmentRows) {
    const values = {
      tag: e.tag,
      name: e.name,
      functionalLocation: e.functional_location,
      areaCode: e.area_code,
      service: e.service,
      criticalityDatasheet: e.criticality_datasheet,
      criticalityWorkbook: e.criticality_workbook,
      interlockRef: e.interlock_ref,
      datasheetDocNo: e.datasheet_doc_no,
      gaDrawingDocNo: e.ga_drawing_doc_no,
      pidDocumentId: e.pid_document_id,
      plotPlanDocNo: e.plot_plan_doc_no,
      ceDocNo: e.ce_doc_no,
    };
    await tx.insert(equipment).values(values).onConflictDoUpdate({ target: equipment.tag, set: values });
  }

  let rehashed = 0;
  for (const account of ACCOUNTS) {
    const password = passwords[account.env] as string;
    const [existing] = await tx
      .select({ passwordHash: appUser.passwordHash })
      .from(appUser)
      .where(eq(appUser.username, account.username));
    // re-hash only when the environment value changed (ARCHITECTURE 5), so a re-run leaves the row byte-identical
    const keep = existing !== undefined && (await bcrypt.compare(password, existing.passwordHash));
    const passwordHash = keep ? existing.passwordHash : await bcrypt.hash(password, BCRYPT_COST);
    if (!keep) rehashed += 1;
    const user = serving.AppUser.parse({
      id: `usr-${account.username}`,
      alias: account.alias,
      role: account.role,
      username: account.username,
      password_hash: passwordHash,
      is_demo: account.is_demo,
      last_login: null,
    });
    const values = { id: user.id, alias: user.alias, role: user.role, username: user.username, passwordHash: user.password_hash, isDemo: user.is_demo };
    await tx.insert(appUser).values(values).onConflictDoUpdate({
      target: appUser.username,
      set: { alias: values.alias, role: values.role, passwordHash: values.passwordHash, isDemo: values.isDemo },
    });
  }
  return { rehashed };
}

async function main() {
  const missing = ACCOUNTS.map((a) => a.env).filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`refusing to seed: missing environment variables ${missing.join(", ")}`);
  const passwords = Object.fromEntries(ACCOUNTS.map((a) => [a.env, process.env[a.env] as string]));

  const rows = buildRows();
  const { rehashed } = await withTransaction((tx) => upsertAll(tx, rows, passwords));
  console.log(
    [
      `corpus_version ${rows.version.id} (${rows.version.label})`,
      `area ${rows.areas.length}`,
      `document ${rows.documents.length}`,
      `equipment ${rows.equipmentRows.length}`,
      `app_user ${ACCOUNTS.length} (password hashes written: ${rehashed})`,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(`seed-m0 failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
