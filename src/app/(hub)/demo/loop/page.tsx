// Surface 11, the guided loop (blueprint 6.2 surface 11, 7.2 the signature moment; ARCHITECTURE 8.5, 8.6;
// AC-LOOP-12, AC-LOOP-13, AC-UI-01). The server half reads what the walk binds to at request time and hands it to
// the client half: the corpus version this browser sees, both layers of the headline population as the recount's
// "before", the recipe the recount must run under, the top-ranked knowledge-debt cluster with the records it says
// carry no lesson, the draft this browser already owns on that cluster, and the demo account behind each role so a
// step this session cannot take can offer the role switch of D-16.
//
// Nothing is faked and nothing is prerendered: the walk calls POST /api/ask, POST /api/drafts, the poll,
// POST /api/drafts/:id/decision, POST /api/sme-notes and POST /api/drafts/:id/publish, and each of those runs
// under the 9.9 matrix. If the version carries no coverage rows or ranks no cluster, this route renders the
// designed state that says so rather than a walk with nothing behind it.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getSandbox } from "@/auth/sandbox";
import { requireSession } from "@/auth/session";
import { DesignedState } from "@/components/DesignedState";
import { readLoopView } from "@/db/queries/loop-view";
import { log } from "@/lib/log";
import { LoopClient, type LoopClientProps } from "./LoopClient";

export const metadata: Metadata = { title: "Guided loop" };

// Every figure binds to the visible corpus version at request time (blueprint 10.3); nothing is prerendered.
export const dynamic = "force-dynamic";

export const ROUTE = "/demo/loop";
const DIGEST_PREFIX = 8;

const EMPTY_TITLE = "There is nothing to walk on this corpus version";
const EMPTY_TEXT =
  "The guided loop walks one record that carries no lesson, so it needs a corpus version that carries a coverage recount and ranks at least one knowledge-debt cluster. This version carries neither, so no step can bind to a real record.";
const NO_RECORD_TITLE = "The top cluster names no uncovered record";
const NO_RECORD_TEXT =
  "The highest-ranked knowledge-debt cluster on this corpus version lists no uncovered work order, so there is no record for a lesson to teach and the walk has no first step.";
const ERROR_TITLE = "The guided loop could not be read";
const ERROR_TEXT =
  "The database did not answer this request, so the walk cannot bind to a corpus version, a cluster or a record. Nothing is shown rather than a placeholder.";
const CONSOLE_LABEL = "Coverage Console";
const CONSOLE_HREF = "/coverage";

/** The question the walk asks before and after the lesson exists, in the record's own words. */
function questionFor(tag: string, problem: string): string {
  return `What do the documents say to do on ${tag} when the report reads "${problem}"?`;
}

export default async function LoopPage() {
  const session = await requireSession();

  let view: Awaited<ReturnType<typeof readLoopView>>;
  try {
    view = await readLoopView(await getSandbox(await cookies()));
  } catch (error) {
    log.error({ event: "loop.read_failed", route: ROUTE, message: error instanceof Error ? error.message : String(error) });
    return <DesignedState title={ERROR_TITLE} explanation={ERROR_TEXT} tone="defect" next={{ href: CONSOLE_HREF, label: CONSOLE_LABEL }} />;
  }

  const cluster = view?.before.cluster ?? null;
  if (!view || !cluster) {
    return <DesignedState title={EMPTY_TITLE} explanation={EMPTY_TEXT} next={{ href: CONSOLE_HREF, label: CONSOLE_LABEL }} />;
  }
  const record = view.records[0] ?? null;
  if (!record) {
    return (
      <DesignedState
        title={NO_RECORD_TITLE}
        explanation={NO_RECORD_TEXT}
        reason={`cluster ${cluster.id}`}
        next={{ href: `${CONSOLE_HREF}/clusters/${cluster.id}`, label: "The cluster" }}
      />
    );
  }

  const props: LoopClientProps = {
    session: { alias: session.alias, role: session.role },
    before: {
      version: { label: view.before.version.label, digest_prefix: view.before.version.corpus_sha256.slice(0, DIGEST_PREFIX) },
      generous: view.before.generous,
      strict: view.before.strict,
      cluster: { rank: cluster.rank, score: cluster.score, uncovered_wo_numbers: cluster.uncovered_wo_numbers },
    },
    method: { recipe_sha256: view.method.recipe_sha256, stop_list_sha256: view.method.stop_list_sha256 },
    versionIsActive: view.before.version.is_active,
    cluster: {
      id: cluster.id,
      equipment_tag: cluster.equipment_tag,
      rank: cluster.rank,
      score: cluster.score,
      incomplete_uncovered: cluster.incomplete_uncovered,
      uncovered_wo_numbers: cluster.uncovered_wo_numbers,
    },
    record,
    otherRecords: view.records.slice(1),
    question: questionFor(record.equipment_tag, record.problem_description),
    draft: view.draft,
    demoUsernames: view.demoUsernames,
    route: ROUTE,
  };

  return <LoopClient {...props} />;
}
