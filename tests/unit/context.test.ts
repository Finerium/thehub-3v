// The asset-context family of blueprint 11.6 (AC-CTX-01 to 05, 09 and 10), proved over the bundle the seeded
// database is loaded from and over the application's own readers.
//
// Why the bundle and not a connection: `pnpm db:seed` writes these exact rows (src/db/seed/*.ts reads the same
// files through src/gates/g1/bundle.ts), and the `unit` project of vitest.config.ts is hermetic by construction.
// So the data half of each criterion is asserted here against bundle/ (the pulled copy, PULLED.txt bundle_version
// 1.0.3, the corpus version the deployment is seeded with) and the code half against the modules the surfaces
// import. `readBundle` parses every row through the generated 9.x Zod, so a row that drifts from the contract
// fails before an assertion is reached.
//
// What each block proves, and what it deliberately does not:
//
//   AC-CTX-01  the fleet register's own predicate (`reconciled` of src/db/queries/assets.ts) over rows recomputed
//              from work_orders.json and failure_events.json against the workbook slice the application reads
//              (`equipmentMaster()`): 8 of 8. Then every edge of every asset page, built by the document-set rule
//              of `readAsset`, resolved to the span it was read from on the document that makes the reference.
//   AC-CTX-02  the hotspot data behind sets 1, 2, 4 and 5. Not the rendered layer: no P&ID carries a page
//              derivative (the harness renders PDFs only and the eight sheets are PNG, run notes open item 2),
//              so PidIndex renders its designed no-underlay state and no hotspot is clickable today. The e2e
//              lane owns the rendered proof once a derivative exists.
//   AC-CTX-03  what the interlock matrix is given per sheet, including EA-5601 as a control loop whose trip
//              boilerplate is the open CD-17 finding the page prints beside it.
//   AC-CTX-04  the three connector contracts, the empty digital-twin deep link, and that no module builds a
//              connector row anywhere. `GET /api/connectors/:name/schema` does not exist, so the byte-for-byte
//              clause has no route to answer it; the only connector surface today is the identity panel's badge.
//   AC-CTX-05  the figures the operational-context panel must bind to when it is built, recomputed from the rows
//              rather than read from the fixture, plus EA-5601's absent protective function and the one demand
//              SEQ-1201 carries by inference.
//   AC-CTX-09  the route audit: no bulk, archive, zip or download route exists, and the one page route serves a
//              single page under ask_read with a private, no-store cache directive.
//   AC-CTX-10  no asset outside GA-1201A carries a simulated series (today none exists at all), and the two
//              KC-4501 cases forbid the SIMULATED wording, which is how another asset's ladder says in words
//              that no series exists.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Equipment, PidSidecar } from "@/contracts/generated/asset";
import { DigitalTwinRow } from "@/contracts/generated/edms";
import { EDGE_KIND_LABEL, equipmentMaster, reconciled, type FleetRow, type MasterRow } from "@/db/queries/assets";
import { readBundle, type Bundle } from "@/gates/g1/bundle";
import { STATUS_WORDING } from "@/lib/fixed-strings";
import { parseYaml } from "../../scripts/golden/yaml";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const BUNDLE_DIR = path.join(ROOT, "bundle");
const skip = !existsSync(path.join(BUNDLE_DIR, "manifest.json"));
const reason = `bundle absent at ${BUNDLE_DIR}; run \`pnpm bundle:pull\` (or point HARNESS_DIR at a checkout and build it)`;

// publicOnly: chunks.jsonl and opls.json are gitignored, and nothing in this file reads them.
const read = skip ? null : await readBundle(BUNDLE_DIR, { publicOnly: true, parseYaml });
const loaded = read?.bundle ?? null;

function bundle(): Bundle {
  if (loaded === null) throw new Error(reason);
  return loaded;
}

/** The eight tags, in the order the register reads them (equipment ordered by tag). */
const TAGS = ["CT-7801", "DC-3401A", "EA-5601", "FA-8901", "GA-1201A", "KC-4501", "LV-6701", "YD-2301"];

/** downtime_hours is numeric(6,1) in the database, so a sum of the seeded rows carries one decimal, not float dust. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The asset's document set, by the rule of `readAsset`: the P&ID by id, the four typed classes by doc_no, and every document whose own subject_tag is the asset. */
function documentSet(b: Bundle, e: Equipment): Set<string> {
  const bound = new Set([e.datasheet_doc_no, e.ga_drawing_doc_no, e.plot_plan_doc_no, e.ce_doc_no]);
  return new Set(
    b.documents.filter((d) => d.id === e.pid_document_id || d.subject_tag === e.tag || (d.doc_no !== null && bound.has(d.doc_no))).map((d) => d.id),
  );
}

/** One line of the register, recomputed from the rows the seed loads exactly as `readFleet` groups them. */
function fleetRow(b: Bundle, e: Equipment, master: Map<string, MasterRow>): FleetRow {
  const events = b.failureEvents.filter((x) => x.equipment_tag === e.tag);
  const unplanned = events.filter((x) => x.breakdown_kind === "unplanned");
  const lock = b.interlocks.interlocks.find((i) => i.equipment_tag === e.tag) ?? null;
  const hours = (rows: typeof events): number => round1(rows.reduce((s, x) => s + (x.downtime_hours ?? 0), 0));
  const subject = b.documents.filter((d) => d.subject_tag === e.tag).map((d) => d.id);
  return {
    equipment: e,
    area_workbook_name: b.areas.find((a) => a.code === e.area_code)?.workbook_name ?? e.area_code,
    interlock: lock ? { seq_id: lock.seq_id, logic_kind: lock.logic_kind, sil_sheet: lock.sil_sheet } : null,
    work_orders: b.workOrders.filter((w) => w.equipment_tag === e.tag).length,
    unplanned_rows: unplanned.length,
    planned_flagged_rows: events.filter((x) => x.breakdown_kind === "planned_flagged").length,
    unplanned_hours: hours(unplanned),
    flagged_hours: hours(events),
    lessons: b.documents.filter((d) => d.class === "opl" && d.subject_tag === e.tag).length,
    open_findings: (b.integrity?.findings ?? []).filter((f) => f.state === "open" && f.document_id !== null && subject.includes(f.document_id)).length,
    workbook: master.get(e.tag) ?? null,
  };
}

function sidecarOfSet(b: Bundle, set: number): PidSidecar {
  const found = b.sidecars.find((s) => s.set === set);
  if (!found) throw new Error(`no sidecar for set ${set}`);
  return found;
}

describe.skipIf(skip)("AC-CTX-01: the 8 asset pages against the recomputed equipment master", () => {
  it("reconciles 8 of 8 with the register's own predicate", () => {
    const b = bundle();
    const master = equipmentMaster();
    expect(master, "fixtures.json is unreadable in this runtime, so the register would print no reconciliation").not.toBeNull();
    if (master === null) return;
    const rows = b.interlocks.equipment.map((e) => fleetRow(b, e, master));
    expect(rows.map((r) => r.equipment.tag).sort()).toEqual(TAGS);
    expect(rows.filter((r) => reconciled(r) === true).map((r) => r.equipment.tag).sort()).toEqual(TAGS);
    // The register's totals, which the same rows add up to: 211 records and 31 flagged failure rows.
    expect(rows.reduce((s, r) => s + r.work_orders, 0)).toBe(211);
    expect(rows.reduce((s, r) => s + r.unplanned_rows + r.planned_flagged_rows, 0)).toBe(31);
  });

  it("agrees with the workbook on the identity fields the datasheet also states", () => {
    const b = bundle();
    const master = equipmentMaster();
    if (master === null) return;
    for (const e of b.interlocks.equipment) {
      const row = master.get(e.tag);
      expect(row, `${e.tag} has no workbook row`).toBeDefined();
      if (!row) continue;
      expect([e.tag, row.name, row.functional_location, row.criticality_datasheet, row.criticality_workbook, row.interlock_sheet]).toEqual([
        e.tag,
        e.name,
        e.functional_location,
        e.criticality_datasheet,
        e.criticality_workbook,
        b.interlocks.interlocks.find((i) => i.equipment_tag === e.tag)?.seq_id ?? null,
      ]);
    }
  });

  it("every edge of every page came from a document cross-reference: the span, its page and the document that makes it", () => {
    const b = bundle();
    const spans = new Map(b.claims.spans.map((s) => [s.id, s]));
    const revisionDocument = new Map(b.revisions.map((r) => [r.id, r.document_id]));
    let total = 0;
    for (const e of b.interlocks.equipment) {
      const ids = documentSet(b, e);
      expect(ids.size, `${e.tag} document set`).toBe(12);
      const edges = b.claims.edges.filter((x) => ids.has(x.from_document_id) && ids.has(x.to_document_id));
      expect(edges.length, `${e.tag} shows no edge at all`).toBeGreaterThan(0);
      for (const edge of edges) {
        const span = spans.get(edge.source_span_id);
        expect(span, `${e.tag} edge ${edge.edge_kind} ${edge.from_document_id} carries no span`).toBeDefined();
        if (!span) continue;
        // The chip lands on #page=n&span=<id> of the document that makes the reference, never of the target.
        expect(revisionDocument.get(span.document_revision_id)).toBe(edge.from_document_id);
        expect(span.page).toBeGreaterThanOrEqual(1);
        expect(span.anchor_text.length).toBeGreaterThan(0);
        expect(EDGE_KIND_LABEL[edge.edge_kind]).toBeTypeOf("string");
      }
      total += edges.length;
    }
    expect(total, "the edges the eight pages print, at this corpus version").toBe(435);
  });
});

describe.skipIf(skip)("AC-CTX-02: the hotspot data behind the P&ID index", () => {
  it("Set 1 binds more than four hotspots to tags that open a typed row", () => {
    const b = bundle();
    const set1 = sidecarOfSet(b, 1);
    expect(b.interlocks.equipment.find((e) => e.pid_document_id === set1.document_id)?.tag).toBe("GA-1201A");
    const typed = new Set(b.interlocks.rows.map((r) => r.instrument_tag));
    const bound = set1.hotspots.filter((h) => h.bound_tag !== null);
    const opens = new Set(bound.filter((h) => h.bound_tag !== null && typed.has(h.bound_tag)).map((h) => h.bound_tag));
    expect(set1.hotspots).toHaveLength(33);
    expect(bound.length).toBe(16);
    expect(opens.size, "bound tags of set 1 that open a typed interlock row").toBeGreaterThanOrEqual(4);
    // Every hotspot is placed inside the sheet, so a rendered layer cannot put one off the underlay.
    for (const h of set1.hotspots) {
      expect(h.x_frac).toBeGreaterThanOrEqual(0);
      expect(h.x_frac).toBeLessThanOrEqual(1);
      expect(h.y_frac).toBeGreaterThanOrEqual(0);
      expect(h.y_frac).toBeLessThanOrEqual(1);
    }
  });

  it("VSHH-1201 is the typed T3 trip row of SEQ-1201, and WO-240003 carries its root cause and its chain place", () => {
    const b = bundle();
    const row = b.interlocks.rows.find((r) => r.instrument_tag === "VSHH-1201");
    expect(row?.row_id).toBe("T3");
    expect(row?.row_kind).toBe("trip");
    expect(row?.seq_id).toBe("SEQ-1201");
    expect(row?.span_id.length).toBeGreaterThan(0);
    const wo = b.workOrders.find((w) => w.wo_number === "WO-240003");
    expect(wo?.equipment_tag).toBe("GA-1201A");
    expect(wo?.problem_description).toContain("VSHH-1201");
    expect(wo?.root_cause.length).toBeGreaterThan(0);
    const hops = b.chains.filter((c) => c.from_wo === "WO-240003" || c.to_wo === "WO-240003");
    expect(hops.length, "WO-240003 has no chain place").toBeGreaterThan(0);
    for (const hop of hops) expect(hop.mechanism_noun.length).toBeGreaterThan(0);
  });

  it("Sets 4 and 5 carry hotspots, and every Set 2 hotspot carries as_drawn_text", () => {
    const b = bundle();
    expect(sidecarOfSet(b, 4).hotspots.length).toBeGreaterThanOrEqual(4);
    expect(sidecarOfSet(b, 5).hotspots.length).toBeGreaterThanOrEqual(4);
    const set2 = sidecarOfSet(b, 2);
    expect(set2.hotspots).toHaveLength(50);
    expect(set2.hotspots.filter((h) => h.as_drawn_text.length === 0)).toEqual([]);
  });

  it("the Set 2 hotspot drawn 'S5LL 2305' binds SSLL-2305, and CD-18 marks that sheet with the safety function", () => {
    const b = bundle();
    const set2 = sidecarOfSet(b, 2);
    const hotspot = set2.hotspots.find((h) => h.id === "set02-011");
    expect(hotspot?.as_drawn_text).toBe("S5LL 2305");
    expect(hotspot?.bound_tag).toBe("SSLL-2305");
    expect(b.interlocks.rows.some((r) => r.instrument_tag === "SSLL-2305")).toBe(true);
    const findings = (b.integrity?.findings ?? []).filter((f) => f.rule_id === "CD-18" && f.document_id === set2.document_id);
    expect(findings.map((f) => f.id)).toContain("CD-18-002");
    expect(findings.find((f) => f.id === "CD-18-002")?.safety_function).toBe("SEQ-5500");
    for (const f of findings) expect(f.state).toBe("open");
  });
});

describe.skipIf(skip)("AC-CTX-03: what the interlock matrix renders, per sheet", () => {
  it("every trip-logic sheet states its SIL and its gate, and every row, permissive and note carries the span its chip lands on", () => {
    const b = bundle();
    const spans = new Set(b.claims.spans.map((s) => s.id));
    const trip = b.interlocks.interlocks.filter((i) => i.logic_kind === "trip_logic");
    expect(trip).toHaveLength(7);
    for (const lock of trip) {
      expect(typeof lock.sil_sheet, `${lock.equipment_tag} SIL badge`).toBe("number");
      expect(lock.permissive_gate).toBe("AND");
      expect(lock.seq_id).not.toBeNull();
      const permissives = b.interlocks.permissives.filter((p) => p.seq_id === lock.seq_id);
      expect(permissives.length, `${lock.equipment_tag} permissives`).toBeGreaterThan(0);
      const rows = b.interlocks.rows.filter((r) => r.equipment_tag === lock.equipment_tag);
      expect(rows.length, `${lock.equipment_tag} typed rows`).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.row_kind).toBe("trip");
        expect(r.effects.length, `${r.id} effects`).toBeGreaterThan(0);
        expect(r.effects.some((x) => x.marked), `${r.id} marks no effect`).toBe(true);
        expect(r.effects.filter((x) => x.final_element.length === 0)).toEqual([]);
        expect(spans.has(r.span_id), `${r.id} span`).toBe(true);
      }
      for (const p of permissives) expect(spans.has(p.span_id), `${lock.seq_id} permissive ${p.n} span`).toBe(true);
      expect(lock.notes.length, `${lock.equipment_tag} notes`).toBeGreaterThan(0);
      for (const n of lock.notes) expect(spans.has(n.span_id), `${lock.equipment_tag} note ${n.n} span`).toBe(true);
    }
    // 27 of the 29 permissives are reached by the LOGIC No the sheet states; the other two are EA-5601's, keyed by
    // the tag because that sheet states no LOGIC No (see the control-loop case below).
    expect(b.interlocks.permissives.filter((p) => p.seq_id.startsWith("SEQ-"))).toHaveLength(27);
  });

  it("EA-5601 is a control loop: no LOGIC No, no SIL, no trip row, no vote cell, and its trip boilerplate is the CD-17 finding the page prints", () => {
    const b = bundle();
    const lock = b.interlocks.interlocks.find((i) => i.equipment_tag === "EA-5601");
    expect(lock?.logic_kind).toBe("control_loop_only");
    expect(lock?.seq_id).toBeNull();
    expect(lock?.sil_sheet).toBeNull();
    const rows = b.interlocks.rows.filter((r) => r.equipment_tag === "EA-5601");
    expect(rows.map((r) => `${r.row_id} ${r.row_kind} ${r.instrument_tag}`).sort()).toEqual([
      "A1 alarm PDAH-5605",
      "C1 control TIC-5602",
      "R1 mech PSV-5607",
    ]);
    expect(rows.filter((r) => r.voting !== null)).toEqual([]);
    // The sheet still carries the trip boilerplate every sheet carries, which is the contradiction CD-17 records.
    expect(lock?.notes.some((n) => n.text.includes("On any trip the effects marked X"))).toBe(true);
    const equipment = b.interlocks.equipment.find((e) => e.tag === "EA-5601");
    expect(equipment).toBeDefined();
    if (!equipment) return;
    const ids = documentSet(b, equipment);
    const cd17 = (b.integrity?.findings ?? []).filter((f) => f.rule_id === "CD-17" && f.state === "open" && f.document_id !== null && ids.has(f.document_id));
    expect(cd17.map((f) => f.id)).toEqual(["CD-17-001"]);
  });
});

describe.skipIf(skip)("AC-CTX-04: the connector contracts and the empty deep link", () => {
  it("the bundle carries exactly the three connector schemas, each a JSON Schema 2020-12 with an $id", () => {
    const dir = path.join(BUNDLE_DIR, "contracts");
    expect(readdirSync(dir).sort()).toEqual(["aims.schema.json", "edms.schema.json", "historian.schema.json"]);
    for (const file of readdirSync(dir)) {
      const schema: unknown = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
      expect(schema).toMatchObject({ $schema: "https://json-schema.org/draft/2020-12/schema" });
    }
  });

  it("the digital twin row admits an empty deep link and nothing else", () => {
    expect(DigitalTwinRow.parse({ deep_link: "" })).toEqual({ deep_link: "" });
    expect(DigitalTwinRow.safeParse({ deep_link: "https://twin.example/asset/GA-1201A" }).success).toBe(false);
  });

  it("no module builds a connector row, so no mocked connector data can render", () => {
    const scanned = sourceFiles(path.join(ROOT, "src"));
    // The scan reaches the one module that names the three contracts at all (the G1 schema map), so an empty
    // result below is the audit's answer and not an audit that read nothing.
    expect(scanned.map((f) => path.relative(ROOT, f))).toContain(path.join("src", "gates", "g1", "map.ts"));
    const offenders = scanned.filter((file) =>
      /\b(AimsWorkOrderRow|EdmsDocumentRecord|EdmsPublicationHandshake|HistorianReading)\s*\.\s*parse/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("the asset identity panel states the connector status with the fixed wording", () => {
    const page = readFileSync(path.join(ROOT, "src", "app", "(hub)", "assets", "[tag]", "page.tsx"), "utf8");
    expect(page).toContain('<StatusBadge kind="specified_not_connected" />');
    expect(STATUS_WORDING.specified_not_connected).toBe("specified, not connected");
  });
});

describe.skipIf(skip)("AC-CTX-05: the figures the operational-context panel binds to", () => {
  it("recomputes 23 unplanned breakdowns and 8 planned flagged rows, equal to the fixture populations", () => {
    const b = bundle();
    const kinds = (kind: "unplanned" | "planned_flagged"): number => b.failureEvents.filter((e) => e.breakdown_kind === kind).length;
    expect(kinds("unplanned")).toBe(23);
    expect(kinds("planned_flagged")).toBe(8);
    expect(b.fixtures?.populations.unplanned_breakdowns).toBe(kinds("unplanned"));
    expect(b.fixtures?.populations.planned_flagged).toBe(kinds("planned_flagged"));
    expect(b.fixtures?.populations.all).toBe(b.workOrders.length);
  });

  it("recomputes the notification lead time: median 34.0 h, 136 of 211 at 24 h or more, 64.5 percent", () => {
    const b = bundle();
    const lead = b.workOrders.map((w) => w.notification_lead_hours).sort((x, y) => x - y);
    expect(lead).toHaveLength(211);
    const median = lead.length % 2 === 1 ? lead[(lead.length - 1) / 2] : (lead[lead.length / 2 - 1] + lead[lead.length / 2]) / 2;
    const atLeast24 = lead.filter((h) => h >= 24).length;
    expect(median).toBe(34.0);
    expect(atLeast24).toBe(136);
    expect(Math.round((atLeast24 / lead.length) * 1000) / 1000).toBe(0.645);
    expect(b.fixtures?.workbook.lead_time).toMatchObject({ median_h: median, at_least_24h: atLeast24, min_h: lead[0], max_h: lead[lead.length - 1] });
  });

  it("EA-5601 states no protective function: no LOGIC No, no SIL and no trip row anywhere", () => {
    const b = bundle();
    expect(b.interlocks.rows.filter((r) => r.equipment_tag === "EA-5601" && r.row_kind === "trip")).toEqual([]);
    expect(b.interlocks.interlocks.find((i) => i.equipment_tag === "EA-5601")?.sil_sheet).toBeNull();
    expect(b.fixtures?.equipment_master.find((r) => r.tag === "EA-5601")?.sil_sheet ?? null).toBeNull();
  });

  it("no record types a demand, and SEQ-1201's one demand resolves to WO-240003 by the initiator tag", () => {
    const b = bundle();
    // The workbook has no demand column: `related_interlock` names the function a record touches, not a demand on it.
    expect(Object.keys(b.workOrders[0]).filter((k) => k.includes("demand"))).toEqual([]);
    const initiators = new Set(b.interlocks.rows.filter((r) => r.seq_id === "SEQ-1201" && r.row_kind === "trip").map((r) => r.instrument_tag));
    const demands = b.workOrders.filter((w) => {
      if (w.equipment_tag !== "GA-1201A") return false;
      const text = [w.problem_description, w.root_cause, w.corrective_action, w.remarks ?? ""].join(" ");
      return /tripped/i.test(text) && [...initiators].some((t) => text.includes(t));
    });
    expect(demands.map((w) => w.wo_number)).toEqual(["WO-240003"]);
    expect(demands[0].problem_description).toContain("VSHH-1201");
  });
});

// The route audit needs no bundle: it reads the routes of this repository.
describe("AC-CTX-09: the route audit over src/app/api", () => {
  const routes = sourceFiles(path.join(ROOT, "src", "app", "api"))
    .filter((f) => path.basename(f) === "route.ts")
    .map((f) => `/${path.relative(path.join(ROOT, "src", "app"), path.dirname(f))}`);

  it("holds no bulk, archive, zip or download route", () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.filter((r) => /bulk|archive|zip|download|tarball/i.test(r))).toEqual([]);
  });

  it("serves corpus pages one at a time, under ask_read, private and no-store", () => {
    const pageRoutes = routes.filter((r) => /\/pages\//.test(r));
    expect(pageRoutes).toEqual(["/api/documents/[id]/pages/[n]"]);
    const source = readFileSync(path.join(ROOT, "src", "app", "api", "documents", "[id]", "pages", "[n]", "route.ts"), "utf8");
    expect(source).toContain('"ask_read"');
    expect(source).toContain('"cache-control": "private, no-store"');
    // One page per request: the handler reads the one page the path names and returns those bytes.
    expect(source).toContain("getPageDerivative(params.data.id, params.data.n)");
  });
});

describe.skipIf(skip)("AC-CTX-10: the simulated series", () => {
  it("carries a series for no asset but GA-1201A, with the provenance the criterion names when one exists", () => {
    const dir = path.join(BUNDLE_DIR, "simulated");
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
    expect(files.filter((f) => f !== "ga-1201a.json"), "a simulated series for an asset other than GA-1201A").toEqual([]);
    for (const file of files) {
      const series: unknown = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
      expect(series).toMatchObject({ provenance: "SIMULATED", generated_by: "team" });
      expect(series).toHaveProperty("date");
    }
  });

  it("forbids the SIMULATED wording on the KC-4501 ladder and live-reading cases, the assets that carry no series", () => {
    const b = bundle();
    const cases = b.golden ?? [];
    expect(cases.length).toBeGreaterThan(0);
    const forbid = cases.filter((c) => c.expected.must_not_contain.includes(STATUS_WORDING.simulated));
    expect(forbid.map((c) => c.id).sort()).toEqual(["GS-08", "GS-96"]);
    for (const c of forbid) expect(c.input.question).toContain("KC-4501");
    // GS-08 is the live-reading question: it abstains and serves the typed ladder beside the note.
    expect(forbid.find((c) => c.id === "GS-08")?.expected.outcome).toBe("abstention");
  });

  it("lets one case only expect the wording, GS-32 on GA-1201A, and only when the series file exists", () => {
    const b = bundle();
    const expecting = (b.golden ?? []).filter((c) => JSON.stringify(c.checks).includes(STATUS_WORDING.simulated));
    expect(expecting.map((c) => c.id)).toEqual(["GS-32"]);
    const checks = JSON.stringify(expecting[0].checks);
    expect(checks).toContain("bundle/simulated/ga-1201a.json");
    expect(checks).toContain('"when"');
  });
});

/** Every .ts and .tsx file under a directory, skipping the graphify index that carries a copy of the whole tree. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry) && !entry.includes("graphify-out") && !entry.includes(".test."))
    .map((entry) => path.join(dir, entry));
}
