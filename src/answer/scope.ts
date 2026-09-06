// Scope resolution (ARCHITECTURE 7 step 5; blueprint 8.4 "resolve scope from tag mentions and the graph
// neighbourhood"; AC-ANS-01): deterministic, from the seeded asset master and nothing else. Equipment tags,
// instrument tags and area aliases are matched in the canonical question; an instrument tag binds its asset and
// its source documents; an area alias binds every asset of the area; the assets' documents come from document.
// subject_tag and the equipment row's typed references, plus one hop through document_edge that never crosses to
// another asset (a target with a foreign subject_tag is not admitted). A failure family joins the scope only when
// the question names it (its id or its label), and the basis line says so, which is the one way a GA-1201A question
// reaches an LV-6701 document. Every step writes one basis line; the trace carries them all.
import { z } from "zod";
import { visibleVersionIds, type Sandbox } from "@/auth/sandbox";
import type { Db } from "@/db/client";
import * as q from "@/db/queries/retrieval";
import { canonical } from "@/lib/canonical";
import { familyLinkBasis } from "@/lib/fixed-strings";
import { fixtures } from "@/lib/fixtures";
import { tagsIn, tokens } from "@/rulepack";
import { Scope } from "./types";

export type SandboxLike = Pick<Sandbox, "corpusVersionId"> | null;

// D-19: the one stop list of the product lives in fixtures.method.stop_list; both lanes read it from the fixture.
const StopListFixture = z.looseObject({ method: z.looseObject({ stop_list: z.array(z.string()) }) });

let stopWords: Set<string> | null = null;

/** The 65-word stop list of the coverage recipe (blueprint 9.5, D-19), lower case. */
export function stopList(): Set<string> {
  if (stopWords) return stopWords;
  if (fixtures === null) throw new Error("fixtures.json is not readable in this runtime; the stop list (D-19) is unavailable");
  stopWords = new Set(StopListFixture.parse(fixtures).method.stop_list.map((w) => w.toLowerCase()));
  return stopWords;
}

/** The question's content terms, lower case, in order, without duplicates: tokens minus the stop list. */
export function contentTerms(question: string): string[] {
  const stop = stopList();
  const out: string[] = [];
  for (const t of tokens(canonical(question))) if (!stop.has(t) && !out.includes(t)) out.push(t);
  return out;
}

/** The tags written in the question, case-insensitive, upper case, without duplicates, in order. */
export function questionTags(question: string): string[] {
  return [...new Set(tagsIn(canonical(question).toUpperCase()))];
}

/** "GA-1201A" -> "GA-1201": the tag without its suffix letter, for the nearest-asset hint. */
function stem(tag: string): string {
  return tag.replace(/[A-Z]$/, "");
}

/**
 * Equipment tags that share a stem with a tag the question names but the master lacks (GA-1201B -> GA-1201A):
 * never added to the scope, offered to an abstention as the nearest same-asset documents (AC-ANS-06).
 */
export function nearestAssetTags(question: string, equipmentTags: readonly string[]): string[] {
  const known = new Set(equipmentTags);
  const out: string[] = [];
  for (const tag of questionTags(question)) {
    if (known.has(tag)) continue;
    for (const e of equipmentTags) if (stem(e) === stem(tag) && !out.includes(e)) out.push(e);
  }
  return out;
}

function pushUnique(list: string[], value: string): boolean {
  if (list.includes(value)) return false;
  list.push(value);
  return true;
}

export async function resolveScope(db: Db, question: string, sandbox: SandboxLike): Promise<Scope> {
  const text = canonical(question);
  const lower = text.toLowerCase();
  const toks = tokens(text);
  const found = questionTags(question);
  const master = await q.assetMaster(db);
  const equipmentByTag = new Map(master.equipment.map((e) => [e.tag, e] as const));
  const instrumentByTag = new Map(master.instruments.map((i) => [i.tag, i] as const));

  const tags: string[] = [];
  const instrumentTags: string[] = [];
  const documentIds: string[] = [];
  const familyIds: string[] = [];
  const basis: string[] = [];

  // 1. Equipment tags named in the question.
  for (const tag of found) {
    if (equipmentByTag.has(tag) && pushUnique(tags, tag)) basis.push(`equipment tag ${tag} named in the question`);
  }

  // 2. Instrument tags named in the question bind their asset and their source documents.
  for (const tag of found) {
    const row = instrumentByTag.get(tag);
    if (!row) continue;
    pushUnique(instrumentTags, tag);
    const bound = pushUnique(tags, row.equipmentTag);
    basis.push(`instrument tag ${tag} (${row.role}) named in the question${bound ? ` binds ${row.equipmentTag}` : ""}`);
    for (const id of row.sources) if (pushUnique(documentIds, id)) basis.push(`instrument_tag.sources of ${tag}: ${id}`);
  }

  // 3. Area aliases (9.3 Area: the four names an area carries) bind every asset of the area.
  const areaWord = toks.includes("area") || toks.includes("unit");
  for (const a of master.areas) {
    const names = [a.workbookName, a.datasheetName, a.oplHeaderName, a.plotPlanTitleName];
    const alias = names.find((n) => n.length > 0 && lower.includes(n.toLowerCase())) ?? (areaWord && toks.includes(a.code) ? a.code : null);
    if (alias === null) continue;
    const members = master.equipment.filter((e) => e.areaCode === a.code).map((e) => e.tag);
    const added = members.filter((t) => pushUnique(tags, t));
    basis.push(`area alias "${alias}" names area ${a.code}: ${members.join(", ")}${added.length === 0 ? " (already in scope)" : ""}`);
  }

  // 4. A failure family only when the question names it; labelled as the link it is (AC-ANS-01).
  const families = await q.familiesAll(db);
  const named = families.filter((f) => lower.includes(f.id.toLowerCase()) || (f.label.length > 0 && lower.includes(f.label.toLowerCase())));
  if (named.length > 0) {
    const memberWos = named.flatMap((f) => f.members.map((m) => m.wo_number));
    const memberTags = await q.equipmentTagsOfWorkOrders(db, memberWos);
    for (const f of named) {
      familyIds.push(f.id);
      const wos = new Set(f.members.map((m) => m.wo_number));
      const fTags = [...new Set(memberTags.filter((m) => wos.has(m.woNumber)).map((m) => m.equipmentTag))].sort();
      for (const t of fTags) pushUnique(tags, t);
      basis.push(familyLinkBasis(f.id, f.label, fTags));
    }
  }

  if (tags.length === 0 && documentIds.length === 0) {
    const nearest = nearestAssetTags(question, [...equipmentByTag.keys()]);
    if (nearest.length > 0) basis.push(`no equipment tag matched; nearest by tag stem: ${nearest.join(", ")} (not added to the scope)`);
    else basis.push("no equipment tag, instrument tag, area alias or family matched");
    return Scope.parse({ tags, instrument_tags: instrumentTags, document_ids: [], revision_ids: [], basis, family_ids: familyIds });
  }

  // 5. The assets' documents: subject_tag in the tags, or doc_no among the equipment rows' typed references.
  const docNos = tags.flatMap((t) => {
    const e = equipmentByTag.get(t);
    return e ? [e.datasheetDocNo, e.gaDrawingDocNo, e.plotPlanDocNo, e.ceDocNo] : [];
  });
  const pids = tags.map((t) => equipmentByTag.get(t)?.pidDocumentId).filter((id): id is string => typeof id === "string");
  const direct = await q.documentsOfTags(db, tags, docNos);
  const byId = new Map(direct.map((d) => [d.id, d] as const));
  for (const d of await q.documentsByIds(db, [...pids, ...documentIds])) byId.set(d.id, d);
  for (const id of [...byId.keys()].sort()) pushUnique(documentIds, id);
  if (direct.length > 0) basis.push(`documents of ${tags.join(", ")} by subject_tag and typed references: ${direct.length}`);

  // 6. One hop through document_edge, never into another asset's documents.
  const tagSet = new Set(tags);
  for (const e of await q.edgesFrom(db, documentIds)) {
    if (e.toSubjectTag !== null && !tagSet.has(e.toSubjectTag)) continue;
    if (pushUnique(documentIds, e.toDocumentId)) basis.push(`document_edge ${e.edgeKind} from ${e.fromDocumentId} to ${e.toDocumentId}`);
  }
  documentIds.sort();

  // 7. The current revisions of those documents inside the versions this visitor sees (section 8.5).
  const visible = await visibleVersionIds(sandbox);
  const revisions = await q.revisionsOf(db, documentIds, visible, false);
  const revisionIds = revisions.map((r) => r.id).sort();
  basis.push(`current revisions in versions ${visible.join(", ")}: ${revisionIds.length}`);

  return Scope.parse({ tags, instrument_tags: instrumentTags, document_ids: documentIds, revision_ids: revisionIds, basis, family_ids: familyIds });
}
