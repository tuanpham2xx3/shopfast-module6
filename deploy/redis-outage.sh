#!/usr/bin/env bash
set -euo pipefail
cd /opt/shopfast
exec 9>redis-outage.lock
flock -n 9 || exit 1
rm -f reports/cache-warm-marker reports/redis-down-marker reports/cache-down-validated reports/redis-up-marker
cleanup(){ docker rm -f shopfast-harness-redis shopfast-harness-outage-client >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name shopfast-harness-redis --network shopfast_default redis:7.4.8-bookworm redis-server --appendonly yes >/dev/null
schema="harness_recovery_$(date +%s)"
docker run -d --name shopfast-harness-outage-client --network shopfast_default --env-file .env -e DATABASE_SCHEMA="$schema" -v /opt/shopfast/redis-outage.cjs:/app/redis-outage.cjs:ro -v /opt/shopfast/reports:/reports shopfast-app:harness-fixed node /app/redis-outage.cjs >/dev/null
wait_marker(){ for attempt in $(seq 1 300); do test ! -f "reports/$1" || return 0; sleep .1; done; docker logs shopfast-harness-outage-client; return 1; }
wait_marker cache-warm-marker
docker stop shopfast-harness-redis >/dev/null
touch reports/redis-down-marker
wait_marker cache-down-validated
docker start shopfast-harness-redis >/dev/null
for attempt in $(seq 1 30); do docker exec shopfast-harness-redis redis-cli ping >/dev/null 2>&1 && break; sleep .1; done
touch reports/redis-up-marker
code=$(docker wait shopfast-harness-outage-client)
docker logs shopfast-harness-outage-client
test "$code" = 0
