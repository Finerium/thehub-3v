#!/usr/bin/env bash
# AC-NFR-18 (blueprint section 11): no server-side in-memory state is load-bearing, and two concurrent instances
# behave as one application. Run: `pnpm verify:two-instances` (needs a `pnpm build` and the local env file, so it
# is a local and staging check, not one of the hermetic scripts/audits/ that CI globs).
#
# The check starts two `next start` processes on two ports against the same database and walks the address rate
# limit of src/lib/ratelimit.ts across both of them. The limit is a fixed 60 s window on the database clock, so
# `limit + 1` requests split evenly between the two instances must produce exactly one 429: the counter is one row
# in rate_limit_counter, upserted with `count = count + 1`, and neither process holds a count of its own. If the
# limiter were ever moved into module memory the walk would end with `limit + 1` accepted requests and no 429,
# because each process would have seen only about half of them, and this check would go red.
#
# The probe address is a fresh one out of 203.0.113.0/24 (TEST-NET-3, RFC 5737), so the counter it walks belongs
# to nobody and no real account or address is touched: the body is an empty JSON object, which the login route
# answers 400 after the rate-limit upsert and before any credential lookup.
#
# The two other pieces of state the criterion names are proved elsewhere: the publication lease by
# tests/db/loop.test.ts (ten concurrent publishes of one accepted draft serialise on the advisory lock into one
# revision and nine 409s), and the session by src/db/schema.ts, where it is a table.
#
# Measured on 2026-09-08: 121 requests, 61 to the first instance and 60 to the second, were answered 120 x 400
# and exactly one 429, and the 429 came from the instance that had itself served 61 of the 121.
set -euo pipefail
cd "$(dirname "$0")/.."

port_a="${PORT_A:-3311}"
port_b="${PORT_B:-3312}"
address="203.0.113.$((RANDOM % 200 + 20))"

# The limit is read from the source, so a change to LIMITS.addr moves this check with it rather than past it.
limit="$(grep -oE 'addr: *[0-9]+' src/lib/ratelimit.ts | grep -oE '[0-9]+' | head -1)"
[ -n "$limit" ] || { echo "could not read LIMITS.addr from src/lib/ratelimit.ts"; exit 1; }

[ -f .next/BUILD_ID ] || { echo "no build to start: run pnpm build first"; exit 1; }
[ -f .env.local ] || { echo "no .env.local: the two instances need a database"; exit 1; }
for port in "$port_a" "$port_b"; do
  [ -z "$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN || true)" ] || { echo "port $port is already in use"; exit 1; }
done

log_dir="$(mktemp -d)"
pids=()
cleanup() { for pid in ${pids[@]+"${pids[@]}"}; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT

for port in "$port_a" "$port_b"; do
  pnpm exec dotenv -e .env.local -- pnpm exec next start -p "$port" > "$log_dir/$port.log" 2>&1 &
  pids+=("$!")
done

for port in "$port_a" "$port_b"; do
  up=""
  for _ in $(seq 1 60); do
    if curl -fs -m 3 -o /dev/null "http://127.0.0.1:$port/api/health"; then up=yes; break; fi
    sleep 1
  done
  [ -n "$up" ] || { echo "instance on $port never answered /api/health"; tail -20 "$log_dir/$port.log"; exit 1; }
done
echo "two instances answer /api/health on $port_a and $port_b, against one database"

# The window is the database's own minute, so the walk has to finish inside one. It takes a few seconds; starting
# in the first half of a minute leaves the rest of it spare.
while [ "$(date +%S)" -ge 30 ]; do sleep 1; done

started="$(date +%s)"
codes="$log_dir/codes.txt"
: > "$codes"
i=0
while [ "$i" -lt $((limit + 1)) ]; do
  i=$((i + 1))
  if [ $((i % 2)) -eq 1 ]; then port="$port_a"; else port="$port_b"; fi
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$port/api/auth/login" \
    -H 'content-type: application/json' -H "x-forwarded-for: $address" --data '{}')"
  echo "$port $code" >> "$codes"
done
elapsed=$(( $(date +%s) - started ))

# Accepted means the login route answered: an empty JSON body is a 400, taken after the rate-limit upsert and
# before any credential lookup. A curl transport failure writes 000 and is neither accepted nor refused, so it is
# counted apart rather than folded into the accepted side, where it would hide a dead instance behind a green run.
accepted="$(grep -c ' 400$' "$codes" || true)"
refused="$(grep -c ' 429$' "$codes" || true)"
other="$(grep -cvE ' (400|429)$' "$codes" || true)"
echo "$((limit + 1)) requests over $elapsed s across two instances on address $address: $accepted accepted (400), $refused refused with 429, $other neither"

if [ "$elapsed" -ge 60 ]; then
  echo "the walk crossed a rate-limit window ($elapsed s); run it again"
  exit 1
fi
if [ "$refused" != "1" ] || [ "$accepted" != "$limit" ] || [ "$other" != "0" ]; then
  echo "FAIL: expected exactly $limit accepted, 1 refused and no other code, so the counter is shared, not per instance"
  sort "$codes" | uniq -c
  exit 1
fi

# The walk alternates strictly, so one instance can serve at most ceil((limit + 1) / 2) of it. That share, not the
# limit, is what the refusing instance's own count must be bounded by: comparing it against the limit itself is an
# assertion that no alternating walk can ever fail, and it would stay green if the walk stopped alternating and one
# instance served the whole limit by itself. Both bounds are stated, the share first because it is the one that can
# go red, and the walk's own split is printed so a reader sees the two counts the argument rests on.
share=$(( (limit + 2) / 2 ))
refuser="$(grep ' 429$' "$codes" | cut -d' ' -f1)"
own="$(grep -c "^$refuser " "$codes")"
for port in "$port_a" "$port_b"; do
  echo "  the instance on $port served $(grep -c "^$port " "$codes") of the $((limit + 1)) requests"
done
echo "the 429 was answered by the instance on $refuser, which had served $own of the $((limit + 1)) requests itself"
[ "$own" -le "$share" ] || { echo "FAIL: the walk did not alternate: that instance served $own of $((limit + 1)), above the share $share, so the split the argument rests on is gone"; exit 1; }
[ "$own" -lt "$limit" ] || { echo "FAIL: that instance served $own on its own, at or above the limit $limit, so its 429 proves nothing about a shared counter"; exit 1; }
echo "stateless: the rate-limit counter is shared through Postgres, no instance memory is load-bearing"
