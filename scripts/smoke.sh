#!/usr/bin/env bash
# The M0 smoke (blueprint 11.11 AC-M0-01 to AC-M0-06, ARCHITECTURE section 12): a few minutes against a live URL with
# curl and jq only.
#
#   scripts/smoke.sh BASE_URL [OUT_JSON]
#
# DEMO_ENGINEER_PASSWORD comes from the environment (dotenv on the build machine, the repository secret in CI) and is
# never printed: jq reads it from its environment and curl takes the body on stdin, so it is on no command line.
# OUT_JSON, when given, receives { checks: [{ name, pass, detail }], all_pass }. The exit status is non-zero when
# any check fails.
set -u
set +x

BASE_URL="${1:?usage: scripts/smoke.sh BASE_URL [OUT_JSON]}"
BASE_URL="${BASE_URL%/}"
OUT_JSON="${2:-}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
JAR="$TMP/jar"
RESULTS=()
VERSION=""
LOGGED_IN=false

# The designed 404 of src/app/not-found.tsx and the DesignedState marker of src/components/DesignedState.tsx.
NOT_FOUND_TITLE="No sheet at this address"
DESIGNED_STATE_404='data-designed-state="404"'

record() { # name pass detail
  RESULTS+=("$(jq -cn --arg name "$1" --argjson pass "$2" --arg detail "$3" '{name: $name, pass: $pass, detail: $detail}')")
}

# fetch METHOD URL [curl options...]: body to $TMP/body, headers to $TMP/headers, prints the status (000 on no answer).
fetch() {
  local method="$1" url="$2"
  shift 2
  : >"$TMP/body"
  : >"$TMP/headers"
  curl -s -o "$TMP/body" -D "$TMP/headers" -w '%{http_code}' --max-time 60 -X "$method" "$@" "$url" 2>/dev/null || true
}

header_value() { # name (case-insensitive), CR stripped
  grep -i "^$1:" "$TMP/headers" | head -1 | sed "s/^[^:]*: *//" | tr -d '\r'
}

body_excerpt() {
  tr -d '\r\n' <"$TMP/body" | head -c 160
}

# 1. GET /api/health: 200, ok true, non-empty corpus_version and commit (AC-M0-01)
code="$(fetch GET "$BASE_URL/api/health")"
if [ "$code" = "200" ] && jq -e '.ok == true and (.corpus_version | type == "string" and length > 0) and (.commit | type == "string" and length > 0)' "$TMP/body" >/dev/null 2>&1; then
  VERSION="$(jq -r '.corpus_version' "$TMP/body")"
  record health true "200 ok=true corpus_version=$VERSION commit=$(jq -r '.commit' "$TMP/body" | head -c 12)"
else
  record health false "status $code, body: $(body_excerpt)"
fi

# 2. GET / unauthenticated redirects to /login (D-07)
code="$(fetch GET "$BASE_URL/")"
location="$(header_value location)"
location_path="${location#"$BASE_URL"}"
case "$code" in
  30[1278])
    if [ "${location_path#/login}" != "$location_path" ]; then
      record root_redirects_to_login true "$code to $location_path"
    else
      record root_redirects_to_login false "$code to $location_path, expected /login"
    fi
    ;;
  *) record root_redirects_to_login false "status $code, expected a redirect to /login" ;;
esac

# 3. POST /api/auth/login as engineer_demo, then GET / with the cookie renders the active version label (AC-M0-02)
if [ -z "${DEMO_ENGINEER_PASSWORD:-}" ]; then
  record login_and_home false "DEMO_ENGINEER_PASSWORD is not set in the environment"
else
  code="$(jq -cn --arg u engineer_demo '{username: $u, password: env.DEMO_ENGINEER_PASSWORD}' |
    fetch POST "$BASE_URL/api/auth/login" -H 'content-type: application/json' --data-binary @- -c "$JAR")"
  if [ "$code" = "200" ] && jq -e '.alias | type == "string"' "$TMP/body" >/dev/null 2>&1; then
    LOGGED_IN=true
    alias="$(jq -r '.alias' "$TMP/body")"
    code="$(fetch GET "$BASE_URL/" -b "$JAR")"
    if [ -z "$VERSION" ]; then
      record login_and_home false "logged in as $alias, home $code, but /api/health gave no version label to look for"
    elif [ "$code" = "200" ] && grep -qF -- "$VERSION" "$TMP/body"; then
      record login_and_home true "logged in as $alias, home 200 carries $VERSION"
    else
      record login_and_home false "logged in as $alias, home $code, label $VERSION $([ "$code" = "200" ] && echo absent || echo unchecked)"
    fi
  else
    record login_and_home false "login status $code, body: $(body_excerpt)"
  fi
fi

# 4. GET /robots.txt disallows everything (AC-M0-03)
code="$(fetch GET "$BASE_URL/robots.txt")"
if [ "$code" = "200" ] && tr -d '\r' <"$TMP/body" | grep -q '^Disallow: /$'; then
  record robots_disallow true "200 with Disallow: /"
else
  record robots_disallow false "status $code, body: $(body_excerpt)"
fi

# 5. X-Robots-Tag noindex on /, /login and /api/health (AC-M0-04); / both unauthenticated and with the session
missing=""
for path in / /login /api/health; do
  fetch GET "$BASE_URL$path" >/dev/null
  header_value x-robots-tag | grep -qi noindex || missing="$missing $path"
done
if [ "$LOGGED_IN" = true ]; then
  fetch GET "$BASE_URL/" -b "$JAR" >/dev/null
  header_value x-robots-tag | grep -qi noindex || missing="$missing /(session)"
fi
if [ -z "$missing" ]; then
  record noindex_header true "x-robots-tag noindex on /, /login, /api/health$([ "$LOGGED_IN" = true ] && echo ' and / with the session')"
else
  record noindex_header false "x-robots-tag noindex missing on:$missing"
fi

# 6. GET /definitely-not-a-route: the designed 404, no stack trace (AC-M0-05); behind login, so with the session
if [ "$LOGGED_IN" = true ]; then
  code="$(fetch GET "$BASE_URL/definitely-not-a-route" -b "$JAR")"
else
  code="$(fetch GET "$BASE_URL/definitely-not-a-route")"
fi
if [ "$code" != "404" ]; then
  record designed_404 false "status $code$([ "$LOGGED_IN" = true ] || echo ' (unauthenticated: not logged in, so the proxy redirected)')"
elif ! grep -qF -- "$DESIGNED_STATE_404" "$TMP/body" || ! grep -qF -- "$NOT_FOUND_TITLE" "$TMP/body"; then
  record designed_404 false "404 without the designed state ($NOT_FOUND_TITLE)"
elif grep -qE 'at [^ ]+ \([^)]*:[0-9]+:[0-9]+\)|Unhandled Runtime Error|Internal Server Error' "$TMP/body"; then
  record designed_404 false "404 carries a stack trace or an error overlay"
else
  record designed_404 true "404 renders the designed state, no stack trace"
fi

# 7. The keep-alive workflow is in the repository (AC-M0-06, D-15)
if [ -f "$REPO_ROOT/.github/workflows/keep-alive.yml" ]; then
  record keep_alive_workflow true ".github/workflows/keep-alive.yml present"
else
  record keep_alive_workflow false ".github/workflows/keep-alive.yml missing"
fi

# Report
json="$(printf '%s\n' "${RESULTS[@]}" | jq -s '{checks: ., all_pass: (map(.pass) | all)}')"
if [ -n "$OUT_JSON" ]; then
  printf '%s\n' "$json" >"$OUT_JSON"
fi
passed="$(printf '%s' "$json" | jq -r '[.checks[] | select(.pass)] | length')"
total="$(printf '%s' "$json" | jq -r '.checks | length')"
failed="$(printf '%s' "$json" | jq -r '[.checks[] | select(.pass | not) | .name] | join(", ")')"
if [ "$passed" = "$total" ]; then
  echo "smoke $BASE_URL: $passed/$total checks passed"
  exit 0
fi
echo "smoke $BASE_URL: $passed/$total checks passed, failed: $failed"
exit 1
