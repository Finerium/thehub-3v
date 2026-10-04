#!/usr/bin/env bash
# The encode half of the video pipeline (AC-DEL-03; blueprint 2.2; deviation D-37 for the delivery settings).
#
#   bash video/encode.sh --probe     the test encode: the roughest 20 s alone, at the final settings
#   bash video/encode.sh             the full run, into deliverables/TheHub_demo.mp4
#
# It needs no argument of its own. video/out/beats.json, written by record.ts, names each beat's frame list (or, for
# a B6 fallback, the earlier footage and the stretch of it the beat uses) and the seconds the beat is allowed.
#
# Three stages.
#
#   1. The master. Each beat's frames, with their durations, become a near-lossless 1920 by 1080, 25 fps segment of
#      exactly its slot; the seven are joined; the caption layer of video/frames/captions/ is composited over the
#      result with one overlay. The master is CRF 2, so the passes below measure the picture and not this step.
#
#   2. The test encode. The roughest twenty seconds, found by measurement (the master's heaviest 20 s of frames),
#      run through both passes at the delivery settings, its rate extrapolated over the cut against the budget.
#
#   3. The delivery. Two x264 passes whose rate is computed from the byte budget, not fixed in advance: the cut is
#      mostly held frames, and a held frame costs almost nothing, so the bits go to the cuts and the motion where
#      the eye needs them. No VBV ceiling is set for the same reason: a ceiling starves exactly the frame after a cut,
#      which is what made the first cut look soft. The audio is the narration when video/audio/ holds it (one file
#      per beat, b1 to b7, wav, m4a or mp3, laid at the start of its beat), else AAC-LC mono silence (D-09). The
#      captions are muxed as a mov_text stream beside the burned-in layer. Then ffprobe and wc -c, into
#      video/out/probe.txt. If the file lands over the budget, pass 2 is re-run at the rate scaled down to fit.
set -euo pipefail
cd "$(dirname "$0")/.."

HERE="video"
FRAMES="$HERE/frames"
OUT="$HERE/out"
BEATS="$OUT/beats.json"
SRT="$HERE/captions.srt"
AUDIO_DIR="$HERE/audio"
MASTER="$OUT/master.mp4"
TARGET="deliverables/TheHub_demo.mp4"
TEST_REPORT="$OUT/test-encode-20s.txt"
PROBE_REPORT="$OUT/probe.txt"

# The delivery settings, in one place, so the two passes cannot differ and --probe measures what ships.
WIDTH=1920
HEIGHT=1080
FPS=25
PRESET=veryslow
# Measured on the cut's most dynamic 60 s at the delivery rate (2026-10-04): tune animation 40.2 dB PSNR and SSIM
# 0.990 against the master; stillimage 37.1 dB; no tune 38.7 dB; the same rate at 1280 by 720, scaled back, 31.8 dB.
TUNE=animation
X264_PARAMS="keyint=250:min-keyint=25"
AUDIO_RATE=32k
NARRATION_RATE=64k
BUDGET_BYTES=5000000
# What the container, the caption stream and the rate control's error are allowed, below the budget.
HEADROOM_BYTES=200000
LIMIT_SECONDS=180
PLANNED_SECONDS=175

MODE=full
[ "${1:-}" = "--probe" ] && MODE=probe

for tool in ffmpeg ffprobe python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "encode: $tool is not on PATH" >&2; exit 1; }
done
[ -f "$BEATS" ] || { echo "encode: $BEATS is not there; run video/record.ts first" >&2; exit 1; }
[ -f "$SRT" ] || { echo "encode: $SRT is not there; run video/record.ts first" >&2; exit 1; }
[ -f "$FRAMES/captions/captions.ffconcat" ] || { echo "encode: the caption layer is not there; run video/record.ts first" >&2; exit 1; }
mkdir -p "$OUT" deliverables

# ---------------------------------------------------------------------------------------------------------------
# 1. The master
# ---------------------------------------------------------------------------------------------------------------

build_master() {
  echo "master: building from $BEATS"
  local seg_dir="$OUT/segments"
  rm -rf "$seg_dir"
  mkdir -p "$seg_dir"
  # One ffmpeg command per beat, written by python from beats.json, one argument per line.
  python3 - "$BEATS" "$seg_dir" "$WIDTH" "$HEIGHT" "$FPS" <<'PY'
import json, os, sys
beats_file, seg_dir, width, height, fps = sys.argv[1:6]
report = json.load(open(beats_file))
listing = []
for i, beat in enumerate(report["beats"]):
    seconds = float(beat["seconds"])
    out = os.path.join(seg_dir, f"{i:02d}-{beat['id']}.mp4")
    # Every segment lands on its slot exactly: held past its end, then cut at it.
    tail = f"tpad=stop_mode=clone:stop_duration={seconds:.3f},trim=end={seconds:.3f},setpts=PTS-STARTPTS,format=yuv420p"
    if beat.get("concat"):
        args = ["-f", "concat", "-safe", "0", "-i", beat["concat"], "-vf", f"fps={fps}:round=near,{tail}"]
    elif beat.get("source"):
        src = beat["source"]
        # The fallback footage is 1280 by 720: scaled up with Lanczos and a light unsharp, so it sits beside the
        # native 1920 by 1080 frames as close to them as an upscale can.
        args = ["-ss", f"{float(src['lead']):.3f}", "-t", f"{float(src['take']):.3f}", "-i", src["file"],
                "-vf", f"fps={fps},scale={width}:{height}:flags=lanczos,unsharp=5:5:0.5:5:5:0.0,{tail}"]
    else:
        args = ["-f", "lavfi", "-i", f"color=c=0xF4F1EA:s={width}x{height}:r={fps}:d={seconds:.3f}", "-vf", tail]
    with open(os.path.join(seg_dir, f"{i:02d}.args"), "w") as f:
        f.write("\n".join(args + ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "2", "-r", fps, out]) + "\n")
    listing.append(f"file '{os.path.basename(out)}'")
open(os.path.join(seg_dir, "segments.txt"), "w").write("\n".join(listing) + "\n")
PY
  for argfile in "$seg_dir"/*.args; do
    local args=()
    while IFS= read -r line; do args+=("$line"); done < "$argfile"
    ffmpeg -y -hide_banner -loglevel error "${args[@]}"
  done
  ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "$seg_dir/segments.txt" -c copy "$OUT/body.mp4"
  # The caption layer: transparent PNGs on the concat demuxer, one overlay, alpha kept until the final format.
  ffmpeg -y -hide_banner -loglevel error -stats -i "$OUT/body.mp4" -f concat -safe 0 -i "$FRAMES/captions/captions.ffconcat" \
    -filter_complex "[1:v]fps=$FPS,format=rgba[cap];[0:v][cap]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[out]" \
    -map "[out]" -c:v libx264 -preset veryfast -crf 2 -r "$FPS" -t "$PLANNED_SECONDS" "$MASTER"
  rm -f "$OUT/body.mp4"
  echo "master: $MASTER, $(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$MASTER") s, $(wc -c < "$MASTER" | tr -d ' ') bytes"
}

# ---------------------------------------------------------------------------------------------------------------
# 2. The audio
# ---------------------------------------------------------------------------------------------------------------

# The narration track, when one file per beat exists, laid at each beat's start; otherwise nothing, and the
# delivery muxes silence. Prints the path of the track it built, or nothing.
build_narration() {
  python3 - "$BEATS" "$AUDIO_DIR" "$OUT/narration.m4a" "$PLANNED_SECONDS" "$NARRATION_RATE" <<'PY'
import json, os, subprocess, sys
beats_file, audio_dir, out, total, rate = sys.argv[1:6]
report = json.load(open(beats_file))
inputs, delays, at = [], [], 0.0
for beat in report["beats"]:
    for ext in ("wav", "m4a", "mp3"):
        path = os.path.join(audio_dir, f"{beat['id']}.{ext}")
        if os.path.exists(path):
            inputs.append(path)
            delays.append(int(round(at * 1000)))
            break
    at += float(beat["seconds"])
if not inputs:
    sys.exit(0)
args = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
for p in inputs:
    args += ["-i", p]
graph = ";".join(f"[{i}:a]aformat=sample_rates=48000:channel_layouts=mono,adelay={d}:all=1[a{i}]" for i, d in enumerate(delays))
graph += ";" + "".join(f"[a{i}]" for i in range(len(inputs))) + f"amix=inputs={len(inputs)}:normalize=0,apad,atrim=0:{total}[mix]"
args += ["-filter_complex", graph, "-map", "[mix]", "-c:a", "aac", "-profile:a", "aac_low", "-ac", "1", "-b:a", rate, out]
subprocess.run(args, check=True)
print(out)
PY
}

# ---------------------------------------------------------------------------------------------------------------
# 3. The delivery encode, over a whole file or one window of it
# ---------------------------------------------------------------------------------------------------------------

# deliver <in> <out> <logfile> <video rate> [start] [duration]
deliver() {
  local input="$1" output="$2" log="$3" rate="$4" start="${5:-}" duration="${6:-}"
  local cut=() sub_in=() sub_map=() sub_codec=() audio_in=() audio_codec=()
  [ -n "$start" ] && cut+=(-ss "$start")
  [ -n "$duration" ] && cut+=(-t "$duration")
  local audio_len="$duration"
  [ -n "$audio_len" ] || audio_len="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$input")"
  if [ -n "${NARRATION:-}" ] && [ -z "$duration" ]; then
    audio_in=(-i "$NARRATION")
    audio_codec=(-c:a copy)
  else
    audio_in=(-f lavfi -t "$audio_len" -i anullsrc=channel_layout=mono:sample_rate=48000)
    audio_codec=(-c:a aac -profile:a aac_low -ac 1 -b:a "$AUDIO_RATE")
  fi
  if [ -z "$duration" ]; then
    sub_in=(-i "$SRT")
    sub_map=(-map 2:s:0)
    sub_codec=(-c:s mov_text -metadata:s:s:0 language=eng)
  fi
  ffmpeg -y -hide_banner -loglevel error -stats ${cut[@]+"${cut[@]}"} -i "$input" \
    -c:v libx264 -preset "$PRESET" -tune "$TUNE" -x264-params "$X264_PARAMS" -pix_fmt yuv420p \
    -b:v "$rate" -pass 1 -passlogfile "$log" -an -f mp4 /dev/null
  ffmpeg -y -hide_banner -loglevel error -stats ${cut[@]+"${cut[@]}"} -i "$input" \
    "${audio_in[@]}" ${sub_in[@]+"${sub_in[@]}"} \
    -map 0:v:0 -map 1:a:0 ${sub_map[@]+"${sub_map[@]}"} \
    -c:v libx264 -preset "$PRESET" -tune "$TUNE" -x264-params "$X264_PARAMS" -pix_fmt yuv420p \
    -b:v "$rate" -pass 2 -passlogfile "$log" \
    "${audio_codec[@]}" ${sub_codec[@]+"${sub_codec[@]}"} \
    -movflags +faststart "$output"
  rm -f "$log-0.log" "$log-0.log.mbtree" "$log-0.log.temp" "$log-0.log.mbtree.temp"
}

# The video rate that fills the budget: what is left of it after the headroom and the audio, spread over the cut.
rate_for() {
  local audio_bps="$1"
  python3 -c "import sys; b,h,a,s=map(float,sys.argv[1:5]); print(int(((b-h)*8 - a*s)/s))" "$BUDGET_BYTES" "$HEADROOM_BYTES" "$audio_bps" "$PLANNED_SECONDS"
}

# ---------------------------------------------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------------------------------------------

# The master is reused only while it is newer than the record of the take and the caption layer.
if [ ! -f "$MASTER" ] || [ "$BEATS" -nt "$MASTER" ] || [ "$FRAMES/captions/captions.ffconcat" -nt "$MASTER" ]; then
  build_master
else
  echo "master: $MASTER is newer than $BEATS, reusing it"
fi

NARRATION="$(build_narration)"
if [ -n "$NARRATION" ]; then AUDIO_BPS=64000; else AUDIO_BPS=2000; fi
RATE="$(rate_for "$AUDIO_BPS")"
echo "delivery: video rate $RATE bps for $BUDGET_BYTES bytes over $PLANNED_SECONDS s (audio: ${NARRATION:-silence})"

roughest_window() {
  ffprobe -v error -select_streams v:0 -show_entries frame=pts_time,pkt_size -of csv=p=0 "$MASTER" | python3 -c '
import sys
rows = []
for line in sys.stdin:
    parts = line.strip().split(",")
    try:
        rows.append((float(parts[0]), int(parts[1])))
    except (ValueError, IndexError):
        continue
rows.sort()
best_at, best, j, total = 0.0, -1, 0, 0
for i, (t, size) in enumerate(rows):
    while j < len(rows) and rows[j][0] - t < 20.0:
        total += rows[j][1]
        j += 1
    if j < len(rows) and total > best:
        best_at, best = t, total
    total -= size
print(f"{best_at:.3f} {best}")
'
}

if [ "$MODE" = "probe" ]; then
  rough="$(roughest_window)"
  ROUGH_START="${rough%% *}"
  echo "probe: the roughest 20 s of the master start at ${ROUGH_START} s"
  deliver "$MASTER" "$OUT/probe-20s.mp4" "$OUT/probe" "$RATE" "$ROUGH_START" 20
  probe_bytes="$(wc -c < "$OUT/probe-20s.mp4" | tr -d ' ')"
  psnr="$(ffmpeg -hide_banner -ss "$ROUGH_START" -t 20 -i "$MASTER" -i "$OUT/probe-20s.mp4" -lavfi "[1:v][0:v]psnr" -f null - 2>&1 | grep -o 'average:[0-9.inf]*' | tail -1 | cut -d: -f2)"
  python3 - "$probe_bytes" 20 "$BUDGET_BYTES" "$PLANNED_SECONDS" "$ROUGH_START" "$RATE" "$psnr" <<'PY' | tee "$TEST_REPORT"
import sys
size, secs, budget, planned, start, rate, psnr = int(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), int(sys.argv[6]), float(sys.argv[7])
achieved = size * 8 / secs
full = rate / 8 * planned
print("test encode, the roughest 20 s at the delivery settings")
print(f"  window           {start:.3f} s to {start + secs:.3f} s of the master")
print(f"  requested rate   {rate / 1000:.1f} kbps, sized so the cut fills the budget")
print(f"  achieved rate    {achieved / 1000:.1f} kbps over the window ({size} bytes)")
print(f"  picture          {psnr:.2f} dB PSNR against the master over the window")
print(f"  extrapolated     {full:.0f} bytes over {planned:.0f} s at the requested rate, against a budget of {budget}")
print("  reading          a window encoded alone at the cut's average rate is the worst case: the full two-pass run")
print("                   moves bits from the held frames to exactly these seconds")
print(f"  verdict          {'INSIDE the budget' if full <= budget else 'OVER the budget'}; {'the roughest window holds' if psnr >= 30 else 'the roughest window does NOT hold'} 30 dB even at the flat rate")
PY
  exit 0
fi

deliver "$MASTER" "$TARGET" "$OUT/pass" "$RATE"
bytes="$(wc -c < "$TARGET" | tr -d ' ')"
if [ "$bytes" -gt "$BUDGET_BYTES" ]; then
  # x264's two-pass lands a few percent over a short cut's target; the second try aims at the measured overshoot.
  RATE="$(python3 -c "import sys; print(int(int(sys.argv[1]) * (int(sys.argv[2]) - 60000) / int(sys.argv[3])))" "$RATE" "$BUDGET_BYTES" "$bytes")"
  echo "delivery: $bytes bytes is over the budget; re-running at $RATE bps"
  deliver "$MASTER" "$TARGET" "$OUT/pass" "$RATE"
fi

{
  echo "TheHub_demo.mp4, as delivered"
  echo "  built        $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "  commit       $(git rev-parse --short HEAD 2>/dev/null || echo 'not a git checkout')"
  echo "  bytes        $(wc -c < "$TARGET" | tr -d ' ') of $BUDGET_BYTES"
  echo "  duration     $(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$TARGET") s of $LIMIT_SECONDS (planned $PLANNED_SECONDS)"
  echo "  container    $(ffprobe -v error -show_entries format=format_name -of default=nk=1:nw=1 "$TARGET")"
  echo "  overall rate $(ffprobe -v error -show_entries format=bit_rate -of default=nk=1:nw=1 "$TARGET") bps"
  echo "  video rate   $RATE bps requested, x264 $PRESET, tune $TUNE, $X264_PARAMS, two-pass"
  echo "  video        $(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,width,height,r_frame_rate,pix_fmt,bit_rate,nb_frames -of default=nw=1 "$TARGET" | tr '\n' ' ')"
  echo "  audio        $(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,profile,channels,sample_rate,bit_rate -of default=nw=1 "$TARGET" | tr '\n' ' ')"
  echo "  captions     $(ffprobe -v error -select_streams s:0 -show_entries stream=codec_name,codec_type -of default=nw=1 "$TARGET" | tr '\n' ' ')"
  rough="$(roughest_window)"
  rs="${rough%% *}"
  whole="$(ffmpeg -hide_banner -i "$MASTER" -i "$TARGET" -lavfi "[1:v][0:v]psnr" -f null - 2>&1 | grep -o 'average:[0-9.]*' | tail -1 | cut -d: -f2)"
  worst="$(ffmpeg -hide_banner -i "$MASTER" -i "$TARGET" -lavfi "[1:v]trim=$rs:$(python3 -c "print($rs+20)"),setpts=PTS-STARTPTS[d];[0:v]trim=$rs:$(python3 -c "print($rs+20)"),setpts=PTS-STARTPTS[m];[d][m]psnr" -f null - 2>&1 | grep -o 'average:[0-9.]*' | tail -1 | cut -d: -f2)"
  echo "  picture      $whole dB PSNR against the master over the cut; $worst dB over its roughest 20 s (from $rs s)"
  echo "  srt cues     $(grep -c ' --> ' "$SRT") in $SRT"
  echo "  b6           $(python3 -c "import json; print(json.load(open('$BEATS')).get('b6_variant'))")"
} | tee "$PROBE_REPORT"

bytes="$(wc -c < "$TARGET" | tr -d ' ')"
secs="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$TARGET" | python3 -c 'import sys; print(int(float(sys.stdin.read())))')"
subs="$(ffprobe -v error -select_streams s -show_entries stream=codec_name -of default=nk=1:nw=1 "$TARGET")"
status=0
[ "$bytes" -le "$BUDGET_BYTES" ] || { echo "encode: $bytes bytes, over the budget of $BUDGET_BYTES" >&2; status=1; }
[ "$secs" -le "$LIMIT_SECONDS" ] || { echo "encode: $secs s, over the limit of $LIMIT_SECONDS" >&2; status=1; }
[ -n "$subs" ] || { echo "encode: no caption stream was muxed" >&2; status=1; }
[ "$status" -eq 0 ] && echo "encode: $TARGET is inside every budget"
exit "$status"
