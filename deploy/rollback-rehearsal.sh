#!/usr/bin/env bash
set -euo pipefail
cd /opt/shopfast
sha=${1:?Candidate commit required}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 1
before=$(readlink releases/current)
config_before=$(sha256sum nginx/default.conf | cut -d ' ' -f1)
start=$SECONDS
set +e
HARNESS_FORCE_ROLLBACK=1 bash deploy-release.sh "$sha" > /tmp/shopfast-rollback-rehearsal.log 2>&1
code=$?
set -e
test "$code" -ne 0
grep -q 'Previous release restored' /tmp/shopfast-rollback-rehearsal.log
test "$(readlink releases/current)" = "$before"
test "$(sha256sum nginx/default.conf | cut -d ' ' -f1)" = "$config_before"
curl --fail --silent --max-time 15 https://shopfast.tuanpq.com/api/v1/health/ready | jq -e '.data.status == "ok"' >/dev/null
elapsed=$((SECONDS-start))
test "$elapsed" -lt 120
printf '{"status":"PASS","durationSeconds":%s,"previousFrontendRestored":true,"previousNginxRestored":true,"httpsReady":true,"injection":"forced post-promotion health rejection of otherwise healthy fixture candidate"}\n' "$elapsed" > reports/rollback.json
cat reports/rollback.json
