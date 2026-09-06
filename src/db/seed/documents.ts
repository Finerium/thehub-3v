// Family: area_aliases.json, documents.json, revisions.json (blueprint 9.2 and 9.3 Area). The eight M0 P&ID
// document rows carry the same "doc-" + sha256[0:12] ids, so they are upserted, not duplicated. Revisions bind to
// the seeded version id (the bundle carries the label "v1" as a placeholder). is_current is written per the bundle
// in two steps (clear the bundle's documents, then set the bundle's current ids) so the partial unique index
// one_current_revision never sees two current rows mid-statement; activation re-derives it from the lineage rule.
import { inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { area, documentRevision, documentTable } from "@/db/schema";
import type { Bundle } from "@/gates/g1";
import { upsert, type FamilyResult } from "./upsert";

export async function seedDocuments(tx: Tx, b: Bundle, versionId: string): Promise<FamilyResult> {
  const areas = await upsert(
    tx,
    area,
    b.areas.map((a) => ({
      code: a.code,
      workbookName: a.workbook_name,
      datasheetName: a.datasheet_name,
      oplHeaderName: a.opl_header_name,
      plotPlanTitleName: a.plot_plan_title_name,
    })),
    [area.code],
  );
  const documents = await upsert(
    tx,
    documentTable,
    b.documents.map((d) => ({
      id: d.id,
      docNo: d.doc_no,
      class: d.class,
      subjectTag: d.subject_tag,
      sha256: d.sha256,
      sourcePath: d.source_path,
      pageCount: d.page_count,
      fileMarker: d.file_marker,
    })),
    [documentTable.id],
  );
  const revisions = await upsert(
    tx,
    documentRevision,
    b.revisions.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      revision: r.revision,
      approvalStatus: r.approval_status,
      approvalStatusText: r.approval_status_text,
      revisionDate: r.revision_date,
      preparedByAlias: r.prepared_by_alias,
      reviewedByAlias: r.reviewed_by_alias,
      approvedByAlias: r.approved_by_alias,
      dateOfSharing: r.date_of_sharing,
      isCurrent: false,
      corpusVersionId: versionId,
    })),
    [documentRevision.id],
  );
  const documentIds = b.documents.map((d) => d.id);
  const currentIds = b.revisions.filter((r) => r.is_current).map((r) => r.id);
  if (documentIds.length > 0) {
    await tx.update(documentRevision).set({ isCurrent: false }).where(inArray(documentRevision.documentId, documentIds));
  }
  if (currentIds.length > 0) {
    await tx.update(documentRevision).set({ isCurrent: true }).where(inArray(documentRevision.id, currentIds));
  }
  return { rows: { area: areas, document: documents, document_revision: revisions } };
}
