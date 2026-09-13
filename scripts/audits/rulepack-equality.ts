// The TypeScript lane of the rule-pack equality gate (ADR-002, AC-ANS-10): classify every fixture text of the pack
// (positives, negatives, moments) with the port, screen every approved lesson with the port's screenOutbound (the
// `outbound` fixtures, one per lesson), write both result sets in the reference's JSON form, and fail on any field
// that differs from the Python reference's results.
//
//   pnpm exec tsx scripts/audits/rulepack-equality.ts REFERENCE_JSON PORT_JSON [LESSONS_JSON REF_OUT_JSON PORT_OUT_JSON]
//
// REFERENCE_JSON is what scripts/audits/rulepack-equality.sh had harness.rulepack write over the same texts;
// PORT_JSON receives this lane's results, sorted keys, one-space indent, so the two files compare byte for byte.
// The outbound triple is optional and travels together: LESSONS_JSON is the private {opl_id: canonical text} file
// the shell script hands over and deletes at exit (the lesson texts are the organiser's corpus, so they are read
// here and written into no result file), REF_OUT_JSON is the reference's screen of the same lessons and
// PORT_OUT_JSON receives this lane's. Without them the outbound lane does not run and the shell script says so.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { classify, INTENT_CLASSES, LANGUAGES, MOMENTS, pack, RULES } from "../../src/rulepack";
import { screenOutbound } from "../../src/rulepack/screen";

const GROUPS = ["positives", "negatives", "moments"] as const;

const Result = z
  .object({
    entity: z.string().nullable(),
    intent_class: z.enum(INTENT_CLASSES),
    language_detected: z.enum(LANGUAGES),
    matched_phrase: z.string().nullable(),
    moment: z.enum(MOMENTS).nullable(),
    protective_function: z.string().nullable(),
    rule_id: z.enum(RULES),
  })
  .strict();
const Entry = z.object({ group: z.enum(GROUPS), index: z.number().int(), result: Result, text: z.string() }).strict();
const Reference = z.array(Entry);
type Entry = z.infer<typeof Entry>;

// A screened lesson names itself by opl_id and never carries its text: the corpus stays out of every result file.
const OutboundEntry = z
  .object({
    blocked: z.boolean(),
    index: z.number().int(),
    opl_id: z.string(),
    result: Result,
    whitelisted: z.boolean(),
  })
  .strict();
const OutboundReference = z.array(OutboundEntry);
type OutboundEntry = z.infer<typeof OutboundEntry>;

const Lessons = z.record(z.string(), z.string());

/** The seven classification fields in the reference's key order, so JSON.stringify matches json.dumps(sort_keys). */
function resultOf(r: ReturnType<typeof classify>): Entry["result"] {
  return {
    entity: r.entity,
    intent_class: r.intent_class,
    language_detected: r.language_detected,
    matched_phrase: r.matched_phrase,
    moment: r.moment,
    protective_function: r.protective_function,
    rule_id: r.rule_id,
  };
}

/** Every classification field of one entry against the reference's, named by `where`. */
function compareResults(where: string, reference: Entry["result"], port: Entry["result"], out: string[]): void {
  for (const field of Object.keys(Result.shape) as Array<keyof Entry["result"]>) {
    if (reference[field] !== port[field]) {
      out.push(`${where} ${field}: reference ${JSON.stringify(reference[field])}, port ${JSON.stringify(port[field])}`);
    }
  }
}

function main(referencePath: string, portPath: string, lessonsPath: string | undefined, refOutPath: string | undefined, portOutPath: string | undefined): number {
  const reference = Reference.parse(JSON.parse(readFileSync(referencePath, "utf8")));
  const texts = GROUPS.flatMap((group) =>
    (pack.fixtures[group] ?? []).map((item, index) => ({ group, index, text: item.text })),
  );
  // Keys in alphabetical order so JSON.stringify matches json.dumps(sort_keys=True, indent=1).
  const port: Entry[] = texts.map(({ group, index, text }) => ({ group, index, result: resultOf(classify(pack, text)), text }));
  writeFileSync(portPath, `${JSON.stringify(port, null, 1)}\n`);

  const differences: string[] = [];
  if (reference.length !== port.length) {
    differences.push(`reference has ${reference.length} texts, the pack has ${port.length}`);
  }
  port.forEach((p, i) => {
    const r = reference[i];
    if (r === undefined) return;
    if (r.group !== p.group || r.index !== p.index || r.text !== p.text) {
      differences.push(`${p.group}[${p.index}]: the reference classified a different text`);
      return;
    }
    compareResults(`${p.group}[${p.index}]`, r.result, p.result, differences);
  });

  // The outbound lane (9.10, the screen G2 runs over the whole kept answer): every approved lesson screened against
  // the whitelist of all of them, compared to the reference's screen of the same texts, and each result held
  // against the expectation the pack itself records for that lesson, which nothing else reads.
  let outbound = 0;
  if (lessonsPath !== undefined && refOutPath !== undefined && portOutPath !== undefined && existsSync(lessonsPath)) {
    const lessons = Lessons.parse(JSON.parse(readFileSync(lessonsPath, "utf8")));
    const referenceOut = OutboundReference.parse(JSON.parse(readFileSync(refOutPath, "utf8")));
    const oplIds = Object.keys(lessons).sort();
    const whitelist = oplIds.map((id) => lessons[id] ?? "");
    const declared = new Map((pack.fixtures.outbound ?? []).map((f) => [f.opl_id, f] as const));
    const portOut: OutboundEntry[] = oplIds.map((opl_id, index) => {
      const screen = screenOutbound(pack, lessons[opl_id] ?? "", whitelist);
      return { blocked: screen.blocked, index, opl_id, result: resultOf(screen.classification), whitelisted: screen.whitelisted };
    });
    writeFileSync(portOutPath, `${JSON.stringify(portOut, null, 1)}\n`);
    outbound = portOut.length;
    if (referenceOut.length !== portOut.length) {
      differences.push(`reference screened ${referenceOut.length} lessons, this lane screened ${portOut.length}`);
    }
    portOut.forEach((p, i) => {
      const where = `outbound[${p.index}] ${p.opl_id}`;
      const fixture = declared.get(p.opl_id);
      if (fixture === undefined) differences.push(`${where}: the pack carries no outbound fixture for this lesson`);
      else {
        if (fixture.expect_blocked !== p.blocked) differences.push(`${where} blocked: fixture ${fixture.expect_blocked}, port ${p.blocked}`);
        const bare = classify(pack, lessons[p.opl_id] ?? "").intent_class;
        if (fixture.expect_class_without_whitelist !== bare) {
          differences.push(`${where} class without the whitelist: fixture ${fixture.expect_class_without_whitelist}, port ${bare}`);
        }
      }
      const r = referenceOut[i];
      if (r === undefined) return;
      if (r.opl_id !== p.opl_id || r.index !== p.index) {
        differences.push(`${where}: the reference screened a different lesson`);
        return;
      }
      if (r.blocked !== p.blocked || r.whitelisted !== p.whitelisted) {
        differences.push(`${where}: reference blocked ${r.blocked}/whitelisted ${r.whitelisted}, port ${p.blocked}/${p.whitelisted}`);
      }
      compareResults(where, r.result, p.result, differences);
    });
  }

  const counts = [...GROUPS.map((g) => `${g} ${pack.fixtures[g]?.length ?? 0}`), `outbound ${outbound} of ${pack.fixtures.outbound?.length ?? 0}`].join(", ");
  if (differences.length > 0) {
    console.error(`rulepack equality: ${differences.length} difference(s) over ${port.length + outbound} entries (${counts})`);
    for (const d of differences) console.error(`  ${d}`);
    return 1;
  }
  console.log(`rulepack equality: ${port.length} texts and ${outbound} lesson screens identical field by field (${counts})`);
  return 0;
}

const [referencePath, portPath, lessonsPath, refOutPath, portOutPath] = process.argv.slice(2);
if (referencePath === undefined || portPath === undefined) {
  console.error("usage: tsx scripts/audits/rulepack-equality.ts REFERENCE_JSON PORT_JSON [LESSONS_JSON REF_OUT_JSON PORT_OUT_JSON]");
  process.exit(2);
}
process.exit(main(referencePath, portPath, lessonsPath, refOutPath, portOutPath));
