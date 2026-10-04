// The video pipeline as tests (blueprint 2.2 and 11.9 AC-DEL-03, AC-DEL-06; the revised script of 2026-10-02;
// deviation D-37 for the delivery settings).
//
// video/beats.ts is the one place the cut's timing and wording live: record.ts films each beat to its slot from it and
// writes video/captions.srt out of it, and encode.sh reads the frame lists and slots back out of video/out/beats.json.
// Three layers of check follow that shape.
//
//   1. The cut, hermetic and always run. Seven beats in their planned slots summing to 175 s, for the B6 retake and
//      for its fallback alike; every cue inside its beat; the captions on disk equal to the ones beats.ts generates
//      for the B6 the take carries; the narration reproduced character for character by `checkVerbatim`; every
//      quantity a caption states read from the fixture rather than typed, with the one story quantity marked `nonfx`.
//   2. The delivery settings, from video/encode.sh. ffprobe cannot report two-pass or the tune, so the flags are held
//      against the script that applies them, and so is the absence of a rate ceiling (D-37).
//   3. The artefact, when deliverables/TheHub_demo.mp4 exists: duration, resolution, frame rate, the codecs, the
//      embedded mov_text caption stream, the audio track and the byte budget, all by ffprobe.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { beats, checkVerbatim, DEPLOYMENT_URL, fixtures, headline, REPLAY_LINE, srt, timeline, topRanked, totalSeconds, words, type B6Variant } from "../../video/beats";

const REPO = process.cwd();
const VIDEO_DIR = path.join(REPO, "video");
const CAPTIONS = path.join(VIDEO_DIR, "captions.srt");
const NARRATION = path.join(VIDEO_DIR, "narration.md");
const BEATS_TS = path.join(VIDEO_DIR, "beats.ts");
const RECORD_TS = path.join(VIDEO_DIR, "record.ts");
const ENCODE = path.join(VIDEO_DIR, "encode.sh");
const LAYER = path.join(VIDEO_DIR, "frames", "captions");
const RECORDED = path.join(VIDEO_DIR, "out", "beats.json");
const TEST_ENCODE = path.join(VIDEO_DIR, "out", "test-encode-20s.txt");
const AUDIO_DIR = path.join(VIDEO_DIR, "audio");
const MP4 = path.join(REPO, "deliverables", "TheHub_demo.mp4");

/** The video contract as D-37 restates 9.12: the byte budget and the limit stand, the picture is 1080p at 25 fps. */
const CONTRACT = {
  bytes: 5_000_000,
  limitSeconds: 180,
  plannedSeconds: 175,
  width: 1920,
  height: 1080,
  fps: 25,
  slots: [20, 30, 35, 25, 20, 41, 4],
};

const has = (tool: string) => spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).status === 0;
const ffprobeReady = has("ffprobe") && existsSync(MP4);

const fx = fixtures();
const recorded = existsSync(RECORDED) ? (JSON.parse(readFileSync(RECORDED, "utf8")) as { b6_variant?: B6Variant }) : null;
/** The B6 the take on disk carries; the captions on disk are written for it. */
const variant: B6Variant = recorded?.b6_variant ?? "retake";
const cut = beats(fx, variant);
const cues = timeline(cut);
const captions = readFileSync(CAPTIONS, "utf8");
const narration = readFileSync(NARRATION, "utf8");

/* ================================================================================================================
 * 1. The cut
 * ============================================================================================================== */

describe("video/beats.ts is the cut (the revised script of 2026-10-02)", () => {
  it.each(["retake", "fallback"] as const)("holds seven beats in their planned slots, summing to the planned duration (B6 %s)", (b6) => {
    const list = beats(fx, b6);
    expect(list.map((b) => b.id)).toEqual(["b1", "b2", "b3", "b4", "b5", "b6", "b7"]);
    expect(list.map((b) => b.seconds)).toEqual(CONTRACT.slots);
    expect(totalSeconds(list)).toBe(CONTRACT.plannedSeconds);
  });

  it.each(["retake", "fallback"] as const)("places every cue inside its own beat and on one rising clock (B6 %s)", (b6) => {
    const list = beats(fx, b6);
    for (const beat of list) {
      for (const cue of beat.cues) {
        expect(cue.at, `${beat.id}: a cue starts at ${cue.at}`).toBeGreaterThanOrEqual(0);
        expect(cue.until, `${beat.id}: a cue runs past its ${beat.seconds} s slot`).toBeLessThanOrEqual(beat.seconds);
        expect(cue.until).toBeGreaterThan(cue.at);
      }
    }
    const all = timeline(list);
    const starts = all.map((c) => c.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(all[all.length - 1].end).toBe(CONTRACT.plannedSeconds);
  });

  it("closes on the deployment address, and burns the replay disclosure into the corner of every frame", () => {
    expect(cues[cues.length - 1].sub).toBe(DEPLOYMENT_URL);
    expect(captions.trimEnd().endsWith(DEPLOYMENT_URL)).toBe(true);
    // The disclosure is the caption layer's own badge, written once into the layer page record.ts renders.
    const record = readFileSync(RECORD_TS, "utf8");
    expect(record).toContain('<div id="badge"></div>');
    expect(record).toContain("REPLAY_LINE");
    expect(REPLAY_LINE).toBe("Every model output shown is replayed from storage.");
  });

  it.each(["retake", "fallback"] as const)("reproduces the narration character for character (B6 %s)", (b6) => {
    expect(checkVerbatim(beats(fx, b6), narration)).toEqual([]);
  });

  it("keeps video/captions.srt exactly as beats.ts generates it for the B6 the take carries", () => {
    expect(captions).toBe(srt(cues));
    expect((captions.match(/ --> /g) ?? []).length).toBe(cues.length);
  });
});

describe("every quantity a caption states comes from the fixture (invariant 6)", () => {
  const spoken = timeline(beats(fx, "retake"))
    .map((c) => c.text)
    .join(" ");

  it("speaks the population and the generous headline as the fixture scores them, in words", () => {
    expect(fx.populations.unplanned_failure).toBe(headline(fx, "generous").of);
    expect(spoken).toContain(`Across ${words(fx.populations.unplanned_failure)} unplanned-failure records, ${words(headline(fx, "generous").uncovered)} appear in no lesson at all.`);
  });

  it("names the asset the knowledge-debt ranking puts first", () => {
    expect(spoken).toContain(`At the top of the queue is ${topRanked(fx)}.`);
  });

  it("spells counts the way the narration speaks them", () => {
    expect(words(57)).toBe("fifty-seven");
    expect(words(14)).toBe("fourteen");
    expect(words(40)).toBe("forty");
    expect(() => words(100)).toThrow();
  });

  it("marks the one story quantity no fixture key holds, and only that one", () => {
    const source = readFileSync(BEATS_TS, "utf8");
    const marks = source.split("\n").filter((line) => line.trim().startsWith("// nonfx:"));
    expect(marks.length).toBe(1);
    expect(spoken).toContain("At three in the morning");
  });
});

describe("the caption files carry nothing banned (AC-DEL-06)", () => {
  const scan = (mode: string) =>
    spawnSync("bash", [path.join(REPO, "tools", "banned-strings.sh"), mode, "video/narration.md", "video/captions.srt"], {
      cwd: REPO,
      encoding: "utf8",
    });

  it("passes both scans of tools/banned-strings.sh over the narration and the captions", () => {
    const names = scan("--names");
    expect(names.status, names.stdout + names.stderr).toBe(0);
    const english = scan("--english");
    expect(english.status, english.stdout + english.stderr).toBe(0);
  });

  it("carries no placeholder marker and no em dash", () => {
    for (const [name, text] of [
      ["narration.md", narration],
      ["captions.srt", captions],
    ] as const) {
      expect(text.match(/TBD_[A-Z_]+/g), name).toBeNull();
      expect(text, name).not.toMatch(/[—–]/);
    }
  });
});

/* ================================================================================================================
 * 2. The delivery settings
 * ============================================================================================================== */

describe("video/encode.sh applies the delivery settings of D-37", () => {
  const encode = readFileSync(ENCODE, "utf8");

  it("pins the geometry, the frame rate, the tune and the budget", () => {
    for (const setting of [
      `WIDTH=${CONTRACT.width}`,
      `HEIGHT=${CONTRACT.height}`,
      `FPS=${CONTRACT.fps}`,
      "TUNE=animation",
      "AUDIO_RATE=32k",
      `BUDGET_BYTES=${CONTRACT.bytes}`,
      `LIMIT_SECONDS=${CONTRACT.limitSeconds}`,
      `PLANNED_SECONDS=${CONTRACT.plannedSeconds}`,
    ]) {
      expect(encode, setting).toContain(setting);
    }
  });

  it("encodes in two x264 passes at a rate computed from the budget, with no ceiling that starves a cut", () => {
    expect(encode).toContain("-pass 1");
    expect(encode).toContain("-pass 2");
    expect(encode).toContain("-c:v libx264");
    expect(encode).toContain('-tune "$TUNE"');
    expect(encode).toContain("rate_for");
    expect(encode).not.toMatch(/-maxrate|-bufsize/);
    expect(encode).toContain("anullsrc=channel_layout=mono:sample_rate=48000");
    expect(encode).toContain("-c:a aac -profile:a aac_low -ac 1");
    expect(encode).toContain("-c:s mov_text");
  });

  it("keeps the test encode of the roughest twenty seconds ahead of the full run (AC-DEL-03)", () => {
    expect(encode).toContain("--probe");
    expect(existsSync(TEST_ENCODE), "video/out/test-encode-20s.txt is the evidence the rate was measured").toBe(true);
    const report = readFileSync(TEST_ENCODE, "utf8");
    const extrapolated = Number(/extrapolated\s+(\d+) bytes/.exec(report)?.[1] ?? "0");
    expect(extrapolated).toBeGreaterThan(0);
    expect(extrapolated).toBeLessThanOrEqual(CONTRACT.bytes);
    expect(report).toContain("INSIDE the budget");
    expect(report).toContain("the roughest window holds 30 dB even at the flat rate");
  });

  it.skipIf(!existsSync(path.join(VIDEO_DIR, "out", "probe.txt")))("records the delivered picture against the master, over the cut and its roughest 20 s", () => {
    const probe = readFileSync(path.join(VIDEO_DIR, "out", "probe.txt"), "utf8");
    const m = /picture\s+([\d.]+) dB PSNR against the master over the cut; ([\d.]+) dB over its roughest 20 s/.exec(probe);
    expect(m, "video/out/probe.txt records no delivered PSNR").not.toBeNull();
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(38);
    expect(Number(m?.[2])).toBeGreaterThanOrEqual(38);
  });
});

describe.skipIf(!existsSync(RECORDED))("video/out/beats.json records the take the encode reads", () => {
  type Recorded = {
    width: number;
    height: number;
    fps: number;
    total_seconds: number;
    b6_variant: B6Variant;
    beats: Array<{ id: string; seconds: number; concat: string | null }>;
  };

  it("agrees with beats.ts on every slot and with D-37 on the geometry, and names a frame list for every beat", () => {
    const take = JSON.parse(readFileSync(RECORDED, "utf8")) as Recorded;
    expect(take.width).toBe(CONTRACT.width);
    expect(take.height).toBe(CONTRACT.height);
    expect(take.fps).toBe(CONTRACT.fps);
    expect(take.total_seconds).toBe(CONTRACT.plannedSeconds);
    expect(take.beats.map((b) => b.id)).toEqual(cut.map((b) => b.id));
    expect(take.beats.map((b) => b.seconds)).toEqual(cut.map((b) => b.seconds));
    for (const beat of take.beats) expect(beat.concat, `${beat.id} carries no frame list`).toMatch(/^video\/frames\/b\d\/frames\.ffconcat$/);
  });
});

describe.skipIf(!existsSync(LAYER))("the burned-in caption layer covers every cue (D-09)", () => {
  it("renders one frame per segment of the strip and lists each in the concat file", () => {
    const frames = readdirSync(LAYER).filter((f) => /^cue-\d+\.png$/.test(f));
    expect(frames.length).toBeGreaterThanOrEqual(cues.length);
    const concat = readFileSync(path.join(LAYER, "captions.ffconcat"), "utf8");
    expect(concat.startsWith("ffconcat version 1.0")).toBe(true);
    for (const frame of frames) expect(concat, frame).toContain(frame);
  });
});

/* ================================================================================================================
 * 3. The artefact
 * ============================================================================================================== */

describe.skipIf(!ffprobeReady)("deliverables/TheHub_demo.mp4 by ffprobe (AC-DEL-03)", () => {
  type Probe = {
    format: { duration: string; size: string; bit_rate: string; format_name: string };
    streams: Array<Record<string, string | number>>;
  };
  /** One ffprobe run, on first use, so a checkout without ffprobe or without the artefact collects and skips. */
  let cached: Probe | undefined;
  const probed = (): Probe => {
    cached ??= JSON.parse(
      spawnSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", MP4], {
        encoding: "utf8",
      }).stdout,
    ) as Probe;
    return cached;
  };
  const stream = (kind: string) => {
    const found = probed().streams.find((s) => s.codec_type === kind);
    if (found === undefined) throw new Error(`the delivered file carries no ${kind} stream`);
    return found;
  };

  it("runs to the planned duration, inside the 180 second limit", () => {
    const seconds = Number(probed().format.duration);
    expect(seconds).toBeLessThanOrEqual(CONTRACT.limitSeconds);
    expect(seconds).toBeCloseTo(CONTRACT.plannedSeconds, 1);
  });

  it("is 1920 by 1080 at 25 frames per second, x264 in a progressive 4:2:0 picture", () => {
    const video = stream("video");
    expect(video.codec_name).toBe("h264");
    expect(video.width).toBe(CONTRACT.width);
    expect(video.height).toBe(CONTRACT.height);
    expect(video.r_frame_rate).toBe(`${CONTRACT.fps}/1`);
    expect(video.avg_frame_rate).toBe(`${CONTRACT.fps}/1`);
    expect(video.pix_fmt).toBe("yuv420p");
    expect(Number(video.nb_frames)).toBe(CONTRACT.plannedSeconds * CONTRACT.fps);
  });

  it("carries an AAC-LC mono track and an embedded mov_text caption stream", () => {
    const audio = stream("audio");
    expect(audio.codec_name).toBe("aac");
    expect(audio.profile).toBe("LC");
    expect(audio.channels).toBe(1);
    expect(audio.sample_rate).toBe("48000");
    const subtitle = stream("subtitle");
    expect(subtitle.codec_name).toBe("mov_text");
    expect(Number(subtitle.nb_frames)).toBeGreaterThanOrEqual(cues.length);
    expect(probed().streams.length).toBe(3);
  });

  it("stays inside the byte budget, and so inside the rate the budget allows", () => {
    const bytes = statSync(MP4).size;
    expect(bytes).toBe(Number(probed().format.size));
    expect(bytes, `${bytes} bytes against a budget of ${CONTRACT.bytes}`).toBeLessThanOrEqual(CONTRACT.bytes);
    expect(Number(probed().format.bit_rate)).toBeLessThanOrEqual((CONTRACT.bytes * 8) / CONTRACT.plannedSeconds);
    expect(probed().format.format_name).toContain("mp4");
  });

  const narrated = existsSync(AUDIO_DIR) && readdirSync(AUDIO_DIR).some((f) => /^b\d\.(wav|m4a|mp3)$/.test(f));
  it.skipIf(!has("ffmpeg") || narrated)("delivers silence while no narration is recorded (D-09)", () => {
    const measured = spawnSync("ffmpeg", ["-hide_banner", "-i", MP4, "-af", "volumedetect", "-f", "null", "-"], {
      encoding: "utf8",
    });
    const peak = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(measured.stderr ?? "")?.[1] ?? "0");
    expect(peak, "the delivered audio track is not silence").toBeLessThanOrEqual(-90);
  });
});
