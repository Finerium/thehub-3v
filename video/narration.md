# Narration script, TheHub_demo.mp4

The text below is the PRD's chapter 26.2 narration, verbatim, and it is the only source the captions are written
from. It is held here beside `captions.srt` because the blueprint's 9.12 requires the script to live in the
repository next to them. Nothing in it is improvised at the edit: the criterion scores pacing and narration as much
as content, so the words are fixed before the shoot rather than after it.

No narration was recorded for this cut (deviation D-09). The delivered audio track is AAC-LC mono silence and the
captions below are burned into the picture, so the video reads with the sound off. Recording a voice to this script
is a human-gated remainder, named as such in the Report; the encode pipeline takes a narration file without any
other change when one exists.

Every figure the script states binds to a key of `packages/fixtures.json` through `beats.ts`. Where the script's own
sentence carries a rounded quantity that no fixture key holds, `beats.ts` marks it `nonfx` at the line that writes
it.

## The beat sheet

| Beat | Time | On screen |
|---|---|---|
| B1 Hook | 0 to 20 s | The Coverage Console with the method chip beside the number: the records no lesson mentions, and the records whose only trace is a copied row. |
| B2 Ask | 20 to 50 s | The GA-1201A vibration question: the evidence packet, the typed setpoint carrying its sheet's own note, the effects it actuates, and a citation chip clicked through to the span it came from. |
| B3 Safety | 50 to 85 s | A request to defeat the trip refused before any model call, with the permit route and the documented reset path shown; then the approved HV-6701 manual bypass answered verbatim from its own lesson. |
| B4 Context | 85 to 110 s | A P&ID hotspot to the VSHH-1201 tag card, the setpoint ladder and the last proof test, then the misalignment chain ending at WO-240007. |
| B5 Gap | 110 to 130 s | The partial answer: alignment is covered, the coupling element is not, and the uncovered cluster it belongs to is shown behind it. |
| B6 Loop | 130 to 175 s | The draft with provenance on every element and the replacement interval left as its slot, then the SME note entered and signed, the redline pass, the manager's publication, the version increment, and the same question answered from the new lesson. Closing line and URL. |

## Narration, as recorded

The script is fixed here rather than improvised at the edit, because the criterion scores pacing and narration as
much as content.

**B1**, about 45 words in 20 s:

> "Eight assets, eighteen months of maintenance history. Of the 57 work orders that record an unplanned failure, 14 are mentioned by no lesson at all. 41 have nothing beyond a pasted work-order row. The method is on the screen. This is The Hub."

**B2**:

> "An engineer asks why the hexane feed pump tripped. Every claim carries its citation chip. The trip setpoint is typed from the cause-and-effect sheet: VSHH-1201 above 7.1 mm/s RMS with 1oo2 voting, on the SEQ-1201 logic the sheet types as SIL 1, and it renders with that sheet's own note that its trip set points are DUMMY training values. Click the chip and the document opens at the span the number came from."

**B3**, about 72 words in 35 s, the slowest beat in the cut because it is the one that has to land first time:

> "Ask how to get past that trip, and it refuses before any model call. It names the sequence and its SIL, shows the documented permissives and the reset path, and hands over the interlock bypass permit route. Now ask how to line up the authorised HV-6701 manual bypass, a procedure this plant has approved and written down. It returns that procedure verbatim, with its permit conditions. Refusing everything is not safety."

**B4**:

> "The P&ID is the index. Click the vibration switch on the Set 1 drawing and the tag card opens: the setpoint ladder built from typed rows, the last proof test, the documents that cite it. Follow the misalignment chain and it ends at WO-240007, a cracked coupling element."

**B5**:

> "Ask what lesson covers coupling-element inspection and The Hub answers the part it can and names the part it cannot. Two lessons cover alignment. None covers the coupling element. Here is the uncovered cluster it sits in."

**B6**:

> "The supervisor requests a draft. It arrives in the plant's own six-section template, every element bound to the evidence it came from, and the replacement interval left as the literal slot REQUIRES ENGINEER INPUT, because no supplied document states one. The supervisor fills that slot with a signed note. The redliner passes it. The manager publishes, in one transaction. The corpus version increments, coverage is recomputed, and the question that abstained a minute ago now answers, cited to a lesson that did not exist when this video started. The Hub knows what it is missing."

## Production rules

Narration is recorded to this script and the captions are burned into the picture, so the video reads with the
sound off. Every model call the video shows is generated before the recording and played back from the stored
draft, trace and packet: the loop beat shows a stored draft, never a spinner, and the recording says so on screen
rather than implying a live call. Capture is 1280 by 720 on the deployed instance with the seeded corpus version
active, recorded by Playwright and delivered at 15 frames per second. Two drafts are prepared and reviewed before
the shoot, WO-240007 as the primary and WO-240039 as the backup, so a weak draft is a swap rather than a re-plan.

## How this cut was produced

1. `bash video/run.sh pnpm exec tsx video/record.ts` signs in through `POST /api/auth/login` with the three demo
   accounts, so no login field and no credential is ever on camera. It then warms every model-backed artefact the
   cut shows (the answer traces and the drafted, redlined lesson) before the camera rolls, records the six beats
   into `video/raw/`, writes `video/captions.srt` from `video/beats.ts`, and renders the burn-in caption layer into
   `video/frames/`.
2. `bash video/encode.sh` trims or holds each beat to its planned slot, concatenates them, overlays the caption
   layer, runs the two x264 passes with the rate the PRD's 26.3 fixes, muxes silent AAC-LC mono and a `mov_text`
   caption stream, and writes `deliverables/TheHub_demo.mp4` with an ffprobe report beside it in `video/out/`.
3. `bash video/encode.sh --probe` runs the roughest twenty seconds alone, which is the test encode that confirms
   the bitrate before the full run.
