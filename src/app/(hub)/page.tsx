import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { CSSProperties } from "react";
import { asc, count, eq } from "drizzle-orm";
import { getSandbox } from "@/auth/sandbox";
import { BandBars } from "@/components/BandBars";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { GlassPanel } from "@/components/GlassPanel";
import { MethodChip } from "@/components/MethodChip";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
import { DocumentClass } from "@/contracts/generated/document";
import { db } from "@/db/client";
import { LABELS_STATUS_TEXT, POPULATION_LABEL, hoursText, idrText, percentOf, readCoverageConsole, type CoverageConsole } from "@/db/queries/coverage";
import { corpusVersion, documentTable, equipment, seededChip } from "@/db/schema";
import { fixtures } from "@/lib/fixtures";

export const metadata: Metadata = { title: "Home" };

// Every figure on this surface is read at request time from the seeded database or, for the file counts when no
// document rows exist yet, from the harness fixture (blueprint 10.3). Nothing here is prerendered.
export const dynamic = "force-dynamic";

const DIGEST_PREFIX = 8;

const CLASS_LABEL: Record<DocumentClass, string> = {
  datasheet: "Datasheet",
  ga_drawing: "General-arrangement drawing",
  interlock: "Cause-and-effect sheet",
  plot_plan: "Plot plan",
  opl: "One Point Lesson",
  pid: "P&ID (image, no text layer)",
  workbook: "Maintenance workbook",
  organiser_note: "Organiser note (excluded from retrieval)",
};

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

function utc(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

async function readHome() {
  const [version] = await db.select().from(corpusVersion).where(eq(corpusVersion.isActive, true)).limit(1);
  const [docCounts, assets, chips, gap] = await Promise.all([
    db.select({ cls: documentTable.class, n: count() }).from(documentTable).groupBy(documentTable.class),
    db.select().from(equipment).orderBy(asc(equipment.tag)),
    db.select().from(seededChip).orderBy(asc(seededChip.equipmentTag), asc(seededChip.id)),
    // The gap headline reads the coverage rows of the version this browser sees (the sandbox recount when one exists, D-16).
    getSandbox(await cookies()).then(readCoverageConsole),
  ]);
  return { version: version ?? null, docCounts, assets, chips, gap };
}

type HomeData = Awaited<ReturnType<typeof readHome>>;

const T = "t";

// The gap headline of surface 1 (7.3 content-first: the hero is the figure with its method chip and the bands).
// Both layers from the same coverage_summary rows the Console reads, the three bands, the adjudicated reading
// labelled with its status; the register is expressive here only (7.2), staggered reveals on the children.
function GapHeadline({ gap }: { gap: CoverageConsole }) {
  const { generous, strict } = gap.unplanned;
  const n = generous.population_count;
  const bands = generous.bands ?? strict.bands;
  const layers = [
    { s: generous, reading: "matched by no same-asset lesson at all" },
    { s: strict, reading: "taught by nothing beyond a copied work-order row" },
  ];
  return (
    <GlassPanel className="p-6" aria-label="Coverage gap headline" data-component="gap-headline" data-version={gap.version.id}>
      <p className="rise font-display text-[24px] leading-tight font-semibold tracking-tight text-ink-900" style={stagger(1)}>
        Of <span className="mono">{n}</span> {POPULATION_LABEL.unplanned_failure}, <span className="mono">{generous.uncovered_count}</span> are matched by no same-asset lesson at
        all and <span className="mono">{strict.uncovered_count}</span> have nothing beyond a copied work-order row.
      </p>
      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        {layers.map(({ s, reading }, i) => (
          <div key={s.layer} className="rise min-w-0" style={stagger(2 + i)} data-layer={s.layer}>
            <p className="eyebrow">{s.layer} layer</p>
            <p className="mono mt-1 flex items-baseline gap-2">
              <span className="text-[56px] leading-none font-medium text-ink-900">{s.uncovered_count}</span>
              <span className="text-[16px] text-ink-500">of {s.population_count}</span>
            </p>
            <p className="mt-2 text-[13px] leading-snug text-ink-700">
              <span className="mono text-ink-900">{percentOf(s.uncovered_count, s.population_count)}</span> at {T} = <span className="mono">{s.threshold}</span>, {s.layer} layer:{" "}
              {reading}; <span className="mono">{s.uncovered_breakdowns}</span> breakdowns carrying <span className="mono">{hoursText(s.uncovered_downtime_hours)}</span> and{" "}
              <span className="mono">{idrText(s.uncovered_cost_idr)}</span> of recorded downtime and cost, an exposure and not a saving.
            </p>
          </div>
        ))}
      </div>
      <div className="rise mt-5" style={stagger(4)}>
        <MethodChip
          className="[&>summary]:flex-wrap [&>summary]:gap-y-1"
          threshold={gap.method.threshold}
          layer="both"
          windowMultiplier={gap.method.window_multiplier}
          recipeSha256={gap.method.recipe_sha256}
          stopListSha256={gap.method.stop_list_sha256}
          extractor={gap.method.extractor}
        />
      </div>
      {bands ? (
        <div className="rise mt-5" style={stagger(5)}>
          <p className="eyebrow mb-2">Three bands of the {n} records</p>
          <BandBars bands={bands} populationCount={n} recountKey={gap.version.id} />
        </div>
      ) : null}
      <div className="rise mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-4" style={stagger(6)}>
        <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-700">
          {gap.labels ? (
            <>
              <span>
                Adjudicated reading: <span className="mono text-ink-900">{gap.labels.uncovered_count}</span> of {n} ({percentOf(gap.labels.uncovered_count, n)})
              </span>
              <StatusBadge kind="machine_drafted" />
              <span className="text-ink-500">{LABELS_STATUS_TEXT[gap.labels.status]}</span>
            </>
          ) : (
            <span className="text-ink-500">Adjudicated reading not available on this deployment.</span>
          )}
        </p>
        <Link href="/coverage" className="draw text-[13px]">
          Coverage Console
        </Link>
      </div>
    </GlassPanel>
  );
}

export default async function Home() {
  let data: HomeData;
  try {
    data = await readHome();
  } catch (error) {
    console.error(JSON.stringify({ route: "/", event: "home.read_failed", message: error instanceof Error ? error.message : String(error) }));
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="Home reads the active corpus version, the equipment master and the seeded chips at request time. The read failed, so nothing is shown in their place."
        next={{ href: "/", label: "Try again" }}
      />
    );
  }

  const { version, docCounts, assets, chips, gap } = data;

  // File counts by class: document rows of the seeded database first, the fixture inventory as the fallback.
  const counts: { source: string; total: number; rows: Array<{ cls: string; n: number }> } | null =
    docCounts.length > 0
      ? {
          source: "document rows of the seeded database",
          total: docCounts.reduce((sum, r) => sum + r.n, 0),
          rows: docCounts.map((r) => ({ cls: r.cls, n: r.n })),
        }
      : fixtures
        ? {
            source: "fixtures.json inventory (harness)",
            total: fixtures.inventory.files,
            rows: Object.entries(fixtures.inventory.by_class).map(([cls, n]) => ({ cls, n })),
          }
        : null;
  const classOrder = DocumentClass.options as readonly string[];
  const countRows = counts
    ? [...counts.rows].sort((a, b) => classOrder.indexOf(a.cls) - classOrder.indexOf(b.cls))
    : [];

  const chipsByTag = new Map<string, typeof chips>();
  for (const chip of chips) {
    const list = chipsByTag.get(chip.equipmentTag) ?? [];
    list.push(chip);
    chipsByTag.set(chip.equipmentTag, list);
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <h1 className="text-[34px]">Home</h1>
          <p className="mt-1 max-w-prose text-[13.5px] text-ink-700">
            The corpus as the plant knows it: what was written down, under which version, and what was never taught.
          </p>
        </div>
        {version ? (
          <VersionBadge label={version.label} digestPrefix={version.corpusSha256.slice(0, DIGEST_PREFIX)} active />
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* The gap headline slot: the hero of this surface (7.3 content-first). The coverage track replaces it with
            the figure, both layers, the three bands and the method chip. */}
        <section className="rise lg:col-span-7" style={stagger(1)} aria-labelledby="gap-heading">
          <h2 id="gap-heading" className="mb-3 text-[15px] font-medium text-ink-500">
            Coverage gap
          </h2>
          {gap ? (
            <GapHeadline gap={gap} />
          ) : (
            <DesignedState
              inline
              title="Not yet computed on this version"
              explanation={
                version
                  ? `The gap headline binds to the coverage_summary rows of corpus version ${version.label}. None exist yet: the seed writes both layers under the frozen recipe and the figure renders here with its method chip, the two layers and the three bands.`
                  : "The gap headline binds to the coverage_summary rows of the active corpus version. No version is active on this deployment yet."
              }
              next={{ href: "/coverage", label: "Coverage Console" }}
            />
          )}
        </section>

        {/* Corpus status card: 6.2 surface 1. */}
        <GlassPanel className="rise p-6 lg:col-span-5" aria-labelledby="corpus-heading">
          <div style={stagger(2)}>
            <h2 id="corpus-heading" className="text-[20px]">
              Corpus status
            </h2>
            {version ? (
              <dl className="fields mt-4">
                <dt>Active version</dt>
                <dd className="mono">
                  {version.label} <span className="text-ink-500">{version.id}</span>
                </dd>
                <dt>Corpus digest</dt>
                <dd className="mono" title={version.corpusSha256}>
                  {version.corpusSha256.slice(0, DIGEST_PREFIX)}
                </dd>
                <dt>Extractor</dt>
                <dd className="mono">{version.extractor}</dd>
                <dt>Embedding pin</dt>
                <dd className="mono">
                  {version.embeddingModel} <span className="text-ink-500">{version.embeddingDim} dimensions</span>
                </dd>
                <dt>{version.activatedAt ? "Activated" : "Created"}</dt>
                <dd className="mono">
                  {utc(version.activatedAt ?? version.createdAt)}
                  {version.activatedByAlias ? <span className="text-ink-500"> by {version.activatedByAlias}</span> : null}
                </dd>
              </dl>
            ) : (
              <EmptyState
                className="mt-4"
                title="No active corpus version"
                explanation="The seed inserts corpus version v1 and activates it; until then this card has nothing to bind to."
              />
            )}

            <h3 className="mt-6 text-[15px]">Files by class</h3>
            {counts ? (
              <>
                <table className="reg mt-2">
                  <thead>
                    <tr>
                      <th scope="col">Class</th>
                      <th scope="col" className="num">
                        Files
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {countRows.map((r) => (
                      <tr key={r.cls}>
                        <td>
                          {CLASS_LABEL[r.cls as DocumentClass] ?? r.cls} <span className="mono text-ink-500">{r.cls}</span>
                        </td>
                        <td className="num">{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="num">{counts.total}</td>
                    </tr>
                  </tfoot>
                </table>
                <p className="mt-2 text-[12px] text-ink-500">Source: {counts.source}.</p>
                {docCounts.length > 0 && fixtures && counts.total !== fixtures.inventory.files ? (
                  <p className="mt-1 text-[12px] text-caveat">
                    The seeded document rows cover {counts.total} of the {fixtures.inventory.files} files of the fixture
                    inventory; the full inventory arrives with corpus version v1.
                  </p>
                ) : null}
              </>
            ) : (
              <EmptyState
                className="mt-2"
                title="Inventory not available on this deployment"
                explanation="No document rows are seeded and this runtime cannot read the harness fixture, so no count is shown."
              />
            )}
          </div>
        </GlassPanel>
      </div>

      {/* Equipment master: the eight assets, criticality from the datasheet, interlock_ref verbatim. */}
      <GlassPanel className="rise p-6" aria-labelledby="equipment-heading">
        <div style={stagger(3)}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="equipment-heading" className="text-[20px]">
              Equipment master
            </h2>
            <Link href="/assets" className="draw text-[13px]">
              Assets
            </Link>
          </div>
          {assets.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="reg">
                <thead>
                  <tr>
                    <th scope="col">Tag</th>
                    <th scope="col">Equipment</th>
                    <th scope="col">Service</th>
                    <th scope="col">Criticality (datasheet)</th>
                    <th scope="col">Area</th>
                    <th scope="col">Interlock reference (verbatim)</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.tag}>
                      <td className="mono whitespace-nowrap">
                        <Link href={`/assets/${a.tag}`} className="draw font-medium">
                          {a.tag}
                        </Link>
                      </td>
                      <td className="text-ink-900">{a.name}</td>
                      <td>{a.service}</td>
                      <td className={a.criticalityDatasheet === "HIGH CRITICAL" ? "font-medium text-ink-900" : undefined}>
                        {a.criticalityDatasheet}
                      </td>
                      <td className="mono">{a.areaCode}</td>
                      <td className="mono">{a.interlockRef}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              className="mt-3"
              title="No equipment rows on this version"
              explanation="The equipment master is seeded from the bundle; the table renders once the rows exist."
            />
          )}
        </div>
      </GlassPanel>

      {/* Seeded question chips: three per asset, answered from stored packets with no live call (9.17). */}
      <section className="rise" style={stagger(4)} aria-labelledby="chips-heading">
        <h2 id="chips-heading" className="text-[20px]">
          Seeded questions
        </h2>
        {chips.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {assets
              .filter((a) => chipsByTag.has(a.tag))
              .map((a) => (
                <GlassPanel key={a.tag} className="p-4" interactive>
                  <p className="mono text-[12px] font-medium text-ink-900">{a.tag}</p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {(chipsByTag.get(a.tag) ?? []).map((chip) => (
                      <li key={chip.id}>
                        <Link href={`/ask?chip=${encodeURIComponent(chip.id)}`} className="chip text-[13px]">
                          {chip.question}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </GlassPanel>
              ))}
          </div>
        ) : (
          <EmptyState
            className="mt-3"
            title="The seeded question chips arrive with corpus version v1"
            explanation="Three per asset, each answered from a stored packet with no live call; the chips and their packets are seeded from the bundle and never typed here."
            action={{ href: "/ask", label: "Ask" }}
          />
        )}
      </section>
    </div>
  );
}
