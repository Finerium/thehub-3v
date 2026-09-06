// Emits every fixed wording of src/lib/fixed-strings.ts, one per line, for scripts/audits/fixed-wordings.sh: the
// exported string constants and the string values of the exported records (STATUS_WORDING). The template functions
// are covered by the fragment constants they build from. Reading the module, not a copied list, keeps the audit
// bound to the one home of the wordings.
//
//   pnpm exec tsx scripts/audits/fixed-wordings.ts
import * as strings from "../../src/lib/fixed-strings";

const wordings = new Set<string>();
for (const value of Object.values(strings)) {
  if (typeof value === "string") wordings.add(value);
  else if (value && typeof value === "object") {
    for (const inner of Object.values(value)) if (typeof inner === "string") wordings.add(inner);
  }
}
for (const w of wordings) {
  if (w.includes("\n")) throw new Error(`fixed wording carries a newline: ${JSON.stringify(w)}`);
  process.stdout.write(`${w}\n`);
}
