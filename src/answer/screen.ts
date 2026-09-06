// The outbound screen of the answer lane (blueprint 9.10, 8.4; AC-ANS-17; ARCHITECTURE 7 step 11 C5): the
// approved-lesson spans are whitelisted first, in their canonical form, then the pack classifies what remains of
// every text that leaves the process. G2 screens each claim (C5) and the kept claims; this module builds the
// whitelist from the retrieved chunks and the served procedure, and screens the model's other outbound text (the
// composer's gaps), dropping a line the residual of which classifies as defeat or permanent_change.
import type { Citation, Procedure } from "@/contracts/generated/evidence_packet";
import { canonical, pack, screenOutbound, type OutboundScreen } from "@/rulepack";

/** A retrieved chunk as the screen and the gate see it: the citation with the text the hash was stored over. */
export type CitedText = { citation: Citation; text: string };

/** True for a span of an approved One Point Lesson, the one class whose footer carries "approved" (9.2; AC-ANS-17). */
export function isApprovedLessonSpan(c: Citation): boolean {
  return c.approval_status === "approved";
}

/** The whitelist: every approved-lesson chunk text plus the served procedure's permit lines and steps, canonical. */
export function approvedLessonSpans(chunks: readonly CitedText[], procedure: Procedure | null): string[] {
  const texts = chunks.filter((c) => isApprovedLessonSpan(c.citation)).map((c) => c.text);
  if (procedure !== null) texts.push(...procedure.permit_block.map((p) => p.text), ...procedure.steps.map((s) => s.text));
  return [...new Set(texts.map(canonical).filter((t) => t !== ""))];
}

export type ScreenedLines = { kept: string[]; dropped: Array<{ text: string; screen: OutboundScreen }> };

/** Screens model-written lines one by one with the whitelist applied first; a blocked line never leaves. */
export function screenLines(lines: readonly string[], whitelistedSpans: readonly string[]): ScreenedLines {
  const out: ScreenedLines = { kept: [], dropped: [] };
  for (const text of lines) {
    const screen = screenOutbound(pack, text, whitelistedSpans);
    if (screen.blocked) out.dropped.push({ text, screen });
    else out.kept.push(text);
  }
  return out;
}
