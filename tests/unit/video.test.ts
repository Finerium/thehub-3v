// The video pipeline as tests (blueprint 2.2, 9.12 and 11.9 AC-DEL-03, AC-DEL-06; the PRD's 26.2 and 26.3).
//
// video/beats.ts is the one place the cut's timing and wording live: record.ts paces the capture from it and writes
// video/captions.srt out of it, and encode.sh reads the slot lengths back out of video/out/beats.json. Three layers
// of check follow that shape.
//
//   1. The cut, hermetic and always run. Six beats in their planned slots summing to 175 s, every cue inside its
//      beat, the captions on disk equal to the ones beats.ts generates, the narration of the PRD's 26.2 reproduced
//      character for character by `checkVerbatim`, and every quantity a caption states read from the fixture rather
//      than typed. The two rounded quantities the script's own prose carries are marked `nonfx` in beats.ts and
//      nowhere else, so a third one appearing is a red test.
//   2. The delivery settings, from video/encode.sh. ffprobe cannot report two-pass, `-tune stillimage` or the rate
//      ceiling, so the flags of 9.12 are held against the script that applies them.
//   3. The artefact, when deliverables/TheHub_demo.mp4 exists: duration, resolution, frame rate, the codecs, the
//      embedded mov_text caption stream, the silent audio track of D-09 and the byte budget, all by ffprobe.
//
// Nothing here encodes anything. The test encode of the roughest twenty seconds, which AC-DEL-03 asks for before
// the full run, is checked as the report it leaves in video/out/.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { beats, checkVerbatim, DEPLOYMENT_URL, fixtures, REPLAY_LINE, srt, timeline, totalSeconds } from "../../video/beats";

const REPO = process.cwd();
const VIDEO_DIR = path.join(REPO, "video");
const CAPTIONS = path.join(VIDEO_DIR, "captions.srt");
const NARRATION = path.join(VIDEO_DIR, "narration.md");
const BEATS_TS = path.join(VIDEO_DIR, "beats.ts");
const ENCODE = path.join(VIDEO_DIR, "encode.sh");
const FRAMES = path.join(VIDEO_DIR, "frames");
const RECORDED = path.join(VIDEO_DIR, "out", "beats.json");
const TEST_ENCODE = path.join(VIDEO_DIR, "out", "test-encode-20s.txt");
const MP4 = path.join(REPO, "deliverables", "TheHub_demo.mp4");

/** Blueprint 9.12, the video contract. */
const CONTRACT = {
  bytes: 5_000_000,
  limitSeconds: 180,
  plannedSeconds: 175,
  width: 1280,
  height: 720,
  fps: 15,
  slots: [20, 30, 35, 25, 20, 45],
};

const has = (tool: string) => spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).status === 0;
const ffprobeReady = has("ffprobe") && existsSync(MP4);

const fx = fixtures();
const cut = beats(fx);
const cues = timeline(cut);
const captions = readFileSync(CAPTIONS, "utf8");
const narration = readFileSync(NARRATION, "utf8");

/* ================================================================================================================
 * 1. The cut
 * ============================================================================================================== */

describe("video/beats.ts is the cut (blueprint 2.2, PRD 26.2)", () => {
  it("holds six beats in their planned slots, summing to the planned duration", () => {
    expect(cut.map((b) => b.id)).toEqual(["b1", "b2", "b3", "b4", "b5", "b6"]);
    expect(cut.map((b) => b.seconds)).toEqual(CONTRACT.slots);
    expect(totalSeconds(cut)).toBe(CONTRACT.plannedSeconds);
    expect(totalSeconds(cut)).toBeLessThanOrEqual(CONTRACT.limitSeconds);
  });

  it("places every cue inside its own beat and on one rising clock", () => {
    for (const beat of cut) {
      for (const cue of beat.cues) {
        expect(cue.at, `${beat.id}: a cue starts at ${cue.at}`).toBeGreaterThanOrEqual(0);
        expect(cue.until, `${beat.id}: a cue runs past its ${beat.seconds} s slot`).toBeLessThanOrEqual(beat.seconds);
        expect(cue.until).toBeGreaterThan(cue.at);
      }
    }
    const starts = cues.map((c) => c.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(cues[cues.length - 1].end).toBe(CONTRACT.plannedSeconds);
  });

  it("opens with the replay disclosure and closes on the deployment address", () => {
    expect(cues[0].text).toBe(REPLAY_LINE);
    expect(cues[0].tone).toBe("caveat");
    expect(cues[0].start).toBe(0);
    expect(captions).toContain(REPLAY_LINE);
    expect(cues[cues.length - 1].sub).toBe(DEPLOYMENT_URL);
    expect(captions.trimEnd().endsWith(DEPLOYMENT_URL)).toBe(true);
  });

  it("reproduces the narration of the PRD's 26.2 character for character", () => {
    expect(checkVerbatim(cut, narration)).toEqual([]);
  });

  it("keeps video/captions.srt exactly as beats.ts generates it", () => {
    expect(captions).toBe(srt(cues));
    expect((captions.match(/ --> /g) ?? []).length).toBe(cues.length);
  });
});

describe("every quantity a caption states comes from the fixture (invariant 6)", () => {
  const spoken = cues.map((c) => c.text).join(" ");

  it("reads the coverage headline, the population and the asset count from packages/fixtures.json", () => {
    const at = (layer: "generous" | "strict") => {
      const row = fx.coverage[layer].unplanned_failure.find((r) => r.t === fx.method.threshold);
      if (row === undefined) throw new Error(`fixtures.json carries no ${layer} row at t = ${fx.method.threshold}`);
      return row;
    };
    expect(spoken).toContain(`${fx.populations.unplanned_failure} work orders`);
    expect(spoken).toContain(`${at("generous").uncovered} are mentioned by no lesson at all`);
    expect(spoken).toContain(`${at("strict").uncovered} have nothing beyond a pasted work-order row`);
    // Eight assets: the count is the fixture's, the cardinal word is the cut's own table.
    expect(fx.equipment_master.length).toBe(8);
    expect(spoken).toContain("Eight assets");
  });

  it("reads the typed setpoint, its voting, the logic and the SIL text from the cause-and-effect sheet", () => {
    const sheet = fx.interlock_rows["GA-1201A"];
    const row = sheet.rows.find((r) => r.tag === "VSHH-1201");
    if (row === undefined) throw new Error("fixtures.json types no VSHH-1201 row on the GA-1201A sheet");
    expect(spoken).toContain(`${row.tag} above ${row.setpoint_value} ${row.setpoint_unit} RMS with ${row.voting} voting`);
    expect(spoken).toContain(`on the ${sheet.header.logic_no} logic the sheet types as ${sheet.header.sil_text}`);
  });

  it("names the demo work order the fixture designates", () => {
    expect(spoken).toContain(fx.demo.primary_wo);
    expect(captions).toContain(fx.demo.primary_wo);
  });

  it("marks the two rounded quantities no fixture key holds, and only those two", () => {
    const source = readFileSync(BEATS_TS, "utf8");
    const marks = source.split("\n").filter((line) => line.trim().startsWith("// nonfx:"));
    expect(marks.length).toBe(2);
    expect(spoken).toContain("eighteen months of maintenance history");
    expect(spoken).toContain("Two lessons cover alignment");
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
      expect(text, name).not.toMatch(/[\u2014\u2013]/);
    }
  });
});

/* ================================================================================================================
 * 2. The delivery settings
 * ============================================================================================================== */

describe("video/encode.sh applies the settings of 9.12 and the PRD's 26.3", () => {
  const encode = readFileSync(ENCODE, "utf8");

  it("pins the geometry, the frame rate, the rate control and the budget", () => {
    for (const setting of [
      `WIDTH=${CONTRACT.width}`,
      `HEIGHT=${CONTRACT.height}`,
      `FPS=${CONTRACT.fps}`,
      "VIDEO_RATE=190k",
      "MAXRATE=260k",
      "BUFSIZE=520k",
      "AUDIO_RATE=32k",
      `BUDGET_BYTES=${CONTRACT.bytes}`,
      `LIMIT_SECONDS=${CONTRACT.limitSeconds}`,
    ]) {
      expect(encode, setting).toContain(setting);
    }
  });

  it("encodes in two x264 passes tuned for still images, with silent AAC-LC mono and a mov_text stream", () => {
    expect(encode).toContain("-pass 1");
    expect(encode).toContain("-pass 2");
    expect(encode).toContain("-c:v libx264");
    expect(encode).toContain("-tune stillimage");
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
  });
});

describe.skipIf(!existsSync(RECORDED))("video/out/beats.json records the take the encode reads", () => {
  type Recorded = {
    width: number;
    height: number;
    fps: number;
    total_seconds: number;
    beats: Array<{ id: string; seconds: number; lead: number | null; file?: string }>;
  };

  it("agrees with beats.ts on every slot and with 9.12 on the geometry", () => {
    const recorded = JSON.parse(readFileSync(RECORDED, "utf8")) as Recorded;
    expect(recorded.width).toBe(CONTRACT.width);
    expect(recorded.height).toBe(CONTRACT.height);
    expect(recorded.fps).toBe(CONTRACT.fps);
    expect(recorded.total_seconds).toBe(CONTRACT.plannedSeconds);
    expect(recorded.beats.map((b) => b.id)).toEqual(cut.map((b) => b.id));
    expect(recorded.beats.map((b) => b.seconds)).toEqual(cut.map((b) => b.seconds));
  });
});

describe.skipIf(!existsSync(FRAMES))("the burned-in caption layer covers every cue (D-09)", () => {
  it("renders one frame per cue and lists each in the concat file", () => {
    const frames = readdirSync(FRAMES).filter((f) => /^cue-\d+\.png$/.test(f));
    expect(frames.length).toBe(cues.length);
    const concat = readFileSync(path.join(FRAMES, "captions.ffconcat"), "utf8");
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

  it("is 1280 by 720 at 15 frames per second, x264 in a progressive 4:2:0 picture", () => {
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

  it("holds the delivered rate under the ceiling of the rate control", () => {
    expect(Number(probed().format.bit_rate)).toBeLessThanOrEqual(260_000);
    expect(probed().format.format_name).toContain("mp4");
  });

  it("stays inside the byte budget of 9.12", () => {
    const bytes = statSync(MP4).size;
    expect(bytes).toBe(Number(probed().format.size));
    expect(bytes, `${bytes} bytes against a budget of ${CONTRACT.bytes}`).toBeLessThanOrEqual(CONTRACT.bytes);
  });

  it.skipIf(!has("ffmpeg"))("delivers silence, because no narration was recorded (D-09)", () => {
    const measured = spawnSync("ffmpeg", ["-hide_banner", "-i", MP4, "-af", "volumedetect", "-f", "null", "-"], {
      encoding: "utf8",
    });
    const peak = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(measured.stderr ?? "")?.[1] ?? "0");
    expect(peak, "the delivered audio track is not silence").toBeLessThanOrEqual(-90);
  });
});
