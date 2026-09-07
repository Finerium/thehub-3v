#!/usr/bin/env bash
# The encode half of the video pipeline (AC-DEL-03; blueprint 2.2 and 9.12; the PRD's 26.2 and 26.3).
#
#   bash video/encode.sh --probe     the test encode: the roughest 20 s alone, at the final settings
#   bash video/encode.sh             the full run, into deliverables/TheHub_demo.mp4
#
# It needs no argument of its own. video/out/beats.json, written by record.ts, says which beat is in which raw
# file, how much footage sits ahead of the first framed moment, and how many seconds the beat is allowed. Nothing
# here is typed twice: the slots come from beats.ts through that file, the caption text from captions.srt.
#
# Three stages.
#
#   1. The master. Each beat is decoded, its lead trimmed off the head, then held on its last frame or cut so it
#      lasts exactly its slot; the six are concatenated; the burned-in caption layer of video/frames/ is
#      composited over the result with one overlay. The master is CRF 14, which is far above anything a 190 kbps
#      delivery can carry, so the two passes below measure the picture and not this step. A beat with no footage
#      becomes a paper-coloured slate of the same length, so a missing beat shortens nothing and the captions
#      stay on their clock.
#
#   2. The test encode. The roughest twenty seconds are found by measurement rather than by opinion: the master
#      is CRF-encoded, so a frame's compressed size is its complexity, and the window whose frames weigh most is
#      the one the rate control will struggle with. That window alone is run through both passes at the final
#      settings, and its achieved rate is extrapolated over 175 s against the 5,000,000-byte budget. The PRD asks
#      for exactly this before the full run. It is written to video/out/test-encode-20s.txt.
#
#   3. The delivery. Two x264 passes at the rate the PRD's 26.3 fixes, silent AAC-LC mono (deviation D-09: no
#      narration was recorded, and the captions are burned into the picture so the cut reads with the sound off),
#      and captions.srt muxed as a mov_text stream beside the burned-in layer. Then ffprobe and wc -c, both
#      written to video/out/probe.txt.
#
# ponytail: one master, then two passes over it, rather than the six-input filter graph run twice. The graph is
# built once, the expensive preset sees a plain file, and --probe is a cut of the same master rather than a
# second pipeline that could drift from the first.
set -euo pipefail
cd "$(dirname "$0")/.."

HERE="video"
RAW="$HERE/raw"
FRAMES="$HERE/frames"
OUT="$HERE/out"
BEATS="$OUT/beats.json"
SRT="$HERE/captions.srt"
MASTER="$OUT/master.mp4"
TARGET="deliverables/TheHub_demo.mp4"
# Two reports, because the test encode is evidence in its own right and the delivery must not erase it.
TEST_REPORT="$OUT/test-encode-20s.txt"
PROBE_REPORT="$OUT/probe.txt"

# The delivery settings, in one place, so the two passes cannot differ and --probe measures what ships.
WIDTH=1280
HEIGHT=720
FPS=15
VIDEO_RATE=190k
MAXRATE=260k
BUFSIZE=520k
AUDIO_RATE=32k
PRESET=veryslow
BUDGET_BYTES=5000000
LIMIT_SECONDS=180
PAPER=0xF4F1EA # blueprint 7.1, the Drafting-ink paper; a slate for a beat with no footage reads as the product

MODE=full
[ "${1:-}" = "--probe" ] && MODE=probe

for tool in ffmpeg ffprobe python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "encode: $tool is not on PATH" >&2; exit 1; }
done
[ -f "$BEATS" ] || { echo "encode: $BEATS is not there; run video/record.ts first" >&2; exit 1; }
[ -f "$SRT" ] || { echo "encode: $SRT is not there; run video/record.ts first" >&2; exit 1; }
[ -f "$FRAMES/captions.ffconcat" ] || { echo "encode: $FRAMES/captions.ffconcat is not there; run video/record.ts first" >&2; exit 1; }

mkdir -p "$OUT" deliverables

# ---------------------------------------------------------------------------------------------------------------
# 1. The master
# ---------------------------------------------------------------------------------------------------------------

# The filter graph and the input list are built from beats.json, because the number of beats with footage is not
# known here and a missing one is a slate rather than an error.
build_master() {
  echo "master: building from $BEATS"
  # One ffmpeg argument per line: no argument here can contain a newline, and reading them back into an array
  # keeps a path with a space intact, which word-splitting an unquoted expansion would not.
  python3 - "$BEATS" "$RAW" "$FRAMES" "$MASTER" "$WIDTH" "$HEIGHT" "$FPS" "$PAPER" <<'PY' > "$OUT/master.args"
import json, os, sys

beats_file, raw, frames, master, width, height, fps, paper = sys.argv[1:9]
width, height, fps = int(width), int(height), int(fps)
report = json.load(open(beats_file))

args, graph, labels = [], [], []
for i, beat in enumerate(report["beats"]):
    seconds = float(beat["seconds"])
    lead = float(beat.get("lead") or 0.0)
    file = beat.get("file")
    # beats.json holds the path record.ts wrote; fall back to the conventional name in raw/.
    if file and not os.path.exists(file):
        file = os.path.join(raw, f"{beat['id']}.webm")
    if file and os.path.exists(file):
        args += ["-i", file]
        # fps and geometry first, then the lead off the head, then hold the last frame and cut to the slot.
        # tpad always appends, so after it the stretch is at least `seconds` long and the final trim is exact.
        graph.append(
            f"[{i}:v]fps={fps},scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={paper},setsar=1,"
            f"trim=start={lead:.3f},setpts=PTS-STARTPTS,"
            f"tpad=stop_mode=clone:stop_duration={seconds:.3f},"
            f"trim=end={seconds:.3f},setpts=PTS-STARTPTS[v{i}]"
        )
    else:
        args += ["-f", "lavfi", "-i", f"color=c={paper}:s={width}x{height}:r={fps}:d={seconds:.3f}"]
        graph.append(f"[{i}:v]setsar=1,trim=end={seconds:.3f},setpts=PTS-STARTPTS[v{i}]")
    labels.append(f"[v{i}]")

n = len(report["beats"])
graph.append("".join(labels) + f"concat=n={n}:v=1:a=0[body]")
# The caption layer: transparent PNGs on the concat demuxer, one overlay, alpha kept until the final format.
args += ["-f", "concat", "-safe", "0", "-i", os.path.join(frames, "captions.ffconcat")]
graph.append(f"[{n}:v]fps={fps},format=rgba[cap]")
graph.append("[body][cap]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[out]")

for a in args + ["-filter_complex", ";".join(graph), "-map", "[out]"]:
    print(a)
PY
  local args=()
  while IFS= read -r line; do args+=("$line"); done < "$OUT/master.args"
  ffmpeg -y -hide_banner -loglevel error -stats \
    "${args[@]}" \
    -c:v libx264 -preset veryfast -crf 14 -pix_fmt yuv420p -r "$FPS" "$MASTER"
  echo "master: $MASTER, $(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$MASTER") s, $(wc -c < "$MASTER" | tr -d ' ') bytes"
}

# ---------------------------------------------------------------------------------------------------------------
# 2. The delivery encode, over a whole file or one window of it
# ---------------------------------------------------------------------------------------------------------------

# deliver <in> <out> <logfile> [start] [duration]   two x264 passes, silent AAC-LC mono, mov_text beside them.
#
# A window (start and duration given) is the test encode, and it carries no caption stream: captions.srt spans the
# whole 175 s, so muxing it into a 20 s cut would both stretch the output and put the wrong bytes on the scale.
# The measurement that matters is the picture and the silence, which is where every byte of the budget goes.
deliver() {
  local input="$1" output="$2" log="$3" start="${4:-}" duration="${5:-}"
  # bash 3.2 errors on "${arr[@]}" for an empty array under `set -u`, so every expansion below uses the
  # ${arr[@]+"${arr[@]}"} form, which is nothing when the array is empty and the quoted elements when it is not.
  local cut=() sub_in=() sub_map=() sub_codec=()
  [ -n "$start" ] && cut+=(-ss "$start")
  [ -n "$duration" ] && cut+=(-t "$duration")
  if [ -z "$duration" ]; then
    sub_in=(-i "$SRT")
    sub_map=(-map 2:s:0)
    sub_codec=(-c:s mov_text -metadata:s:s:0 language=eng)
  fi

  # The silence is given an explicit length rather than being cut by -shortest.
  #
  # -shortest ends the output when the shortest stream ends, and the `fps` filter leaves the picture a frame or two
  # under the master's 175.000 s. That is enough to drop the LAST caption packet: the closing card, which is the one
  # cue carrying the deployment URL. Sizing the silence to the source instead lets every cue be written, and the
  # output lands on the planned 175 s rather than three milliseconds under it.
  local audio_len="$duration"
  [ -n "$audio_len" ] || audio_len="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$input")"

  # Pass 1 sees the picture alone: no audio, no captions, output discarded.
  ffmpeg -y -hide_banner -loglevel error -stats ${cut[@]+"${cut[@]}"} -i "$input" \
    -vf "scale=${WIDTH}:-2,fps=${FPS}" \
    -c:v libx264 -preset "$PRESET" -tune stillimage \
    -b:v "$VIDEO_RATE" -maxrate "$MAXRATE" -bufsize "$BUFSIZE" \
    -pass 1 -passlogfile "$log" -an -f mp4 /dev/null

  # Pass 2 carries the silence and the caption stream, each given its own length above.
  ffmpeg -y -hide_banner -loglevel error -stats ${cut[@]+"${cut[@]}"} -i "$input" \
    -f lavfi -t "$audio_len" -i anullsrc=channel_layout=mono:sample_rate=48000 \
    ${sub_in[@]+"${sub_in[@]}"} \
    -map 0:v:0 -map 1:a:0 ${sub_map[@]+"${sub_map[@]}"} \
    -vf "scale=${WIDTH}:-2,fps=${FPS}" \
    -c:v libx264 -preset "$PRESET" -tune stillimage \
    -b:v "$VIDEO_RATE" -maxrate "$MAXRATE" -bufsize "$BUFSIZE" \
    -pass 2 -passlogfile "$log" \
    -c:a aac -profile:a aac_low -ac 1 -b:a "$AUDIO_RATE" \
    ${sub_codec[@]+"${sub_codec[@]}"} \
    -movflags +faststart "$output"
  rm -f "$log-0.log" "$log-0.log.mbtree" "$log-0.log.temp" "$log-0.log.mbtree.temp"
}

# ---------------------------------------------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------------------------------------------

# The master is reused only while it is newer than the record of the take. A re-shoot rewrites beats.json, and
# silently encoding yesterday's master over today's footage is the one way this pipeline could ship the wrong cut.
if [ ! -f "$MASTER" ] || [ "$BEATS" -nt "$MASTER" ]; then
  build_master
else
  echo "master: $MASTER is newer than $BEATS, reusing it"
fi

if [ "$MODE" = "probe" ]; then
  # The roughest window, measured: a CRF master spends bits on complexity, so the heaviest 20 s of frames is the
  # stretch the rate control has to survive.
  rough="$(ffprobe -v error -select_streams v:0 -show_entries frame=pts_time,pkt_size -of csv=p=0 "$MASTER" | python3 -c '
import sys
rows = []
for line in sys.stdin:
    parts = line.strip().split(",")
    if len(parts) < 2 or not parts[0] or not parts[1]:
        continue
    try:
        rows.append((float(parts[0]), int(parts[1])))
    except ValueError:
        continue
rows.sort()
best_at, best = 0.0, -1
for i, (t, _) in enumerate(rows):
    total = 0
    for u, size in rows[i:]:
        if u - t >= 20.0:
            break
        total += size
    else:
        # the window runs off the end of the file; it is not a full 20 s and cannot be compared
        continue
    if total > best:
        best_at, best = t, total
print(f"{best_at:.3f} {best}")
')"
  ROUGH_START="${rough%% *}"
  ROUGH_BYTES="${rough##* }"
  echo "probe: the roughest 20 s of the master start at ${ROUGH_START} s (${ROUGH_BYTES} bytes of CRF-14 frames)"
  deliver "$MASTER" "$OUT/probe-20s.mp4" "$OUT/probe" "$ROUGH_START" 20
  probe_bytes="$(wc -c < "$OUT/probe-20s.mp4" | tr -d ' ')"
  probe_secs="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$OUT/probe-20s.mp4")"
  python3 - "$probe_bytes" "$probe_secs" "$BUDGET_BYTES" <<'PY' | tee "$TEST_REPORT"
import sys
size, secs, budget = int(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3])
rate = size * 8 / secs
full = size / secs * 175.0
print(f"test encode, the roughest 20 s at the delivery settings")
print(f"  bytes            {size}")
print(f"  seconds          {secs:.3f}")
print(f"  achieved rate    {rate/1000:.1f} kbps over the window")
print(f"  extrapolated     {full:.0f} bytes over 175 s, against a budget of {budget}")
print(f"  verdict          {'INSIDE the budget' if full <= budget else 'OVER the budget; lower -b:v before the full run'}")
PY
  exit 0
fi

deliver "$MASTER" "$TARGET" "$OUT/pass"

# ---------------------------------------------------------------------------------------------------------------
# 3. The measurements, all of them, into one file
# ---------------------------------------------------------------------------------------------------------------
{
  echo "TheHub_demo.mp4, as delivered"
  echo "  built        $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "  commit       $(git rev-parse --short HEAD 2>/dev/null || echo 'not a git checkout')"
  echo "  bytes        $(wc -c < "$TARGET" | tr -d ' ') of $BUDGET_BYTES"
  echo "  duration     $(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$TARGET") s of $LIMIT_SECONDS (planned 175)"
  echo "  container    $(ffprobe -v error -show_entries format=format_name -of default=nk=1:nw=1 "$TARGET")"
  echo "  overall rate $(ffprobe -v error -show_entries format=bit_rate -of default=nk=1:nw=1 "$TARGET") bps"
  echo "  video        $(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,width,height,r_frame_rate,pix_fmt,bit_rate,nb_frames -of default=nw=1 "$TARGET" | tr '\n' ' ')"
  echo "  audio        $(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,profile,channels,sample_rate,bit_rate -of default=nw=1 "$TARGET" | tr '\n' ' ')"
  echo "  captions     $(ffprobe -v error -select_streams s:0 -show_entries stream=codec_name,codec_type -of default=nw=1 "$TARGET" | tr '\n' ' ')"
  echo "  srt cues     $(grep -c ' --> ' "$SRT") in $SRT"
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
