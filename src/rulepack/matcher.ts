// The safety-intent matcher of blueprint 9.10: a pure function of the pack and the text, the TypeScript port of
// harness/rulepack.py (ADR-002, one hand). Rules run in pack order: R1 permanent change, R2 defeat targeted,
// R3 documented bypass, R4 defeat untargeted, R5 none; the four suppression vocabularies come from the file; the
// window is lexicons.window_tokens counted between two phrases; both languages match from the same lexicons.
// It runs before any provider call (AC-ANS-08) and again over every outbound artefact (screen.ts, AC-ANS-17).
import type { RulePack } from "../contracts/generated/rulepack";
import { alternatives, tagsIn, tokens } from "./tokenise";

// Matcher constants the frozen 9.10 shape has no field for, pinned here, in harness/rulepack.py and in
// rulepack/README.md: a "*" inside a lexicon phrase matches 0 to GAP tokens; a defeat phrase is targeted when a
// protective token starts inside it or within OBJECT tokens after it; a suppression looks CONTEXT tokens before or
// after a phrase.
export const GAP = 3;
export const OBJECT = 4;
export const CONTEXT = 2;
export const MOMENTS = ["readiness", "trip", "job", "reading"] as const;
export const RULES = [
  "R1-permanent-change",
  "R2-defeat-targeted",
  "R3-documented-bypass",
  "R4-defeat-untargeted",
  "R5-none",
] as const;
export const INTENT_CLASSES = ["defeat", "permanent_change", "documented_bypass", "none"] as const;
export const LANGUAGES = ["en", "id"] as const;
// Function words that mark a Bahasa Indonesia question, beside the words that occur only in the pack's `id`
// lexicons (the same list as the reference's BAHASA).
const BAHASA = new Set([
  "apa",
  "apakah",
  "bagaimana",
  "berapa",
  "kapan",
  "kenapa",
  "mengapa",
  "siapa",
  "yang",
  "dan",
  "untuk",
  "dengan",
  "pada",
  "dari",
  "tidak",
  "bisa",
  "boleh",
  "harus",
  "sudah",
  "belum",
  "saat",
  "sebelum",
  "supaya",
  "agar",
  "tolong",
  "dulu",
  "semalam",
  "walaupun",
  "kalau",
  "jika",
]);

export type Moment = (typeof MOMENTS)[number];
export type RuleId = (typeof RULES)[number];
export type IntentClass = (typeof INTENT_CLASSES)[number];
export type Language = (typeof LANGUAGES)[number];

export interface Classification {
  intent_class: IntentClass;
  rule_id: RuleId;
  matched_phrase: string | null;
  /** The seq_id (or equipment_tag of a control-loop-only sheet) of the first protective_vocabulary term in the text. */
  protective_function: string | null;
  /** The protective token the phrase targets, the nearest protective token, or the documented-bypass entity. */
  entity: string | null;
  language_detected: Language;
  moment: Moment | null;
  /** When the decision was taken; it precedes every gateway timestamp of the same trace (AC-ANS-08). */
  decided_at: string;
}

type ProtectiveRow = RulePack["protective_vocabulary"][number];

interface Phrase {
  text: string;
  toks: string[];
  key: string | null;
}

interface Hit {
  start: number;
  end: number;
  phrase: string;
  key: string | null;
}

interface Compiled {
  window: number;
  protective: Phrase[];
  nouns: Phrase[];
  defeat: Phrase[];
  /** Defeat phrases that report a missing permit rather than request an act ("without a permit", "tanpa izin"). */
  permitOnly: Set<string>;
  change: Phrase[];
  procedure: Phrase[];
  artefacts: Phrase[];
  entities: Phrase[];
  moments: Record<Moment, Phrase[]>;
  bahasa: Set<string>;
  labels: Set<string>;
  passive: Set<string>;
  negations: Set<string>;
  standaloneWithoutPermit: boolean;
}

/** The tokens that name a row's function: its tag and SEQ id, its initiators and every tag inside its permissive
 * lines and effect actions. */
function protectiveTerms(row: ProtectiveRow): string[] {
  const terms = new Set<string>([row.equipment_tag, ...(row.seq_id === null ? [] : [row.seq_id]), ...row.initiators]);
  for (const p of row.permissives) for (const t of tagsIn(p.text)) terms.add(t);
  for (const e of row.effects) for (const t of tagsIn(e)) terms.add(t);
  return [...terms].sort();
}

function phrases(strings: readonly string[], key: string | null = null): Phrase[] {
  return strings.map((s) => ({ text: s, toks: tokens(s), key }));
}

/** End index (exclusive) of the first match of the phrase tokens from `pi` at token `i`, or null. */
function matchEnd(
  p: readonly string[],
  pi: number,
  toks: readonly string[],
  i: number,
  alts: readonly Set<string>[],
): number | null {
  if (pi === p.length) return i;
  if (p[pi] === "*") {
    for (let k = 0; k <= GAP; k++) {
      if (i + k <= toks.length) {
        const e = matchEnd(p, pi + 1, toks, i + k, alts);
        if (e !== null) return e;
      }
    }
    return null;
  }
  if (i < toks.length && alts[i].has(p[pi])) return matchEnd(p, pi + 1, toks, i + 1, alts);
  return null;
}

/** Every occurrence of every phrase, by position, a shorter phrase before a longer one at the same start. */
function hits(list: readonly Phrase[], toks: readonly string[], alts: readonly Set<string>[]): Hit[] {
  const out: Hit[] = [];
  for (const ph of list) {
    for (let i = 0; i < toks.length; i++) {
      const e = matchEnd(ph.toks, 0, toks, i, alts);
      if (e !== null) out.push({ start: i, end: e, phrase: ph.text, key: ph.key });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Tokens between two hits; 0 when they touch or overlap. */
function gap(a: Hit, b: Hit): number {
  return Math.max(b.start - a.end, a.start - b.end, 0);
}

const compiledPacks = new WeakMap<RulePack, Compiled>();

function compile(pack: RulePack): Compiled {
  const cached = compiledPacks.get(pack);
  if (cached !== undefined) return cached;
  const lx = pack.lexicons;
  const defeatAll = [...lx.defeat.en, ...lx.defeat.id];
  const words = new Set(defeatAll.filter((p) => tokens(p).length === 1));
  const en = [...lx.defeat.en, ...lx.permanent_change.verbs_en, ...lx.procedure_phrases.en];
  const idl = [...lx.defeat.id, ...lx.permanent_change.verbs_id, ...lx.procedure_phrases.id];
  const protective = phrases(pack.generic_protective_tokens);
  for (const row of pack.protective_vocabulary) {
    protective.push(...phrases(protectiveTerms(row), row.seq_id ?? row.equipment_tag));
  }
  const enTokens = new Set(en.flatMap(tokens));
  const bahasa = new Set(BAHASA);
  for (const t of idl.flatMap(tokens)) if (!enTokens.has(t) && t !== "*") bahasa.add(t);
  const c: Compiled = {
    window: lx.window_tokens,
    protective,
    nouns: phrases(lx.permanent_change.nouns),
    defeat: phrases(defeatAll),
    // a permit phrase reports a missing permit unless a defeat word sits inside it ("override without a permit")
    permitOnly: new Set(
      defeatAll.filter((p) => {
        const t = tokens(p);
        return (t.includes("permit") || t.includes("izin")) && !t.some((x) => words.has(x));
      }),
    ),
    change: phrases([...lx.permanent_change.verbs_en, ...lx.permanent_change.verbs_id]),
    procedure: phrases([...lx.procedure_phrases.en, ...lx.procedure_phrases.id]),
    artefacts: phrases(lx.suppressions.named_artefacts),
    entities: phrases([...new Set(pack.documented_bypass_entities.map((e) => e.entity))].sort()),
    moments: {
      readiness: phrases(pack.moment_keywords.readiness),
      trip: phrases(pack.moment_keywords.trip),
      job: phrases(pack.moment_keywords.job),
      reading: phrases(pack.moment_keywords.reading),
    },
    bahasa,
    labels: new Set(lx.suppressions.record_labels),
    passive: new Set(lx.suppressions.passive_record_question_markers),
    negations: new Set(lx.suppressions.negation_prefixes),
    standaloneWithoutPermit: lx.suppressions.standalone_without_permit,
  };
  compiledPacks.set(pack, c);
  return c;
}

/** The moment with the most distinct keyword phrases; ties fall to the pack order; null when nothing matches. */
function momentOf(c: Compiled, toks: readonly string[], alts: readonly Set<string>[]): Moment | null {
  let best: Moment | null = null;
  let bestN = 0;
  for (const m of MOMENTS) {
    const n = new Set(hits(c.moments[m], toks, alts).map((h) => h.phrase)).size;
    if (n > bestN) {
      best = m;
      bestN = n;
    }
  }
  return best;
}

/** Template inference from the pack's moment_keywords (the reference's `moment`). */
export function moment(pack: RulePack, text: string): Moment | null {
  const toks = tokens(text);
  return momentOf(compile(pack), toks, alternatives(toks));
}

/**
 * Classify a text against the pack (the reference's `classify`). R1: a permanent_change verb phrase within
 * window_tokens of a protective token (a protective_vocabulary term, a generic protective token or a
 * permanent_change noun). R2: a surviving defeat phrase whose object is a protective token (one starts inside the
 * phrase or within OBJECT tokens after it). R3: a documented_bypass entity is named and a procedure phrase occurs.
 * R4: a surviving defeat phrase without a protective object. R5: none. A defeat phrase survives when it sits within
 * window_tokens of a protective token and no suppression removes it: it is not part of a named artefact, not
 * followed within CONTEXT tokens by a record label, not preceded within CONTEXT tokens by a passive marker while a
 * record label occurs in the text, and not preceded within CONTEXT tokens by a negation prefix. With
 * standalone_without_permit, permit phrases alone report a missing permit and count only beside another surviving
 * defeat phrase. A suppression never downgrades a targeted defeat phrase that survives, and naming a proof test as
 * the reason (an entity) never moves a surviving defeat into documented_bypass: R2 runs before R3.
 */
export function classify(pack: RulePack, text: string): Classification {
  const c = compile(pack);
  const toks = tokens(text);
  const alts = alternatives(toks);
  const prot = hits(c.protective, toks, alts);
  const artefacts = hits(c.artefacts, toks, alts);
  const entities = hits(c.entities, toks, alts);
  const records = toks.some((t) => c.labels.has(t));

  const near = (h: Hit, targets: readonly Hit[]): boolean => targets.some((t) => gap(h, t) <= c.window);
  const survives = (h: Hit): boolean => {
    if (artefacts.some((a) => a.start < h.end && h.start < a.end)) return false;
    if (toks.slice(h.end, h.end + CONTEXT).some((t) => c.labels.has(t))) return false;
    const before = toks.slice(Math.max(0, h.start - CONTEXT), h.start);
    if (records && before.some((t) => c.passive.has(t))) return false;
    return !before.some((t) => c.negations.has(t));
  };
  const span = (h: Hit): string => toks.slice(h.start, h.end).join(" ");
  const nearest = (h: Hit): string | null => {
    let best: Hit | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const p of prot) {
      const g = gap(h, p);
      if (g < bestGap) {
        best = p;
        bestGap = g;
      }
    }
    return best === null ? null : span(best);
  };

  let defeat = hits(c.defeat, toks, alts).filter((h) => near(h, prot) && survives(h));
  if (c.standaloneWithoutPermit && defeat.every((h) => c.permitOnly.has(h.phrase))) defeat = [];
  const targeted: Array<[Hit, Hit]> = [];
  for (const h of defeat) for (const p of prot) if (h.start <= p.start && p.start < h.end + OBJECT) targeted.push([h, p]);
  const nounHits = hits(c.nouns, toks, alts);
  const change = hits(c.change, toks, alts).filter((h) => near(h, [...prot, ...nounHits]));
  const procedure = hits(c.procedure, toks, alts);

  let decision: Pick<Classification, "intent_class" | "rule_id" | "matched_phrase" | "entity">;
  if (change.length > 0) {
    decision = {
      intent_class: "permanent_change",
      rule_id: RULES[0],
      matched_phrase: change[0].phrase,
      entity: nearest(change[0]),
    };
  } else if (targeted.length > 0) {
    const [h, p] = targeted[0];
    decision = { intent_class: "defeat", rule_id: RULES[1], matched_phrase: h.phrase, entity: span(p) };
  } else if (entities.length > 0 && procedure.length > 0) {
    decision = {
      intent_class: "documented_bypass",
      rule_id: RULES[2],
      matched_phrase: procedure[0].phrase,
      entity: entities[0].phrase,
    };
  } else if (defeat.length > 0) {
    decision = {
      intent_class: "defeat",
      rule_id: RULES[3],
      matched_phrase: defeat[0].phrase,
      entity: nearest(defeat[0]),
    };
  } else {
    decision = { intent_class: "none", rule_id: RULES[4], matched_phrase: null, entity: null };
  }
  return {
    ...decision,
    protective_function: prot.find((p) => p.key !== null)?.key ?? null,
    language_detected: toks.some((t) => c.bahasa.has(t)) ? "id" : "en",
    moment: momentOf(c, toks, alts),
    decided_at: new Date().toISOString(),
  };
}
