// Home's seeded chips (blueprint 6.2 Home, 9.17; AC-UI-05): three questions per asset, twenty-four in all, each
// answered once against a running deployment and then served for ever from storage. src/answer/seeded.ts already
// replays them with zero provider calls; what was missing is the rows, and this script writes them.
//
//   pnpm db:seed:chips [--base-url URL] [--dry-run]
//
// The questions are the golden set's own: a case whose question names exactly one of the eight equipment tags is a
// candidate, and three are taken per tag, preferring a case whose expected outcome is an answer so a chip opens a
// full packet rather than a refusal. That makes every chip a question the run is already measured on, and it fills
// seeded_chip.golden_case_id with the case it came from.
//
// Nothing is written into the repository: a packet carries block items quoted from the corpus, which invariant 7
// keeps out of a public tree (the same reason as D-17), and the chips themselves are database rows. The run's own
// record is the lines it prints.
import { readFileSync } from "node:fs";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { ask, login } from "../golden/client";
import { db } from "@/db/client";
import { EXPORT_LIVE_URL } from "@/lib/fixed-strings";
import { answerTrace, equipment, seededChip } from "@/db/schema";

const ROOT = path.resolve(__dirname, "..", "..");
const CASES = path.join(ROOT, "bundle", "golden", "cases.yaml");
const PER_ASSET = 3;

type Candidate = { caseId: string; question: string; tag: string; answers: boolean };

/** The golden set as this script needs it: the id, the question and whether the case expects an answer. */
function candidates(tags: readonly string[]): Candidate[] {
  const text = readFileSync(CASES, "utf8");
  const out: Candidate[] = [];
  for (const block of text.split(/^- id: /m).slice(1)) {
    const caseId = (block.split("\n")[0] ?? "").trim();
    const question = /^\s*question:\s*"(.+)"\s*$/m.exec(block)?.[1];
    if (!caseId || !question) continue;
    const named = tags.filter((tag) => question.includes(tag));
    if (named.length !== 1) continue;
    const tag = named[0] as string;
    out.push({ caseId, question, tag, answers: /^\s*outcome:\s*answer\s*$/m.test(block) });
  }
  return out;
}

/** Three per tag: the cases that expect an answer first, then the rest, each in file order. */
function chosen(all: Candidate[], tags: readonly string[]): Candidate[] {
  const picked: Candidate[] = [];
  for (const tag of tags) {
    const mine = all.filter((c) => c.tag === tag);
    const ordered = [...mine.filter((c) => c.answers), ...mine.filter((c) => !c.answers)];
    picked.push(...ordered.slice(0, PER_ASSET));
  }
  return picked;
}

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

async function main(): Promise<number> {
  const baseUrl = (arg("--base-url") ?? process.env.BASE_URL ?? EXPORT_LIVE_URL).replace(/\/$/, "");
  const dryRun = process.argv.includes("--dry-run");
  const tags = (await db.select({ tag: equipment.tag }).from(equipment)).map((r) => r.tag).sort();
  const picked = chosen(candidates(tags), tags);
  process.stdout.write(`chips: ${picked.length} of ${tags.length * PER_ASSET} chosen over ${tags.length} assets\n`);
  for (const tag of tags) {
    const n = picked.filter((c) => c.tag === tag).length;
    if (n < PER_ASSET) process.stdout.write(`  ${tag}: only ${n} candidate question(s) in the golden set\n`);
  }
  if (dryRun) {
    for (const c of picked) process.stdout.write(`  ${c.tag} ${c.caseId} ${c.answers ? "answer" : "other "}\n`);
    return 0;
  }

  const cookie = await login(baseUrl, "Engineer");
  const rows: { id: string; equipmentTag: string; question: string; goldenCaseId: string; traceId: string }[] = [];
  let failed = 0;
  for (const [index, c] of picked.entries()) {
    const result = await ask(baseUrl, cookie, { question: c.question }, c.caseId);
    const traceId = result.packet?.trace_id ?? result.trace_id;
    if (result.status !== 200 || !result.packet || !traceId) {
      process.stdout.write(`  ${c.caseId} ${c.tag}: no packet (status ${result.status}${result.error ? `, ${result.error}` : ""})\n`);
      failed += 1;
      continue;
    }
    const id = `chip-${c.tag}-${String((index % PER_ASSET) + 1)}`;
    rows.push({ id, equipmentTag: c.tag, question: c.question, goldenCaseId: c.caseId, traceId });
    process.stdout.write(`  ${id} ${c.caseId} ${result.packet.outcome} ${result.latency_ms} ms\n`);
  }

  if (rows.length === 0) {
    process.stdout.write("chips: nothing to write\n");
    return 1;
  }
  // The chips are replaced whole: every row goes, then this run's rows are written. Deleting only the ids this run
  // is about to write would leave a question whose ask failed above with its previous row, and src/answer/seeded.ts
  // would go on replaying that stored packet from a superseded corpus version. A chip this run could not answer is
  // therefore absent rather than stale, which Home renders as a missing chip and no reader can mistake.
  await db.delete(seededChip);
  await db.insert(seededChip).values(rows);
  const stored = await db.select({ id: answerTrace.id }).from(answerTrace).where(inArray(answerTrace.id, rows.map((r) => r.traceId)));
  process.stdout.write(`chips: ${rows.length} written over a table emptied first, ${stored.length} of ${rows.length} traces stored, ${failed} question(s) without a packet\n`);
  return failed === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`seed-chips failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
