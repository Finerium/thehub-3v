// What the answer lane does with a classification: the refusal route text of 9.10 with its slots bound from the
// protective row, and the documented-bypass entity resolved to its lesson by the asset in scope (rulepack/README.md:
// "classify reports the entity string; the application resolves the row by the asset in scope").
import type { DocumentedBypassEntity, ProtectiveRow, RulePack } from "./load";
import type { Classification } from "./matcher";

// Fixed wordings of the slot fill. The sheet header writes "SIL n" or "N/A (control loop only)"; no supplied
// document names the permit's approving role, and the pack's three routing texts carry no route for a defeat whose
// function the request does not name, so that one is pinned here.
export const SIL_NOT_APPLICABLE = "SIL N/A, control loop only";
export const ROUTE_TEXT_NO_FUNCTION =
  "The Hub does not provide procedures to defeat or change a protective function. Name the SEQ or the instrument tag to see the governing cause-and-effect sheet, its LOGIC No and SIL, the documented start permissives and the latched-reset note. A temporary bypass runs through an interlock bypass or override permit, time-boxed, with compensating measures and an entry in the bypass register; a permanent change goes through Management of Change.";
// The relief tokens among generic_protective_tokens ("psv", "relief device(s)", "relief valve(s)", "safety valve(s)")
// and every PSV tag, whose prefix is "psv".
const RELIEF_PREFIXES = ["psv", "relief ", "safety valve"] as const;

/** The protective_vocabulary row a classification names (seq_id, or equipment_tag of a control-loop-only sheet). */
export function protectiveRow(pack: RulePack, key: string | null): ProtectiveRow | null {
  if (key === null) return null;
  return pack.protective_vocabulary.find((r) => (r.seq_id ?? r.equipment_tag) === key) ?? null;
}

/** Whether a classification's entity is a relief device token, which selects the relief_device route. */
export function isReliefToken(entity: string | null): boolean {
  return entity !== null && RELIEF_PREFIXES.some((p) => entity.startsWith(p));
}

function fill(template: string, slots: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, name: string) => slots[name] ?? m);
}

/** The route text of a refusal: null unless the class is defeat or permanent_change. */
export function routingText(pack: RulePack, c: Classification): string | null {
  if (c.intent_class !== "defeat" && c.intent_class !== "permanent_change") return null;
  if (isReliefToken(c.entity)) {
    const device = (c.entity ?? "").replace(/^psv(-[a-z0-9]+)?/, (m) => m.toUpperCase());
    return fill(pack.routing_text.relief_device, { device });
  }
  const row = protectiveRow(pack, c.protective_function);
  if (row === null) return ROUTE_TEXT_NO_FUNCTION;
  return fill(pack.routing_text[c.intent_class], {
    function: row.seq_id ?? row.equipment_tag,
    sil: row.sil === null ? SIL_NOT_APPLICABLE : `SIL ${row.sil}`,
    permissives: row.permissives.map((p) => `${p.n}. ${p.text}`).join("; "),
    reset_note: row.reset_note ?? "",
    sheet: row.ce_doc_no,
  });
}

/**
 * The documented_bypass_entities rows for an entity, narrowed to the rows whose equipment_tag is in the asset scope
 * when any is ("car-seal" binds to OPL-FA-8901-02 or OPL-EA-5601-07 by the asset in scope). More than one row back
 * means the lesson is not resolved; the lane decides what to serve.
 */
export function entityRows(pack: RulePack, entity: string, scopeTags: readonly string[] = []): DocumentedBypassEntity[] {
  const rows = pack.documented_bypass_entities.filter((e) => e.entity === entity);
  const inScope = rows.filter((e) => scopeTags.includes(e.equipment_tag));
  return inScope.length > 0 ? inScope : rows;
}
