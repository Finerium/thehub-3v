// The six answer-and-loop criteria of blueprint section 11 whose check was missing, each proved from an artefact
// that exists today: the shipped offline export (`deliverables/TheHub_prototype.html`, the file SHA256SUMS.txt
// records), the harness bundle on disk, the pinned embedding model, and the product's own modules. Nothing here
// calls the model provider, opens a database or reaches the network.
//
//   AC-ANS-03  every rendered claim carries a citation chip that states the parsed status and opens the exact
//              revision at the cited page and span. Sampled over the chips the export rendered against the stored
//              citations it embeds beside them, and over the real EvidenceList renderer.
//   AC-ANS-12  semantic search returns OPL-LV-6701-03 for "packing adjustment" with the revision facts and the
//              open defects. The retrieval recipe is replayed off the bundle: the pinned model embeds the query,
//              the served current chunks are ranked by cosine exactly as pgvector orders them, and the citation is
//              built by the product's own citationOf().
//   AC-ANS-20  a spent daily budget cannot break a read-only surface: no surface reaches a module that calls the
//              provider, and neither does the seeded lane. (The route's designed 429 is proved by
//              src/app/api/ask/route.test.ts; this file adds only what that test cannot see.)
//   AC-LOOP-10 the machine-drafted badge names its human approver, in the product and in the export.
//   AC-LOOP-13 the nightly activation restores the seeded version without deleting anything, Home states when it
//              happened, and one visitor's publication stays out of the next visitor's numbers.
//   AC-LOOP-15 POST /api/drafts answers 202 without waiting for the drafting: the pre-response path is a fixed,
//              small number of database statements and no provider call, timed with a measured statement cost.
//
// Two inputs are outside the repository and the cases that need them skip with a message naming what to build:
// the export (gitignored, D-25: `pnpm export:demo`) and the harness bundle with the embedding model
// (HARNESS_BUNDLE, default ../thehub-harness/bundle; `pnpm models:fetch`).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { documentHref } from "@/components/anchor";
import { EvidenceList } from "@/components/EvidenceLine";
import { citationOf } from "@/answer/retrieve";
import { StatusBadge, STATUS_WORDING } from "@/components/StatusBadge";
import { Citation, Claim } from "@/contracts/generated/evidence_packet";
import { V1_LABEL } from "@/db/seed/version";
import { currentRevisionIds, lineageOf } from "@/db/versions";
import { SERVED_APPROVAL_STATUSES } from "@/gates/g2";
import { nextLabel } from "@/gates/g3/version";
import { ENTAILED } from "@/lib/fixed-strings";
import { seededVersionFromBundle, seededVersionId, sha256Hex } from "@/lib/version-id";
import { CLUSTER, CLUSTER_ID, SANDBOX_ID, SANDBOX_ROW, SUPERVISOR, rowOf } from "../fixtures/drafting";
import { queueResult, resetFakeDb, statements } from "../helpers/fake-db-client";
import { setRequest } from "../helpers/next-headers";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

/* Shared readers ------------------------------------------------------------------------------------------------ */

/** The offline export as shipped, or null when it has not been built in this checkout (D-25: it is gitignored). */
function exportHtml(): string | null {
  const file = path.join(ROOT, "deliverables", "TheHub_prototype.html");
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

const NO_EXPORT = "deliverables/TheHub_prototype.html is absent in this checkout; build it with pnpm export:demo (D-25)";

/** The harness bundle, the one place the corpus rows live outside the database (HARNESS_BUNDLE, else the sibling). */
function bundleDir(): string | null {
  const dir = path.resolve(ROOT, process.env.HARNESS_BUNDLE ?? "../thehub-harness/bundle");
  return existsSync(path.join(dir, "manifest.json")) ? dir : null;
}

const NO_BUNDLE = "the harness bundle is absent; pull it beside this repository or set HARNESS_BUNDLE (tests/equality reads the same directory)";

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

/** Every source file of the application, so an audit walks the tree rather than a typed list of surfaces. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "graphify-out" && entry !== "contracts") out.push(...sourceFiles(full));
      continue;
    }
    if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** The `@/` and relative imports of a file, resolved to files on disk; anything else is a package and is ignored. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const specs = [...text.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+["']([^"']+)["']/g)].map((m) => m[1] ?? "");
  const resolved: string[] = [];
  for (const spec of specs) {
    const base = spec.startsWith("@/")
      ? path.join(SRC, spec.slice(2))
      : spec.startsWith(".")
        ? path.resolve(path.dirname(file), spec)
        : null;
    if (base === null) continue;
    const candidate = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")].find((c) => existsSync(c));
    if (candidate !== undefined) resolved.push(candidate);
  }
  return resolved;
}

/** Every module a file reaches, transitively; a module in `cut` is recorded and never walked through. */
function importClosure(entry: string, cut: readonly string[] = []): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    for (const next of importsOf(current)) {
      if (seen.has(next)) continue;
      seen.add(next);
      if (!cut.includes(next)) stack.push(next);
    }
  }
  return seen;
}

/** The visible text of a fragment of rendered HTML: tags out, React's comment markers out, entities back. */
function textOf(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .trim();
}

/* AC-ANS-03 ------------------------------------------------------------------------------------------------------
   "Every rendered claim has at least one citation chip; clicking it opens the exact revision at the cited page and
   span; the chip states the parsed status."

   The export embeds the packets the deployment served (`#x-snapshot`) beside the surfaces the product rendered from
   them, so the two halves can be compared without a database: every chip in the file must state, verbatim, the
   doc_no, revision, parsed approval status and page of the citation whose span it carries, and the span it opens at
   must be the citation's own. The claim half is rendered here through the product's own EvidenceList over citations
   sampled from that stored packet: one chip per citation, the chip's span the cited span, and the viewer target the
   6.2 anchor at the cited page and span. -------------------------------------------------------------------------- */

type ChipFace = { span: string; doc_no: string; revision: string; status: string; page: string; title: string };

/** Every citation chip the export rendered, read off the button the product wrote. */
function chipsIn(html: string): ChipFace[] {
  const chips: ChipFace[] = [];
  for (const match of html.matchAll(/<button[^>]*data-component="citation-chip"[^>]*>([\s\S]*?)<\/button>/g)) {
    const tag = match[0];
    const span = /data-span="([^"]*)"/.exec(tag)?.[1];
    const title = /title="([^"]*)"/.exec(tag)?.[1];
    const part = (cls: string): string | undefined => {
      const found = new RegExp(`<span class="cite-${cls}">([\\s\\S]*?)</span>`).exec(tag);
      return found === null ? undefined : textOf(found[1] ?? "");
    };
    if (span === undefined || title === undefined) continue;
    chips.push({
      span,
      doc_no: part("doc") ?? "",
      revision: (part("rev") ?? "").replace(/^rev\s*/, ""),
      status: part("status") ?? "",
      page: (part("page") ?? "").replace(/^p\.\s*/, ""),
      title: textOf(title),
    });
  }
  return chips;
}

/** The citations of the export's embedded snapshot, keyed by span: the stored packets, traces and typed rows. */
function storedCitations(html: string): Map<string, Citation> {
  const raw = /<script type="application\/json" id="x-snapshot">([\s\S]*?)<\/script>/.exec(html)?.[1];
  const found = new Map<string, Citation>();
  if (raw === undefined) return found;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if ("span_id" in record && "quote_hash" in record && "document_id" in record) {
      const parsed = Citation.safeParse(record);
      if (parsed.success && !found.has(parsed.data.span_id)) found.set(parsed.data.span_id, parsed.data);
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(JSON.parse(raw) as unknown);
  return found;
}

/** The criterion's own sample size. */
const SAMPLE = 10;

describe("AC-ANS-03 citation chips resolve to the cited span and state the parsed status", () => {
  it("every chip the export rendered states the stored citation's doc_no, revision, parsed status and page", (ctx) => {
    const html = exportHtml();
    if (html === null) {
      ctx.skip(NO_EXPORT);
      return;
    }
    const stored = storedCitations(html);
    const chips = chipsIn(html);
    expect(chips.length, "the export rendered no citation chip at all").toBeGreaterThan(0);

    const sampled = chips.filter((chip) => stored.has(chip.span));
    const wrong = sampled.filter((chip) => {
      const citation = stored.get(chip.span);
      if (citation === undefined) return true;
      return (
        chip.doc_no !== citation.doc_no ||
        chip.revision !== citation.revision ||
        chip.status !== citation.approval_status_text ||
        chip.page !== String(citation.page) ||
        !chip.title.includes(citation.doc_no) ||
        !chip.title.includes(`page ${citation.page}`)
      );
    });
    expect(wrong.map((c) => c.span), "chips whose face disagrees with the citation they carry").toEqual([]);
    expect(sampled.length, `chips sampled against a stored citation (${chips.length} rendered, ${stored.size} stored)`).toBeGreaterThanOrEqual(SAMPLE);
  });

  it("a chip opens at the span it carries, and the span belongs to the page the chip states", (ctx) => {
    const html = exportHtml();
    if (html === null) {
      ctx.skip(NO_EXPORT);
      return;
    }
    // The span id is "<revision id>/p<page>/<start>-<end>" for a span-table span, or a chunk id for a chunk that
    // contains none; either way the page inside it is the page the chip claims, so a chip can never open a page
    // other than the one it names.
    const paged = chipsIn(html).filter((chip) => /\/p\d+\//.test(chip.span));
    expect(paged.length, "no chip carried a page-bearing span id").toBeGreaterThanOrEqual(SAMPLE);
    const mismatched = paged.filter((chip) => `p${chip.page}` !== (/\/(p\d+)\//.exec(chip.span)?.[1] ?? ""));
    expect(mismatched.map((c) => `${c.span} on p. ${c.page}`), "chips whose span sits on another page").toEqual([]);
  });

  it(`renders ${SAMPLE} claims through EvidenceList: one chip per citation, at the cited span, opening the cited revision and page`, (ctx) => {
    const html = exportHtml();
    if (html === null) {
      ctx.skip(NO_EXPORT);
      return;
    }
    // One citation per document, so the ten claims sample ten documents and the statuses the corpus actually parsed
    // (an approval stamp, an issue stamp, and the empty text of a revision that carries none) rather than ten spans
    // of one sheet.
    const perDocument = new Map<string, Citation>();
    for (const citation of [...storedCitations(html).values()].sort((a, b) => a.span_id.localeCompare(b.span_id))) {
      if (!perDocument.has(citation.document_id)) perDocument.set(citation.document_id, citation);
    }
    const stored = [...perDocument.values()].slice(0, SAMPLE);
    expect(stored.length, "the export carries fewer documents than the criterion samples claims").toBe(SAMPLE);
    const statuses = new Set(stored.map((c) => c.approval_status_text));
    expect(statuses.size, `the sample covers ${statuses.size} parsed statuses`).toBeGreaterThanOrEqual(3);
    expect([...statuses].filter((text) => text.length > 0).length, "no sampled citation carries a parsed status").toBeGreaterThan(0);

    const claims = stored.map((citation, index) =>
      Claim.parse({
        id: `s${index + 1}`,
        text: `Sampled claim ${index + 1}, cited to one span of the stored packet.`,
        citations: [citation],
        entailment: ENTAILED,
      }),
    );
    // The first clause holds at the contract boundary before it holds on the screen: 9.8 Claim.citations is
    // "at least one", so a packet carrying an uncited claim never parses and nothing uncited reaches the renderer.
    expect(Claim.safeParse({ ...claims[0], citations: [] }).success, "the contract admitted a claim with no citation").toBe(false);

    const rendered = renderToStaticMarkup(createElement(EvidenceList, { claims }));
    const lines = [...rendered.matchAll(/<li[^>]*data-claim="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
    expect(lines.map((l) => l[1]), "one line per claim, in packet order").toEqual(claims.map((c) => c.id));

    for (const [index, line] of lines.entries()) {
      const claim = claims[index];
      const citation = stored[index];
      if (claim === undefined || citation === undefined) throw new Error("sample out of range");
      const chips = chipsIn(line[2] ?? "");
      expect(chips.map((c) => c.span), `${claim.id} carries one chip per citation`).toEqual(claim.citations.map((c) => c.span_id));
      expect(chips[0]?.status, `${claim.id} states the parsed status`).toBe(citation.approval_status_text);
      expect(chips[0]?.doc_no).toBe(citation.doc_no);
      expect(chips[0]?.page).toBe(String(citation.page));
      // What the chip opens: the 6.2 anchor form, the cited document at the cited page and span (src/components/anchor.ts).
      expect(documentHref(citation)).toBe(
        `/documents/${encodeURIComponent(citation.document_id)}?page=${citation.page}&span=${encodeURIComponent(citation.span_id)}#page=${citation.page}&span=${encodeURIComponent(citation.span_id)}`,
      );
    }
  });
});

/* AC-ANS-12 ------------------------------------------------------------------------------------------------------
   "Semantic search returns OPL-LV-6701-03 for 'packing adjustment' with revision facts and any open defect."

   Search mode is retrieval only (ARCHITECTURE 7: steps 1, 3, 5, 6, no provider call), and a question that names no
   tag reads the whole served corpus by its content words (src/answer/scope.ts corpusWide). Both stages are replayed
   here off the bundle the seed loads: the vector stage with the pinned model and the stored chunk embeddings, in the
   order pgvector returns them, and the lexical stage as plainto_tsquery('simple') composes it (every content term
   present, no stemming). ---------------------------------------------------------------------------------------- */

const PACKING_QUERY = "packing adjustment";
const PACKING_LESSON = "OPL-LV-6701-03";

type BundleChunk = { id: string; document_revision_id: string; page: number; unit_kind: string; text: string; quote_hash: string; embedding: number[] };
type BundleRevision = { id: string; document_id: string; revision: string; approval_status: string; approval_status_text: string; is_current: boolean };
type BundleDocument = { id: string; doc_no: string; class: string };
type BundleLesson = { opl_id: string; document_revision_id: string; machine_drafted: boolean; approver_alias: string | null };
type BundleFinding = { document_id: string | null; rule_id: string; state: string };

function readChunks(dir: string): BundleChunk[] {
  return readFileSync(path.join(dir, "chunks.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as BundleChunk);
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (const [index, value] of a.entries()) sum += value * (b[index] ?? 0);
  return sum;
}

describe("AC-ANS-12 semantic search over the seeded corpus", () => {
  const dir = bundleDir();
  const models = existsSync(path.join(ROOT, "models", "Xenova"));

  it(
    `ranks ${PACKING_LESSON} first for "${PACKING_QUERY}" and carries its revision facts and open defects`,
    async (ctx) => {
      if (dir === null) {
        ctx.skip(NO_BUNDLE);
        return;
      }
      if (!models) {
        ctx.skip("the pinned embedding model is absent; run pnpm models:fetch (ADR-009)");
        return;
      }

      const chunks = readChunks(dir);
      const revisions = readJson(path.join(dir, "revisions.json")) as BundleRevision[];
      const documents = readJson(path.join(dir, "documents.json")) as BundleDocument[];
      const lessons = (readJson(path.join(dir, "opls.json")) as { lessons: BundleLesson[] }).lessons;
      const findings = (readJson(path.join(dir, "integrity_findings.json")) as { findings: BundleFinding[] }).findings;

      const revisionById = new Map(revisions.map((r) => [r.id, r] as const));
      const documentById = new Map(documents.map((d) => [d.id, d] as const));
      const lessonOfRevision = new Map(lessons.map((l) => [l.document_revision_id, l.opl_id] as const));
      const lesson = lessons.find((l) => l.opl_id === PACKING_LESSON);
      expect(lesson, `${PACKING_LESSON} is not in the bundle`).toBeDefined();
      if (lesson === undefined) return;

      // The served set of retrieval: the current revisions whose approval status is in the served set (gate C4).
      const served = new Set(SERVED_APPROVAL_STATUSES.map((s) => String(s)));
      const candidates = chunks.filter((chunk) => {
        const revision = revisionById.get(chunk.document_revision_id);
        return revision !== undefined && revision.is_current && served.has(revision.approval_status);
      });
      expect(candidates.length, "the bundle carries no served current chunk").toBeGreaterThan(0);

      // The vector stage: the pinned model embeds the query, the candidates are ordered by cosine (both vectors are
      // L2-normalised, so the dot product is the cosine pgvector orders by).
      const { embed } = await import("@/gateway/embedding");
      const [queryVector] = await embed([PACKING_QUERY], "query");
      expect(queryVector, "the embedding role returned no vector").toBeDefined();
      if (queryVector === undefined) return;
      const ranked = candidates
        .map((chunk) => ({ chunk, cosine: cosine(queryVector, chunk.embedding) }))
        .sort((a, b) => b.cosine - a.cosine);

      const top = ranked[0];
      expect(top, "nothing ranked").toBeDefined();
      if (top === undefined) return;
      expect(lessonOfRevision.get(top.chunk.document_revision_id), `the nearest chunk to "${PACKING_QUERY}"`).toBe(PACKING_LESSON);
      // The whole head of the ranking is the lesson: a single lucky chunk would not carry the answer.
      expect(
        ranked.slice(0, 4).map((r) => lessonOfRevision.get(r.chunk.document_revision_id) ?? r.chunk.document_revision_id),
        "the four nearest chunks",
      ).toEqual([PACKING_LESSON, PACKING_LESSON, PACKING_LESSON, PACKING_LESSON]);

      // The lexical stage, plainto_tsquery('simple'): every content term of the query present in the chunk, no
      // stemming. It selects the same lesson and nothing else, so the reranked head cannot come from elsewhere.
      const terms = PACKING_QUERY.split(/\s+/);
      const lexical = candidates.filter((chunk) => terms.every((term) => chunk.text.toLowerCase().includes(term)));
      expect(new Set(lexical.map((c) => lessonOfRevision.get(c.document_revision_id))), "the lexical hits").toEqual(new Set([PACKING_LESSON]));

      // The revision facts and the open defects the citation carries, built by the product's own citationOf().
      const revision = revisionById.get(lesson.document_revision_id);
      expect(revision, `${PACKING_LESSON} has no revision row`).toBeDefined();
      if (revision === undefined) return;
      const document = documentById.get(revision.document_id);
      expect(document?.doc_no).toBe(PACKING_LESSON);
      const open = [...new Set(findings.filter((f) => f.document_id === revision.document_id && f.state === "open").map((f) => f.rule_id))].sort();
      expect(open.length, `${PACKING_LESSON} carries no open finding, so "any open defect" has no subject`).toBeGreaterThan(0);

      const citation = Citation.parse(
        citationOf(
          {
            docNo: document?.doc_no ?? null,
            documentId: revision.document_id,
            revision: revision.revision,
            approvalStatus: revision.approval_status as Citation["approval_status"],
            approvalStatusText: revision.approval_status_text,
            isCurrent: revision.is_current,
            page: top.chunk.page,
            spanId: top.chunk.id,
            quoteHash: top.chunk.quote_hash,
          },
          open,
        ),
      );
      expect(citation).toMatchObject({
        doc_no: PACKING_LESSON,
        revision: revision.revision,
        approval_status: revision.approval_status,
        approval_status_text: revision.approval_status_text,
        superseded: false,
        integrity_findings: open,
      });
    },
    180_000,
  );
});

/* AC-ANS-20 ------------------------------------------------------------------------------------------------------
   "The live-budget-exhausted state is a golden case: when the daily cap is reached the ask surface renders the
   designed state, the seeded chips and every read-only surface keep working."

   The designed 429 and the untouched seeded path are proved at the route (src/app/api/ask/route.test.ts) and the cap
   itself in src/gateway/budget.test.ts. What neither can see is the clause about every other surface: a surface that
   cannot reach a provider-calling module cannot be affected by a spent budget at all. That is what this audit
   states, over the module graph rather than over a list of surfaces. ------------------------------------------- */

/** The modules that call the provider through the gateway: everything else is provider-free by construction. */
const PROVIDER_CALLERS = ["answer/compose.ts", "answer/verify.ts", "loop/draft.ts", "loop/redline.ts"].map((rel) => path.join(SRC, rel));

describe("AC-ANS-20 a spent daily budget leaves every read-only surface working", () => {
  it("no page or client surface reaches a module that calls the provider", () => {
    for (const file of PROVIDER_CALLERS) expect(existsSync(file), `${file} moved; the audit's target set is stale`).toBe(true);
    const surfaces = sourceFiles(path.join(SRC, "app")).filter((f) => f.endsWith("page.tsx") || f.endsWith("Client.tsx"));
    expect(surfaces.length, "no surface was scanned").toBeGreaterThan(10);

    const reaching = surfaces
      .map((surface) => ({ surface, hits: PROVIDER_CALLERS.filter((caller) => importClosure(surface).has(caller)) }))
      .filter((row) => row.hits.length > 0)
      .map((row) => `${path.relative(ROOT, row.surface)} -> ${row.hits.map((h) => path.relative(SRC, h)).join(", ")}`);
    expect(reaching, "a surface that would break with the provider refused").toEqual([]);
  });

  it("the seeded lane reaches no provider-calling module either, so a seeded chip answers on a spent day", () => {
    const closure = importClosure(path.join(SRC, "answer", "seeded.ts"));
    closure.add(path.join(SRC, "answer", "seeded.ts"));
    expect(PROVIDER_CALLERS.filter((caller) => closure.has(caller)), "the seeded lane can reach the provider").toEqual([]);
  });
});

/* AC-LOOP-10 -----------------------------------------------------------------------------------------------------
   "Machine-drafted label with the approver alias shows in product, in the PDF export (if built) and in the HTML
   export."

   No lesson PDF export is built, which the criterion allows for. The badge itself is one component (6.4
   StatusBadge), so the wording and the alias are pinned there; the surfaces are audited for the one mistake that
   would hide the approver, which is reading a lesson's machine_drafted field without passing its approver_alias;
   and the export is audited for a machine-drafted lesson shipped without its approver. ------------------------- */

const APPROVED_BY = "approved by";

describe("AC-LOOP-10 the machine-drafted badge names its approver", () => {
  it("renders the fixed wording with the alias beside it, and never the words without one", () => {
    const withAlias = renderToStaticMarkup(createElement(StatusBadge, { kind: "machine_drafted", approverAlias: "APR-01" }));
    expect(textOf(withAlias)).toBe(`${STATUS_WORDING.machine_drafted}${APPROVED_BY} APR-01`);
    expect(withAlias).toContain('data-status="machine_drafted"');

    const without = renderToStaticMarkup(createElement(StatusBadge, { kind: "machine_drafted" }));
    expect(textOf(without)).toBe(STATUS_WORDING.machine_drafted);
    expect(without.toLowerCase()).not.toContain(APPROVED_BY);
  });

  it("every surface that reads a lesson's machine_drafted field passes its approver alias to the badge", () => {
    const surfaces = sourceFiles(path.join(SRC, "app")).concat(sourceFiles(path.join(SRC, "components")));
    const sites: string[] = [];
    const missing: string[] = [];
    for (const file of surfaces) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/\.machine_?[dD]rafted\b/g)) {
        const where = `${path.relative(ROOT, file)}:${text.slice(0, match.index).split("\n").length}`;
        sites.push(where);
        if (!text.slice(match.index, match.index + 400).includes("approverAlias")) missing.push(where);
      }
    }
    expect(sites.length, "no surface reads a lesson's machine_drafted field; the audit has lost its subject").toBeGreaterThan(0);
    expect(missing, "a machine-drafted lesson rendered without its approver alias").toEqual([]);
  });

  it("the export ships no machine-drafted lesson without its approver, and states why it ships none", (ctx) => {
    const html = exportHtml();
    if (html === null) {
      ctx.skip(NO_EXPORT);
      return;
    }

    // Every lesson the export carries, wherever it sits in the snapshot (a packet's lessons block, an asset panel).
    const raw = /<script type="application\/json" id="x-snapshot">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "{}";
    const lessons: Array<{ opl_id?: unknown; machine_drafted: boolean; approver_alias?: unknown }> = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return void node.forEach(walk);
      if (node === null || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (typeof record.machine_drafted === "boolean") lessons.push({ opl_id: record.opl_id, machine_drafted: record.machine_drafted, approver_alias: record.approver_alias });
      for (const value of Object.values(record)) walk(value);
    };
    walk(JSON.parse(raw) as unknown);

    const unnamed = lessons.filter((l) => l.machine_drafted && typeof l.approver_alias !== "string");
    expect(unnamed, "a machine-drafted lesson shipped in the export without an approver alias").toEqual([]);
    for (const lesson of lessons.filter((l) => l.machine_drafted)) {
      expect(html, `the export renders ${String(lesson.opl_id)} without "${APPROVED_BY} ${String(lesson.approver_alias)}"`).toContain(
        `${APPROVED_BY} ${String(lesson.approver_alias)}`,
      );
    }

    // Why the file shows none today: a publication lives in the visitor's own corpus version (D-16), which the
    // export's build-time session never sees, and no lesson of the seeded corpus is machine-drafted. The bundle is
    // the record of that, so the claim is read rather than asserted from memory.
    const dir = bundleDir();
    if (dir === null) return;
    const corpus = (readJson(path.join(dir, "opls.json")) as { lessons: BundleLesson[] }).lessons;
    expect(corpus.length, "the bundle carries no lesson").toBeGreaterThan(0);
    expect(corpus.filter((l) => l.machine_drafted).map((l) => l.opl_id), "a seeded lesson claims to be machine-drafted").toEqual([]);
    expect(corpus.filter((l) => typeof l.approver_alias !== "string").map((l) => l.opl_id), "a seeded lesson names no approver").toEqual([]);
  });
});

/* AC-LOOP-13 -----------------------------------------------------------------------------------------------------
   "The nightly activation restores the seeded version without deleting anything; the home page shows the time of the
   last activation; the per-session sandbox keeps one visitor's publication out of the next visitor's numbers."

   The transaction itself is proved in src/db/versions.test.ts and the sandbox predicate in src/loop/scope.test.ts
   and src/auth/sandbox.test.ts. What was missing is the walk that ties them together over one publication, the id
   the job asserts (the run of 2026-09-06 asserted a version the deployment no longer held), and the activation line
   the criterion asks Home for, read off the surface the export shipped. ----------------------------------------- */

describe("AC-LOOP-13 the nightly activation restores the seeded version", () => {
  const SEEDED = "cv-seeded";
  const revisions = [
    { id: "rev-a1", documentId: "doc-a", corpusVersionId: SEEDED, revision: "1" },
    { id: "rev-b1", documentId: "doc-b", corpusVersionId: SEEDED, revision: "1" },
  ];

  it("re-marks the seeded revisions current and leaves a visitor's published revision in place, out of the count", () => {
    // One visitor publishes: G3 cuts a child version (never active) and writes the lesson's revision into it.
    const child = { id: "cv-child", label: nextLabel([V1_LABEL]), parentVersionId: SEEDED };
    expect(child.label).toBe("v2");
    const published = { id: "rev-c1", documentId: "doc-lesson", corpusVersionId: child.id, revision: "1" };
    const all = [...revisions, published];

    // The visitor sees the lineage plus their own version; the next visitor sees the lineage alone.
    const rows = [
      { id: SEEDED, parentVersionId: null },
      { id: child.id, parentVersionId: SEEDED },
    ];
    const mine = lineageOf(rows, child.id);
    const theirs = lineageOf(rows, SEEDED);
    expect(mine).toEqual([child.id, SEEDED]);
    expect(theirs).toEqual([SEEDED]);
    expect(currentRevisionIds(all, mine)).toEqual(["rev-a1", "rev-b1", "rev-c1"]);
    expect(currentRevisionIds(all, theirs), "the next visitor's numbers carry the publication").toEqual(["rev-a1", "rev-b1"]);

    // The nightly re-asserts the seeded version: the same lineage rule, so the published revision stays a row and is
    // merely not current. Nothing in the walk removes it.
    expect(all.map((r) => r.id), "a revision disappeared").toContain(published.id);
  });

  it("asserts the version id the seed writes for the bundle in this checkout", () => {
    const seeded = seededVersionFromBundle(path.join(ROOT, "bundle"));
    expect(seeded.id, "the nightly's id rule and the seed's rule have drifted apart").toBe(
      seededVersionId(seeded.manifest.bundle_version, seeded.manifest_sha256),
    );
    expect(seeded.manifest_sha256).toBe(sha256Hex(readFileSync(path.join(ROOT, "bundle", "manifest.json"))));
    expect(seeded.id).toMatch(/^cv-\d+\.\d+\.\d+-[0-9a-f]{12}$/);
    // The workflow prefers this derivation and keeps the v0 rule only for a checkout without a manifest.
    const nightly = readFileSync(path.join(ROOT, ".github", "workflows", "nightly.yml"), "utf8");
    expect(nightly).toContain("pnpm exec tsx scripts/seeded-version-id.ts");
    expect(existsSync(path.join(ROOT, "bundle", "manifest.json")), "the v0 fallback would be taken").toBe(true);
  });

  it("Home states when the active version was activated, and by whom: the export's own render says so", (ctx) => {
    const html = exportHtml();
    if (html === null) {
      ctx.skip(NO_EXPORT);
      return;
    }
    const line = /<dt>Activated<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/.exec(html)?.[1];
    expect(line, "the corpus card shows no activation line").toBeDefined();
    expect(textOf(line ?? "")).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC by \S+$/);
  });
});

/* AC-LOOP-15 -----------------------------------------------------------------------------------------------------
   "POST /api/drafts returns 202 within 2 s (instrument-validated); the work completes within the invocation; a draft
   whose lease expires moves to blocked with deadline_exceeded and is re-proposable."

   The lease and the re-proposal are proved in src/loop/lease.test.ts and the repropose route's tests; the 202 body
   and the handing of the drafting to `after` in src/app/api/drafts/route.test.ts. The bound had no instrument. Here
   the handler runs against a database that charges every statement the cost measured on the deployment
   (/api/health, two statements and the network, answered between 128 ms and 340 ms on 2026-09-08 from a developer
   machine: 170 ms per statement, the worst of those halved), so the measurement moves with the number of statements
   the route makes and a fifth read, or an awaited drafting call, breaks the bound. ------------------------------ */

/** The measured cost charged to every database statement on the pre-response path (ms). */
const STATEMENT_MS = 170;
/** ADR-004 and the criterion: the response is due inside two seconds. */
const BOUND_MS = 2_000;

const scheduler = vi.hoisted(() => ({ after: vi.fn() }));
const drafter = vi.hoisted(() => ({ runDraft: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: scheduler.after }));
vi.mock("@/loop/draft", () => ({ runDraft: drafter.runDraft, HOUSE_TEMPLATE: {} }));

// The fake client of tests/helpers, with every awaited statement charged the measured cost. The chain records and
// settles exactly as it does elsewhere; only the wall clock changes.
vi.mock("@/db/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("../helpers/fake-db-client")>();
  type Settle = (resolve: (value: unknown) => void, reject: (error: unknown) => void) => void;
  const slow = (target: object): object =>
    new Proxy(target, {
      get(_t, prop) {
        const value = Reflect.get(target, prop) as unknown;
        if (prop === "then") {
          const settle = value as Settle;
          return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
            setTimeout(() => settle(resolve, reject), STATEMENT_MS);
          };
        }
        return typeof value === "function"
          ? (...args: unknown[]) => slow((value as (...a: unknown[]) => object)(...args))
          : value;
      },
    });
  return { ...real, db: slow(real.db as object) };
});

describe("AC-LOOP-15 POST /api/drafts answers 202 inside the bound", () => {
  beforeEach(() => {
    resetFakeDb();
    scheduler.after.mockReset();
    drafter.runDraft.mockReset();
    drafter.runDraft.mockResolvedValue(undefined);
  });

  it(`answers 202 in under ${BOUND_MS} ms with every statement charged ${STATEMENT_MS} ms, and hands the drafting on`, async () => {
    const { POST } = await import("@/app/api/drafts/route");
    const { NextRequest } = await import("next/server");
    const { SANDBOX_COOKIE, SESSION_COOKIE, signSessionId } = await import("@/auth/cookie");

    setRequest({
      cookies: { [SESSION_COOKIE]: signSessionId(SUPERVISOR.sessionId), [SANDBOX_COOKIE]: SANDBOX_ID },
      headers: { "x-request-id": "req-loop-15", "x-request-path": "/api/drafts" },
    });
    queueResult([SUPERVISOR]);
    queueResult([{ count: 1, windowStart: new Date("2026-09-08T10:00:00.000Z") }]);
    queueResult([SANDBOX_ROW]);
    queueResult([rowOf(CLUSTER)]);
    queueResult([{ oplId: "OPL-GA-9901A-01" }]);

    const request = new NextRequest("http://localhost/api/drafts", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "req-loop-15" },
      body: JSON.stringify({ cluster_id: CLUSTER_ID }),
    });
    const started = performance.now();
    const response = await POST(request, undefined);
    const elapsed = performance.now() - started;

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ state: "proposed" });
    expect(elapsed, `202 in ${Math.round(elapsed)} ms over ${statements.length} statements`).toBeLessThan(BOUND_MS);
    // The drafting is scheduled, never awaited: the response exists before runDraft has run at all (ADR-004).
    expect(scheduler.after).toHaveBeenCalledTimes(1);
    expect(drafter.runDraft).not.toHaveBeenCalled();
    // The bound is the statement count times the measured cost, so it is the count that must not grow.
    expect(statements.length * STATEMENT_MS, `${statements.length} statements at ${STATEMENT_MS} ms`).toBeLessThan(BOUND_MS);
  });

  it("reaches no provider-calling module except the drafting the response schedules", () => {
    // src/loop/draft.ts is the drafting itself, handed to `after` and never awaited, so the walk stops there: what
    // it reaches runs behind the 202. Any other provider caller would sit on the path the 202 waits for.
    const drafting = path.join(SRC, "loop", "draft.ts");
    const closure = importClosure(path.join(SRC, "app", "api", "drafts", "route.ts"), [drafting]);
    const ahead = PROVIDER_CALLERS.filter((caller) => caller !== drafting && closure.has(caller));
    expect(ahead.map((f) => path.relative(SRC, f)), "a provider call sits on the pre-response path").toEqual([]);
  });
});
