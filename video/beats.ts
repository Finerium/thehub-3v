// The cut: six beats, their planned slots, and every caption cue in them (blueprint 2.2, PRD 26.2, 9.12).
//
// This file is the only place the video's timing and wording live. `record.ts` reads it to pace the capture and to
// render the burn-in caption layer; `encode.sh` reads the slot lengths out of the JSON `record.ts` writes beside
// the footage, so the picture and the captions cannot drift apart: a beat is trimmed or held to its slot, never
// stretched, and every cue's absolute time follows from the slots alone.
//
// The caption text is the PRD's 26.2 narration verbatim, split at its own sentence and clause boundaries so no line
// runs past what a reader can take in at 15 frames per second. `checkVerbatim` reasserts that: the cues of a beat,
// joined with single spaces, must equal that beat's paragraph in `narration.md` character for character.
//
// Numbers: every quantity a caption states is substituted from `packages/fixtures.json` by key at build time.
// The three rounded quantities the script's own prose carries, which no fixture key holds, are marked `nonfx` at
// the line that writes them and nowhere else.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/* The fixture ------------------------------------------------------------------------------------------------- */

export type InterlockRow = {
  id: string;
  tag: string;
  row_kind: string;
  setpoint_value: number | null;
  setpoint_unit: string | null;
  voting: string | null;
};
export type Fixtures = {
  method: { threshold: number };
  populations: Record<string, number>;
  coverage: Record<"generous" | "strict", Record<string, Array<{ t: number; n: number; uncovered: number }>>>;
  equipment_master: Array<{ tag: string }>;
  interlock_rows: Record<string, { header: { logic_no: string; sil_text: string }; rows: InterlockRow[] }>;
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
function headline(fx: Fixtures, layer: "generous" | "strict"): { uncovered: number; of: number } {
  const rows = fx.coverage[layer].unplanned_failure;
  const row = rows.find((r) => r.t === fx.method.threshold);
  if (row === undefined) throw new Error(`fixtures.json carries no ${layer}.unplanned_failure row at t = ${fx.method.threshold}`);
  return { uncovered: row.uncovered, of: row.n };
}

/** One typed interlock row of an asset, by the instrument tag the sheet gives it. */
function interlockRow(fx: Fixtures, tag: string, instrument: string): InterlockRow {
  const rows = fx.interlock_rows[tag]?.rows ?? [];
  const row = rows.find((r) => r.tag === instrument);
  if (row === undefined) throw new Error(`fixtures.json types no ${instrument} row on the ${tag} cause-and-effect sheet`);
  return row;
}

/** The script says "Eight assets", not "8 assets": the count is the fixture's, the word is this table's. */
const CARDINALS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const cardinal = (n: number): string => (n < CARDINALS.length ? CARDINALS[n] : String(n));
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/* The cut ----------------------------------------------------------------------------------------------------- */

export type Cue = {
  /** Seconds from the start of the beat. */
  at: number;
  /** Seconds from the start of the beat at which it leaves the screen. */
  until: number;
  text: string;
  /** The caveat register: amber rim and the caveat ink, for the replay disclosure alone. */
  tone?: "caveat";
  /** A second line under the caption, set in mono: the deployment address on the closing card. */
  sub?: string;
};

export type Beat = {
  id: string;
  /** The beat's name in the PRD's own beat sheet. */
  title: string;
  /** The planned slot, in seconds. The six sum to 175. */
  seconds: number;
  /** What the camera frames, in the PRD's words, for the record the recorder writes beside the footage. */
  onScreen: string;
  cues: Cue[];
};

/** The disclosure blueprint 2.2 and 9.12 require on screen. It is burned into every frame and is also cue one. */
export const REPLAY_LINE = "Every model output shown is replayed from storage.";
/** The deployment the closing card names. The live URL of D-07, which answers behind a login. */
export const DEPLOYMENT_URL = "thehub-3v.vercel.app";

export function beats(fx: Fixtures): Beat[] {
  const assets = cardinal(fx.equipment_master.length);
  const population = fx.populations.unplanned_failure;
  const generous = headline(fx, "generous").uncovered;
  const strict = headline(fx, "strict").uncovered;
  const ga = fx.interlock_rows["GA-1201A"];
  const vs = interlockRow(fx, "GA-1201A", "VSHH-1201");
  const setpoint = `${vs.setpoint_value} ${vs.setpoint_unit} RMS`;
  const primaryWo = fx.demo.primary_wo;

  return [
    {
      id: "b1",
      title: "B1 Hook",
      seconds: 20,
      onScreen:
        "The Coverage Console with the method chip beside the number: the records no lesson mentions, and the records whose only trace is a copied row.",
      cues: [
        { at: 0, until: 3.5, text: REPLAY_LINE, tone: "caveat" },
        // nonfx: "eighteen months" is the script's own rounding of the workbook window and no fixture key holds it.
        { at: 3.5, until: 8, text: `${capital(assets)} assets, eighteen months of maintenance history.` },
        { at: 8, until: 13.5, text: `Of the ${population} work orders that record an unplanned failure, ${generous} are mentioned by no lesson at all.` },
        { at: 13.5, until: 17, text: `${strict} have nothing beyond a pasted work-order row.` },
        { at: 17, until: 20, text: "The method is on the screen. This is The Hub." },
      ],
    },
    {
      id: "b2",
      title: "B2 Ask",
      seconds: 30,
      onScreen:
        "The GA-1201A vibration question: the evidence packet, the typed setpoint carrying its sheet's own note, the effects it actuates, and a citation chip clicked through to the span it came from.",
      cues: [
        { at: 0, until: 5, text: "An engineer asks why the hexane feed pump tripped." },
        { at: 5, until: 9, text: "Every claim carries its citation chip." },
        { at: 9, until: 16, text: `The trip setpoint is typed from the cause-and-effect sheet: ${vs.tag} above ${setpoint} with ${vs.voting} voting,` },
        { at: 16, until: 21, text: `on the ${ga.header.logic_no} logic the sheet types as ${ga.header.sil_text},` },
        { at: 21, until: 26, text: "and it renders with that sheet's own note that its trip set points are DUMMY training values." },
        { at: 26, until: 30, text: "Click the chip and the document opens at the span the number came from." },
      ],
    },
    {
      id: "b3",
      title: "B3 Safety",
      seconds: 35,
      onScreen:
        "A request to defeat the trip refused before any model call, with the permit route and the documented reset path shown; then the approved HV-6701 manual bypass answered verbatim from its own lesson.",
      cues: [
        { at: 0, until: 6, text: "Ask how to get past that trip, and it refuses before any model call." },
        { at: 6, until: 13, text: "It names the sequence and its SIL, shows the documented permissives and the reset path," },
        { at: 13, until: 18, text: "and hands over the interlock bypass permit route." },
        { at: 18, until: 25, text: "Now ask how to line up the authorised HV-6701 manual bypass, a procedure this plant has approved and written down." },
        { at: 25, until: 31, text: "It returns that procedure verbatim, with its permit conditions." },
        { at: 31, until: 35, text: "Refusing everything is not safety." },
      ],
    },
    {
      id: "b4",
      title: "B4 Context",
      seconds: 25,
      onScreen: `A P&ID hotspot to the VSHH-1201 tag card, the setpoint ladder and the last proof test, then the misalignment chain ending at ${primaryWo}.`,
      cues: [
        { at: 0, until: 4, text: "The P&ID is the index." },
        { at: 4, until: 10, text: "Click the vibration switch on the Set 1 drawing and the tag card opens:" },
        { at: 10, until: 16, text: "the setpoint ladder built from typed rows, the last proof test, the documents that cite it." },
        { at: 16, until: 25, text: `Follow the misalignment chain and it ends at ${primaryWo}, a cracked coupling element.` },
      ],
    },
    {
      id: "b5",
      title: "B5 Gap",
      seconds: 20,
      onScreen: "The partial answer: alignment is covered, the coupling element is not, and the uncovered cluster it belongs to is shown behind it.",
      cues: [
        { at: 0, until: 7, text: "Ask what lesson covers coupling-element inspection and The Hub answers the part it can and names the part it cannot." },
        // nonfx: "Two lessons" is the script's own count of the alignment lessons and no fixture key holds it.
        { at: 7, until: 13, text: "Two lessons cover alignment. None covers the coupling element." },
        { at: 13, until: 20, text: "Here is the uncovered cluster it sits in." },
      ],
    },
    {
      id: "b6",
      title: "B6 Loop",
      seconds: 45,
      onScreen:
        "The draft with provenance on every element and the replacement interval left as its slot, then the SME note entered and signed, the redline pass, the manager's publication, the version increment, and the same question answered from the new lesson. Closing line and URL.",
      cues: [
        { at: 0, until: 4, text: "The supervisor requests a draft." },
        { at: 4, until: 10, text: "It arrives in the plant's own six-section template, every element bound to the evidence it came from," },
        { at: 10, until: 17, text: "and the replacement interval left as the literal slot REQUIRES ENGINEER INPUT, because no supplied document states one." },
        { at: 17, until: 22, text: "The supervisor fills that slot with a signed note." },
        { at: 22, until: 26, text: "The redliner passes it." },
        { at: 26, until: 30, text: "The manager publishes, in one transaction." },
        { at: 30, until: 36, text: "The corpus version increments, coverage is recomputed," },
        { at: 36, until: 41, text: "and the question that abstained a minute ago now answers, cited to a lesson that did not exist when this video started." },
        { at: 41, until: 45, text: "The Hub knows what it is missing.", sub: DEPLOYMENT_URL },
      ],
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
 * The verbatim check: the narration of `narration.md` is the PRD's 26.2 text, and a beat's cues are that text split.
 * Joining them back must reproduce the paragraph exactly, so a caption cannot quietly reword the script. The
 * disclosure cue and the closing card's URL are the cut's own furniture and are not part of the narration.
 */
export function checkVerbatim(list: Beat[], narration: string): string[] {
  const paragraphs = [...narration.matchAll(/^> "(.+)"$/gm)].map((m) => m[1]);
  const problems: string[] = [];
  if (paragraphs.length !== list.length) {
    problems.push(`narration.md quotes ${paragraphs.length} beat paragraphs, the cut has ${list.length}`);
    return problems;
  }
  list.forEach((beat, i) => {
    const joined = beat.cues
      .filter((c) => c.text !== REPLAY_LINE)
      .map((c) => c.text)
      .join(" ");
    if (joined !== paragraphs[i]) {
      problems.push(`${beat.id}: the cues do not rejoin into the narration paragraph\n  cues: ${joined}\n  text: ${paragraphs[i]}`);
    }
  });
  return problems;
}
