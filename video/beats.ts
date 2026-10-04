// The cut: seven beats, their planned slots, and every caption cue in them (the revised demo script of 2026-10-02;
// blueprint 2.2; deviation D-37 for the delivery settings).
//
// This file is the only place the video's timing and wording live. `record.ts` reads it to pace the capture and to
// render the burn-in caption layer; `encode.sh` reads the slot lengths back out of the JSON `record.ts` writes, so
// the picture and the captions cannot drift apart: a beat is filmed to its slot exactly, and every cue's absolute
// time follows from the slots alone.
//
// The caption text is `narration.md` verbatim, split at its own sentence and clause boundaries so no line runs past
// what a reader takes in with the sound off. `checkVerbatim` reasserts that: the cues of a beat, joined with single
// spaces, must equal that beat's paragraph character for character.
//
// Numbers: every quantity a caption states is read from `bundle/fixtures.json` by key and written out in words where
// the script speaks it. A quantity no fixture key holds is marked `nonfx` at the line that writes it and nowhere else.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/* The fixture ------------------------------------------------------------------------------------------------- */

export type Fixtures = {
  method: { threshold: number };
  populations: Record<string, number>;
  coverage: Record<"generous" | "strict", Record<string, Array<{ t: number; n: number; uncovered: number }>>>;
  equipment_master: Array<{ tag: string }>;
  debt: { per_asset: Array<{ tag: string; rank: number }> };
  demo: { primary_wo: string; backup_wo: string; contrast_wo: string };
};

const BUNDLE = path.resolve(import.meta.dirname, "../bundle/fixtures.json");
const HARNESS = path.resolve(import.meta.dirname, "../../thehub-harness/packages/fixtures.json");

/** The one file every number below comes from: the bundle's copy where the repository carries one, else the harness. */
export function fixtures(): Fixtures {
  const file = existsSync(BUNDLE) ? BUNDLE : HARNESS;
  if (!existsSync(file)) throw new Error(`fixtures.json is at neither ${BUNDLE} nor ${HARNESS}`);
  return JSON.parse(readFileSync(file, "utf8")) as Fixtures;
}

/** The uncovered count and the population of one layer at the frozen threshold, as the harness scored them. */
export function headline(fx: Fixtures, layer: "generous" | "strict"): { uncovered: number; of: number } {
  const rows = fx.coverage[layer].unplanned_failure;
  const row = rows.find((r) => r.t === fx.method.threshold);
  if (row === undefined) throw new Error(`fixtures.json carries no ${layer}.unplanned_failure row at t = ${fx.method.threshold}`);
  return { uncovered: row.uncovered, of: row.n };
}

/** The asset the knowledge-debt ranking puts first: the cluster the loop beat walks. */
export function topRanked(fx: Fixtures): string {
  const first = fx.debt.per_asset.find((a) => a.rank === 1);
  if (first === undefined) throw new Error("fixtures.json ranks no asset first in debt.per_asset");
  return first.tag;
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A count as the narration speaks it: "fifty-seven", not "57". The value is the fixture's, the word is this table's. */
export function words(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) throw new Error(`words() spells 0 to 99; ${n} is outside it`);
  if (n < 20) return ONES[n];
  return n % 10 === 0 ? TENS[Math.floor(n / 10)] : `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}`;
}

/* The cut ----------------------------------------------------------------------------------------------------- */

export type Cue = {
  /** Seconds from the start of the beat. */
  at: number;
  /** Seconds from the start of the beat at which it leaves the screen. */
  until: number;
  text: string;
  /** A second line under the caption, set in mono: the deployment address on the closing card. */
  sub?: string;
};

/** B6 is filmed live when the loop can be walked to a publication, and falls back to the script's own text when not. */
export type B6Variant = "retake" | "fallback";

export type Beat = {
  id: string;
  /** The beat's name in the script's beat sheet. */
  title: string;
  /** The planned slot, in seconds. The seven sum to 175. */
  seconds: number;
  /** The team member the script gives the voice to. */
  speaker: string;
  /** What the camera frames, in the script's words, for the record the recorder writes beside the footage. */
  onScreen: string;
  /** Which narration paragraph the cues rejoin into: the beat's own, or the B6 fallback. */
  variant?: B6Variant;
  cues: Cue[];
};

/** The disclosure blueprint 2.2 and 9.12 require on screen. It is burned into the corner of every frame. */
export const REPLAY_LINE = "Every model output shown is replayed from storage.";
/** The deployment the closing card names. The live URL of D-07, which answers behind a login. */
export const DEPLOYMENT_URL = "thehub-3v.vercel.app";

export function beats(fx: Fixtures, b6: B6Variant = "retake"): Beat[] {
  const population = words(fx.populations.unplanned_failure);
  const generous = words(headline(fx, "generous").uncovered);
  const top = topRanked(fx);

  const loop: Beat =
    b6 === "retake"
      ? {
          id: "b6",
          title: "B6 Human-controlled publication",
          seconds: 41,
          speaker: "Ghaisan",
          onScreen:
            "Supervisor on the guided loop: the request, the stored draft with its evidence and redline verdict, the acceptance. Manager: the publication, the document revision, the child corpus version, the recount, and the same question answered from the new lesson.",
          variant: "retake",
          cues: [
            { at: 0, until: 4, text: "From here, the workflow changes hands." },
            { at: 4, until: 9, text: "The Reviewing Supervisor requests a stored draft," },
            { at: 9, until: 17, text: "checks its evidence and redline result," },
            { at: 17, until: 23, text: "then accepts it." },
            { at: 23, until: 30, text: "The role switches to the Manager, the only persona allowed to publish." },
            { at: 30, until: 36, text: "After that human decision, The Hub creates a new revision, recounts coverage in the browser sandbox," },
            { at: 36, until: 41, text: "and answers the same question from the lesson just added." },
          ],
        }
      : {
          id: "b6",
          title: "B6 Human-controlled publication (fallback)",
          seconds: 41,
          speaker: "Ghaisan",
          onScreen:
            "The footage of 2026-09-07: the stored draft accepted by the Reviewing Supervisor, the Manager's publish act ready, and the recount panel stating that no publication has recounted this browser's corpus.",
          variant: "fallback",
          cues: [
            { at: 0, until: 6, text: "From here, responsibility changes hands." },
            { at: 6, until: 16, text: "The Reviewing Supervisor requests and accepts a stored draft." },
            { at: 23, until: 30, text: "The screen then switches to the Manager, the only role allowed to publish." },
            { at: 30, until: 36, text: "Notice that the recount has not moved: publication has not happened yet." },
            { at: 36, until: 41, text: "The system can prepare the work, but it cannot cross the final human gate on its own." },
          ],
        };

  return [
    {
      id: "b1",
      title: "B1 The problem",
      seconds: 20,
      speaker: "Hafiz",
      onScreen: "Home, then the Coverage Console: the records no lesson mentions and the records whose only trace is a copied row, the method chip and the three bands.",
      cues: [
        // nonfx: "three in the morning" is the story's hour, not a quantity of the corpus, and no fixture key holds it.
        { at: 0, until: 4.5, text: "At three in the morning, a feed pump trips." },
        { at: 4.5, until: 9.5, text: "The engineer needs an answer, but the lesson was never written." },
        { at: 9.5, until: 15, text: `Across ${population} unplanned-failure records, ${generous} appear in no lesson at all.` },
        { at: 15, until: 20, text: "The Hub shows exactly where the plant's knowledge is missing." },
      ],
    },
    {
      id: "b2",
      title: "B2 Evidence",
      seconds: 30,
      speaker: "Elang",
      onScreen:
        "The seeded GA-1201A trip question replayed from storage, its claims with their citation chips, one citation opened to its drawer and to the document viewer at the source span, then the stored trace.",
      cues: [
        { at: 0, until: 5, text: "Now the Engineer asks why GA-1201A tripped." },
        { at: 5, until: 10, text: "Every claim links back to evidence." },
        { at: 10, until: 15, text: "Open one citation and we land on the exact source," },
        { at: 15, until: 20, text: "with its revision and approval status." },
        { at: 20, until: 30, text: "The trace then shows how the answer was produced and checked." },
      ],
    },
    {
      id: "b3",
      title: "B3 Safety",
      seconds: 35,
      speaker: "Ghaisan",
      onScreen:
        "A request to get past the SEQ-1201 trip refused by the rule pack before any model call, with the governing sheet, the permissives and the permit route; then the approved HV-6701 manual-bypass lesson with its permit conditions.",
      cues: [
        { at: 0, until: 6, text: "Next, the question changes: how do we get past the trip?" },
        { at: 6, until: 14, text: "The Hub stops it before any model is called and points to the permit route." },
        { at: 14, until: 20, text: "But when an approved bypass procedure already exists," },
        { at: 20, until: 28, text: "The Hub returns it exactly as written, together with its permit conditions." },
        { at: 28, until: 35, text: "Safe does not mean refusing everything." },
      ],
    },
    {
      id: "b4",
      title: "B4 Context and honest state",
      seconds: 25,
      speaker: "Elang",
      onScreen: `The VSHH-1201 typed rows and related work orders on the asset view, the Set 1 P&ID with its transcription line, then the misalignment chain to ${fx.demo.primary_wo}.`,
      cues: [
        { at: 0, until: 7, text: "The asset view connects typed tags, proof tests, and maintenance history." },
        { at: 7, until: 12, text: "The drawing's hotspots were transcribed by an agent," },
        { at: 12, until: 17, text: "so The Hub marks them pending review instead of passing them off as fact." },
        { at: 17, until: 25, text: "Failure Memory then follows the misalignment chain to a cracked coupling element." },
      ],
    },
    {
      id: "b5",
      title: "B5 From one gap to the queue",
      seconds: 20,
      speaker: "Hafiz",
      onScreen: `The stored GA-1201A abstention trace, the records no lesson teaches on that asset, then the ranked knowledge-debt clusters with ${top} first.`,
      cues: [
        { at: 0, until: 6, text: "When we ask for a lesson on that task, The Hub abstains." },
        { at: 6, until: 13, text: "It shows the missing coverage, then ranks the next gap to address." },
        { at: 13, until: 20, text: `At the top of the queue is ${top}.` },
      ],
    },
    loop,
    {
      id: "b7",
      title: "B7 Closing",
      seconds: 4,
      speaker: "Hafiz",
      onScreen: "The Evaluation page and the deployment address.",
      cues: [{ at: 0, until: 4, text: "The Hub knows what the plant is missing.", sub: DEPLOYMENT_URL }],
    },
  ];
}

/* The timeline ------------------------------------------------------------------------------------------------ */

export type TimedCue = Cue & { start: number; end: number; beat: string };

/** Every cue of the cut on one absolute clock, in order. The beat slots alone decide where each one lands. */
export function timeline(list: Beat[]): TimedCue[] {
  const out: TimedCue[] = [];
  let offset = 0;
  for (const beat of list) {
    for (const cue of beat.cues) {
      if (cue.until > beat.seconds) throw new Error(`${beat.id}: a cue runs to ${cue.until} s, past the ${beat.seconds} s slot`);
      out.push({ ...cue, beat: beat.id, start: offset + cue.at, end: offset + cue.until });
    }
    offset += beat.seconds;
  }
  return out;
}

export const totalSeconds = (list: Beat[]): number => list.reduce((sum, b) => sum + b.seconds, 0);

const stamp = (seconds: number): string => {
  const ms = Math.round(seconds * 1000);
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor(ms / 60_000) % 60).padStart(2, "0");
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
};

/** SubRip, as both the burned-in layer and the embedded `mov_text` stream are written from. */
export function srt(cues: TimedCue[]): string {
  return (
    cues
      .map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.sub ? `${c.text}\n${c.sub}` : c.text}\n`)
      .join("\n") + "\n"
  );
}

/**
 * The verbatim check: a beat's cues, joined with single spaces, must reproduce that beat's paragraph of
 * `narration.md` exactly, so a caption cannot quietly reword the script. The closing card's URL is the cut's own
 * furniture and is not part of the narration; the B6 fallback rejoins into the fallback paragraph.
 */
export function checkVerbatim(list: Beat[], narration: string): string[] {
  const paragraphs = [...narration.matchAll(/^> "(.+)"$/gm)].map((m) => m[1]);
  const fallback = /^> fallback "(.+)"$/m.exec(narration)?.[1];
  const problems: string[] = [];
  if (paragraphs.length !== list.length) {
    problems.push(`narration.md quotes ${paragraphs.length} beat paragraphs, the cut has ${list.length}`);
    return problems;
  }
  list.forEach((beat, i) => {
    const joined = beat.cues.map((c) => c.text).join(" ");
    const expected = beat.variant === "fallback" ? fallback : paragraphs[i];
    if (joined !== expected) {
      problems.push(`${beat.id}: the cues do not rejoin into the narration paragraph\n  cues: ${joined}\n  text: ${expected}`);
    }
  });
  return problems;
}
