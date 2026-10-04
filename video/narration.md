# Narration script, TheHub_demo.mp4

The text below is the narration of the team's revised demo script of 2026-10-02, written after a frame-by-frame
review of the previous cut, verbatim, and it is the only source the captions are written from. Nothing in it is
improvised at the edit: the criterion scores pacing and narration as much as content.

One sentence differs from that script, in B4, and it differs because the picture did. The script was written against
the cut of 2026-09-07, filmed while the deployment held no page render of the P&ID, so its B4 explained a designed
404 ("When a source-page image is unavailable, The Hub says so instead of drawing a fake one"). Bundle 1.0.6 renders
the eight drawings, the re-shoot frames the drawing itself, and the honest-state point is carried by the line the
product prints under it instead: the hotspots are an agent transcription, pending review. The story function of the
beat is unchanged.

No narration was recorded for this cut (deviation D-09). The delivered audio track is AAC-LC mono silence and the
captions below are burned into the picture, so the video reads with the sound off. The script names a speaker per
beat, so recording the three voices is a human-gated remainder; `video/encode.sh` takes one file per beat from
`video/audio/` (b1 to b7, any of wav, m4a or mp3) and lays each at the start of its beat without any other change.

Every figure the captions state binds to a key of `bundle/fixtures.json` through `beats.ts`, written out in words
where the script speaks it. Where a sentence carries a quantity no fixture key holds, `beats.ts` marks it `nonfx` at
the line that writes it.

## The beat sheet

| Beat | Time | Speaker | On screen |
|---|---|---|---|
| B1 The problem | 0 to 20 s | Hafiz | Home, then the Coverage Console: 14 and 41 of 57, the method chip and the coverage bands. |
| B2 Evidence | 20 to 50 s | Elang | The seeded GA-1201A trip question and its packet, a citation opened to its drawer and to the document viewer at the source span, then the stored trace. |
| B3 Safety | 50 to 85 s | Ghaisan | The defeat request refused before any model call with the permit route, then the approved HV-6701 manual-bypass lesson with its permit conditions. |
| B4 Context and honest state | 85 to 110 s | Elang | The VSHH-1201 typed rows on the asset view, the P&ID with its transcription line, then the Failure Memory chain to WO-240007. |
| B5 From one gap to the queue | 110 to 130 s | Hafiz | The stored GA-1201A abstention trace, the records no lesson teaches, then the ranked clusters with YD-2301 first. |
| B6 Human-controlled publication | 130 to 171 s | Ghaisan | Supervisor: request, stored draft with evidence and redline, accept. Manager: publish, revision, child corpus version, recount, and the same question answered from the new lesson. |
| B7 Closing | 171 to 175 s | Hafiz | Evaluation and the deployment address. |

## Narration

**B1**, 41 words in 20 s:

> "At three in the morning, a feed pump trips. The engineer needs an answer, but the lesson was never written. Across fifty-seven unplanned-failure records, fourteen appear in no lesson at all. The Hub shows exactly where the plant's knowledge is missing."

**B2**, 40 words in 30 s:

> "Now the Engineer asks why GA-1201A tripped. Every claim links back to evidence. Open one citation and we land on the exact source, with its revision and approval status. The trace then shows how the answer was produced and checked."

**B3**, 52 words in 35 s:

> "Next, the question changes: how do we get past the trip? The Hub stops it before any model is called and points to the permit route. But when an approved bypass procedure already exists, The Hub returns it exactly as written, together with its permit conditions. Safe does not mean refusing everything."

**B4**, 46 words in 25 s:

> "The asset view connects typed tags, proof tests, and maintenance history. The drawing's hotspots were transcribed by an agent, so The Hub marks them pending review instead of passing them off as fact. Failure Memory then follows the misalignment chain to a cracked coupling element."

**B5**, 32 words in 20 s:

> "When we ask for a lesson on that task, The Hub abstains. It shows the missing coverage, then ranks the next gap to address. At the top of the queue is YD-2301."

**B6**, 60 words in 41 s:

> "From here, the workflow changes hands. The Reviewing Supervisor requests a stored draft, checks its evidence and redline result, then accepts it. The role switches to the Manager, the only persona allowed to publish. After that human decision, The Hub creates a new revision, recounts coverage in the browser sandbox, and answers the same question from the lesson just added."

**B7**, 8 words in 4 s:

> "The Hub knows what the plant is missing."

### B6 when the publication cannot be filmed

The script's own fallback, used only when the loop could not be walked to a publication on the day of the shoot
(the provider unreachable, or every draft blocked). It is factual against the footage of 2026-09-07, in which the
draft is accepted and the Manager's publish act is ready but nothing has been published.

> fallback "From here, responsibility changes hands. The Reviewing Supervisor requests and accepts a stored draft. The screen then switches to the Manager, the only role allowed to publish. Notice that the recount has not moved: publication has not happened yet. The system can prepare the work, but it cannot cross the final human gate on its own."

## Production rules

- Every model output the video shows was produced and stored before the frame that shows it was captured: the
  seeded packet, the stored traces, the drafted and redlined lesson. The disclosure badge says so on every frame.
- No spinner and no model wait is on screen. The capture is a sequence of lossless screenshots taken after each
  state has settled, so a wait costs the cut nothing.
- Role switches happen off camera, through `POST /api/auth/login` on the request context. No login form, username
  or password is ever in frame.
- The publication creates a child corpus version inside this browser's sandbox. The cut never claims a global
  activation.
- Every frame is 1920 by 1080: the deployed instance at a 1280 by 720 layout, rendered at device scale 1.5, so the
  product's own type is sharp at full screen.

## How this cut is produced

1. `bash video/run.sh pnpm exec tsx video/record.ts` renders the caption layer, then films each beat as a sequence
   of PNG frames with their durations into `video/frames/<beat>/`, and writes `video/out/beats.json`.
   `--beats b6` re-takes one beat and keeps the others.
2. `bash video/encode.sh` assembles the frames into a master, overlays the caption layer, and runs two x264 passes
   sized to the byte budget, then muxes the audio and a `mov_text` caption stream into
   `deliverables/TheHub_demo.mp4`. `bash video/encode.sh --probe` encodes the roughest twenty seconds alone first.
