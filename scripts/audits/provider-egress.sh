#!/usr/bin/env bash
# Provider egress audit (INV-4, AC-NFR-10, ARCHITECTURE 9.1): no code path outside src/gateway/ may call a provider.
# Fails when a file outside the allowed paths names a provider host or product (api.z.ai, openai, anthropic,
# deepseek, huggingface.co) or calls fetch( toward anything. Allowed: src/gateway/** (the one egress),
# scripts/models/fetch.ts (the build-time model download under a hash check, ADR-009), src/contracts/generated/**
# (contract description strings; the files import only zod, asserted below), tests, and a file that calls only
# same-origin routes and says so with the comment "// egress: none".
set -uo pipefail
cd "$(dirname "$0")/../.."
status=0

providers='api\.z\.ai|openai|anthropic|deepseek|huggingface\.co'
roots=()
for r in src scripts tests next.config.ts; do [ -e "$r" ] && roots+=("$r"); done

# 1. provider names outside the allowed paths
hits=$(grep -rniE "$providers" "${roots[@]}" 2>/dev/null \
  | grep -vE '^src/gateway/|^scripts/models/fetch\.ts:|^scripts/bundle/pull\.ts:|^src/contracts/generated/|^scripts/audits/|\.test\.tsx?:' || true)
if [ -n "$hits" ]; then
  echo "$hits"
  echo "provider-egress: a provider name outside src/gateway/"
  status=1
fi

# 2. fetch( outside the gateway (TypeScript and JavaScript; tests and declared same-origin files are allowed)
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    src/gateway/*|scripts/models/fetch.ts|scripts/bundle/pull.ts|tests/*|*.test.ts|*.test.tsx|*.spec.ts) continue ;;
  esac
  if grep -q '// egress: none' "$f"; then continue; fi
  echo "$f: fetch( outside src/gateway/ without '// egress: none'"
  status=1
done < <(grep -rlE 'fetch\(' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' "${roots[@]}" 2>/dev/null || true)

# 3. the generated contracts hold no code beyond zod
bad=$(grep -hE '^import ' src/contracts/generated/*.ts 2>/dev/null | grep -v 'from "zod"' || true)
if [ -n "$bad" ]; then
  echo "$bad"
  echo "provider-egress: a generated contract imports beyond zod"
  status=1
fi

[ "$status" -eq 0 ] && echo "provider-egress: clean"
exit "$status"
