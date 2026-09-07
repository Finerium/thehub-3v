// Surface 12, the tour (blueprint 6.2 surface 12, 7.2 expressive; AC-UI-04). Under D-07 the deployment is fully
// behind login and no signed reviewer link exists, so `/tour/:token` is not built and this route is the post-login
// landing (ARCHITECTURE 5): the six Expected Solution components in order, each linking to the surface it names,
// ending on the guided loop route. The Reviewer mode banner is rendered nowhere in this build because no reviewer
// session can exist.
//
// Every figure and every target on this sheet is read at request time from the seeded database: the corpus
// version and its digest, the file and class counts, the P&ID that carries a transcribed sidecar, the newest
// answer trace when one exists, the asset the walk hands over, and that asset's causal links. Nothing is typed and
// no target is guessed: a step whose target does not exist yet says what it would open and points at the surface
// that reaches it.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { CSSProperties } from "react";
import { desc, eq, sql } from "drizzle-orm";
import { getSandbox } from "@/auth/sandbox";
import { requireSession } from "@/auth/session";
import { TAGLINE } from "@/auth/copy";
import { DesignedState } from "@/components/DesignedState";
import { GlassPanel } from "@/components/GlassPanel";
import { TourStep, type TourFact } from "@/components/TourStep";
import { VersionBadge } from "@/components/VersionBadge";
import { db } from "@/db/client";
import { readLoopView } from "@/db/queries/loop-view";
import { answerTrace, causalLink, corpusVersion, documentRevision, documentTable, equipment, pidSidecar } from "@/db/schema";
import { log } from "@/lib/log";

export const metadata: Metadata = { title: "Tour" };

// Every figure binds to the database at request time (blueprint 10.3); nothing here is prerendered.
export const dynamic = "force-dynamic";

const TOUR_ROUTE = "/tour";
const LOOP_ROUTE = "/demo/loop";
const DIGEST_PREFIX = 8;

const TITLE = "The first ninety seconds";
const LEAD =
  "Six steps, in the order of the Expected Solution. Each opens the surface it names, and each stands on figures read from the corpus at the moment this page rendered. The walk ends where the corpus grows.";
const CORPUS = "Active corpus";
const CLOSING_TITLE = "Then watch the corpus grow";
const CLOSING_BODY =
  "The guided loop walks one uncovered record from an abstention to a published lesson: request, draft, redline, review, publish, then the same question again. It runs on this browser's sandbox, so the corpus version it creates is never activated and no other visitor's numbers move.";
const CLOSING_ACTION = "Open the guided loop";
const CLOSING_CODE = "END";
const LOGIN_ONLY =
  "This deployment is behind login and issues no login-free reviewer link, so the signed per-role entry of surface 12 and its expired and revoked states are not built in this run (deviation D-07).";

const STEP_COUNT = 6;
const EMPTY_TITLE = "The corpus is not seeded on this instance";
const EMPTY_TEXT =
  "The tour reads the active corpus version, its documents and its assets at request time. This runtime reached the database but found no active version to walk, so no step can name a real target.";
const ERROR_TITLE = "The tour could not be read";
const ERROR_TEXT =
  "The database did not answer this request, so no step can bind to a corpus version, a document or an asset. Nothing is shown rather than a placeholder.";
const BACK_HOME = "Home";

type TourData = {
  version: { label: string; digest: string };
  documents: { files: number; classes: number; sidecars: number };
  assets: number;
  /** The P&ID whose sidecar is disclosed as transcribed, for the asset the walk hands over. */
  pid: { id: string; docNo: string } | null;
  /** The newest answer trace, when this instance has answered anything yet. */
  trace: { id: string; outcome: string } | null;
  /** The asset the walk hands over: the equipment of the top-ranked knowledge-debt cluster. */
  asset: { tag: string; name: string; links: number } | null;
};

async function readTour(): Promise<TourData | null> {
  const [version] = await db.select().from(corpusVersion).where(eq(corpusVersion.isActive, true)).limit(1);
  if (!version) return null;

  const box = await getSandbox(await cookies());
  // The supplied corpus is what this step is about: the documents whose revisions belong to the active version, so
  // a lesson a visitor published into a sandbox version is not counted as a file the organiser supplied.
  const ofActiveVersion = db
    .select({ id: documentTable.id, class: documentTable.class })
    .from(documentTable)
    .innerJoin(documentRevision, eq(documentRevision.documentId, documentTable.id))
    .where(eq(documentRevision.corpusVersionId, version.id))
    .groupBy(documentTable.id, documentTable.class)
    .as("supplied");
  const [files, classes, sidecars, assets, traces, loop] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(ofActiveVersion),
    db.select({ n: sql<number>`count(distinct ${ofActiveVersion.class})::int` }).from(ofActiveVersion),
    db.select({ n: sql<number>`count(*)::int` }).from(pidSidecar),
    db.select({ n: sql<number>`count(*)::int` }).from(equipment),
    db.select({ id: answerTrace.id, outcome: answerTrace.outcome }).from(answerTrace).orderBy(desc(answerTrace.serverTs)).limit(1),
    readLoopView(box),
  ]);

  // The asset the walk hands over is the one the loop targets, so the tour introduces exactly what the loop uses.
  const tag = loop?.before.cluster?.equipment_tag ?? null;
  let asset: TourData["asset"] = null;
  let pid: TourData["pid"] = null;
  if (tag !== null) {
    const [row] = await db
      .select({ tag: equipment.tag, name: equipment.name, pidDocumentId: equipment.pidDocumentId })
      .from(equipment)
      .where(eq(equipment.tag, tag))
      .limit(1);
    if (row) {
      const [links] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(causalLink)
        .where(eq(causalLink.equipmentTag, row.tag));
      asset = { tag: row.tag, name: row.name, links: links?.n ?? 0 };
      const [doc] = await db
        .select({ id: documentTable.id, docNo: documentTable.docNo })
        .from(documentTable)
        .where(eq(documentTable.id, row.pidDocumentId))
        .limit(1);
      if (doc) pid = { id: doc.id, docNo: doc.docNo ?? doc.id };
    }
  }

  return {
    version: { label: version.label, digest: version.corpusSha256.slice(0, DIGEST_PREFIX) },
    documents: { files: files[0]?.n ?? 0, classes: classes[0]?.n ?? 0, sidecars: sidecars[0]?.n ?? 0 },
    assets: assets[0]?.n ?? 0,
    pid,
    trace: traces[0] ? { id: traces[0].id, outcome: traces[0].outcome } : null,
    asset,
  };
}

type Step = { code: string; title: string; body: string; look?: string; target: { href: string; label: string }; facts?: TourFact[] };

/** The six Expected Solution components in order, each bound to what this instance actually holds. */
function stepsOf(data: TourData): Step[] {
  const asset = data.asset;
  return [
    {
      code: "ES1",
      title: "The corpus is a version, not a folder",
      body: "Home opens on the corpus status card: the active version with its manifest digest, the extractor and embedding pins it was built under, and the moment it was last activated. Every figure anywhere in the product is read against that version.",
      look: "The version badge in the card header is the same badge the guided loop increments at the end of this walk.",
      target: { href: "/", label: "Home" },
      facts: [
        { label: "version", value: data.version.label },
        { label: "digest", value: data.version.digest },
        { label: "assets", value: String(data.assets) },
      ],
    },
    {
      code: "ES2",
      title: "Ingestion that discloses what it did",
      body: "One extractor, one canonical form, one pass over every supplied file. The P&ID drawings carry no machine-readable text, so their hotspots come from a transcribed sidecar and the page says so in its provenance line rather than presenting the transcription as the drawing.",
      look: data.pid ? "Open the P&ID and read the provenance line above the hotspots." : undefined,
      target: data.pid && asset ? { href: `/documents/${data.pid.id}`, label: `the ${asset.tag} P&ID` } : { href: "/assets", label: "Assets" },
      facts: [
        { label: "files", value: String(data.documents.files) },
        { label: "classes", value: String(data.documents.classes) },
        { label: "transcribed sidecars", value: String(data.documents.sidecars) },
      ],
    },
    {
      code: "ES3",
      title: "Ask in English or Bahasa Indonesia",
      body: "The question input takes either language and four moment templates shape the answer around the moment it is asked in: start-up readiness, why it tripped and what the trip did, before this job, abnormal reading. Semantic search is the other entry: retrieval only, no answer composed, no provider call.",
      look: "Evidence arrives first and the composed packet second, so the sources are on screen before any sentence is.",
      target: { href: "/ask", label: "Ask" },
    },
    {
      code: "ES4",
      title: "Every answer replays",
      body: "A trace holds the whole path: scope resolution, the rule-pack class and version, the retrieved set, the prompts by version, the verifier's verdict per sentence, the six gate results, the confidence inputs, the model ids and the corpus version. The verifier returns verdicts and never edits.",
      look: data.trace ? "The gate strip at the top is the same one the answer carried." : "A trace opens from the link under any answer.",
      target: data.trace ? { href: `/trace/${data.trace.id}`, label: "the newest trace" } : { href: "/ask", label: "Ask" },
      facts: data.trace ? [{ label: "trace", value: data.trace.id.slice(0, 8) }, { label: "outcome", value: data.trace.outcome }] : undefined,
    },
    {
      code: "ES5",
      title: "Context around the tag, and the seams named",
      body: asset
        ? `The asset page joins the datasheet, the drawings, the cause-and-effect sheet and the lessons on one equipment tag, with the setpoint ladders and the proof-test records beside them. The connector panel states each integration contract as specified, not connected, and the digital twin row's deep link is empty because nothing is wired.`
        : "The asset page joins every document class on one equipment tag, and the connector panel states each integration contract as specified, not connected.",
      look: "No control system is reachable from anywhere in this product; there is no write path.",
      target: asset ? { href: `/assets/${asset.tag}`, label: asset.tag } : { href: "/assets", label: "Assets" },
      facts: asset ? [{ label: "asset", value: asset.tag }, { label: "service", value: asset.name }] : undefined,
    },
    {
      code: "ES6",
      title: "The failures remember each other",
      body: "Failure Memory draws the records of one asset as hops: the linking sentence verbatim, the field it came from and the interval in days, with the basis stated as a shared degradation noun inside the window and never as a claim of cause. Recommended actions are quoted precedent, never advice.",
      look: asset ? "Follow the hops to the record the guided loop is about to teach." : undefined,
      target: asset ? { href: `/failures/${asset.tag}`, label: `${asset.tag} history` } : { href: "/failures", label: "Failure Memory" },
      facts: asset ? [{ label: "causal links", value: String(asset.links) }] : undefined,
    },
  ];
}

export default async function TourPage() {
  await requireSession();

  let data: TourData | null;
  try {
    data = await readTour();
  } catch (error) {
    log.error({ event: "tour.read_failed", route: TOUR_ROUTE, message: error instanceof Error ? error.message : String(error) });
    return <DesignedState title={ERROR_TITLE} explanation={ERROR_TEXT} tone="defect" next={{ href: "/", label: BACK_HOME }} />;
  }
  if (!data) {
    return <DesignedState title={EMPTY_TITLE} explanation={EMPTY_TEXT} next={{ href: "/", label: BACK_HOME }} />;
  }

  const steps = stepsOf(data);

  return (
    <div className="pb-4">
      <header className="grid items-end gap-6 border-b border-edge pb-7 lg:grid-cols-[minmax(0,1fr)_max-content]">
        <div>
          <h1 className="rise max-w-[16ch] text-[46px]" style={{ "--i": 0 } as CSSProperties}>
            {TITLE}
          </h1>
          <p className="rise mt-3 max-w-[64ch] text-[15px] text-ink-700" style={{ "--i": 1 } as CSSProperties}>
            {LEAD}
          </p>
        </div>
        <div className="rise flex flex-col items-start gap-2 lg:items-end" style={{ "--i": 2 } as CSSProperties}>
          <p className="eyebrow">{CORPUS}</p>
          <VersionBadge label={data.version.label} digestPrefix={data.version.digest} active />
          <p className="max-w-[34ch] text-[12.5px] text-ink-500 lg:text-right">{TAGLINE}</p>
        </div>
      </header>

      <ol className="mt-9 grid list-none gap-0 p-0">
        {steps.map((step, i) => (
          <TourStep
            key={step.code}
            code={step.code}
            n={i + 1}
            of={STEP_COUNT}
            title={step.title}
            body={step.body}
            look={step.look}
            target={step.target}
            facts={step.facts}
          />
        ))}
      </ol>

      <div className="rise mt-2" style={{ "--i": STEP_COUNT + 1 } as CSSProperties}>
        <GlassPanel className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-6 gap-y-4 p-7 lg:grid-cols-[64px_minmax(0,60ch)_minmax(0,1fr)]" aria-labelledby="tour-closing">
          <p className="mono self-start rounded-[4px] bg-[color-mix(in_srgb,var(--accent)_9%,transparent)] py-1 text-center text-[12px] font-medium text-accent">
            {CLOSING_CODE}
          </p>
          <div className="min-w-0">
            <h2 id="tour-closing" className="text-[26px]">
              {CLOSING_TITLE}
            </h2>
            <p className="mt-2 text-[14px] text-ink-700">{CLOSING_BODY}</p>
          </div>
          <p className="min-w-0 border-edge lg:border-l lg:pl-6">
            <Link href={LOOP_ROUTE} className="neu text-[14px]">
              <span>{CLOSING_ACTION}</span>
              <span aria-hidden className="mono">
                &rarr;
              </span>
            </Link>
          </p>
        </GlassPanel>
      </div>

      <p className="mt-5 max-w-[76ch] text-[12.5px] text-ink-500">{LOGIN_ONLY}</p>
    </div>
  );
}
