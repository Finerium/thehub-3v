// The TypeScript lane of the rule-pack equality gate (ADR-002, AC-ANS-10): classify every fixture text of the pack
// (positives, negatives, moments) with the port, write the results in the reference's JSON form, and fail on any
// field that differs from the Python reference's results.
//
//   pnpm exec tsx scripts/audits/rulepack-equality.ts REFERENCE_JSON PORT_JSON
//
// REFERENCE_JSON is what scripts/audits/rulepack-equality.sh had harness.rulepack write over the same file;
// PORT_JSON receives this lane's results, sorted keys, one-space indent, so the two files compare byte for byte.
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { classify, INTENT_CLASSES, LANGUAGES, MOMENTS, pack, RULES } from "../../src/rulepack";

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

function main(referencePath: string, portPath: string): number {
  const reference = Reference.parse(JSON.parse(readFileSync(referencePath, "utf8")));
  const texts = GROUPS.flatMap((group) =>
    (pack.fixtures[group] ?? []).map((item, index) => ({ group, index, text: item.text })),
  );
  // Keys in alphabetical order so JSON.stringify matches json.dumps(sort_keys=True, indent=1).
  const port: Entry[] = texts.map(({ group, index, text }) => {
    const r = classify(pack, text);
    return {
      group,
      index,
      result: {
        entity: r.entity,
        intent_class: r.intent_class,
        language_detected: r.language_detected,
        matched_phrase: r.matched_phrase,
        moment: r.moment,
        protective_function: r.protective_function,
        rule_id: r.rule_id,
      },
      text,
    };
  });
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
    for (const field of Object.keys(Result.shape) as Array<keyof Entry["result"]>) {
      if (r.result[field] !== p.result[field]) {
        differences.push(
          `${p.group}[${p.index}] ${field}: reference ${JSON.stringify(r.result[field])}, port ${JSON.stringify(p.result[field])} (${JSON.stringify(p.text)})`,
        );
      }
    }
  });
  const counts = GROUPS.map((g) => `${g} ${pack.fixtures[g]?.length ?? 0}`).join(", ");
  if (differences.length > 0) {
    console.error(`rulepack equality: ${differences.length} difference(s) over ${port.length} texts (${counts})`);
    for (const d of differences) console.error(`  ${d}`);
    return 1;
  }
  console.log(`rulepack equality: ${port.length} texts identical field by field (${counts})`);
  return 0;
}

const [referencePath, portPath] = process.argv.slice(2);
if (referencePath === undefined || portPath === undefined) {
  console.error("usage: tsx scripts/audits/rulepack-equality.ts REFERENCE_JSON PORT_JSON");
  process.exit(2);
}
process.exit(main(referencePath, portPath));
