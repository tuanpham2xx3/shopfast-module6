#!/usr/bin/env bash
set -euo pipefail
cd /opt/shopfast
umask 077
exec 8>restore.lock
flock -n 8 || exit 1
stamp=$(cat backups/last-success)
[[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || exit 1
file="shopfast-${stamp}.dump"
fixture="harness_restore_$(date +%s)"
[[ "$fixture" =~ ^harness_restore_[0-9]+$ ]] || exit 1
start=$SECONDS
install -d -m 0700 restore
aws=/opt/shopfast/aws-venv/bin/aws
"$aws" s3 cp "s3://shopfast-backups-321323528839-ap-southeast-2/backups/$file" "restore/$file" --region ap-southeast-2 --only-show-errors
"$aws" s3 cp "s3://shopfast-backups-321323528839-ap-southeast-2/backups/$file.sha256" "restore/$file.sha256" --region ap-southeast-2 --only-show-errors
expected=$(cut -d ' ' -f1 "restore/$file.sha256")
actual=$(sha256sum "restore/$file" | cut -d ' ' -f1)
test "$actual" = "$expected"
compose=(docker compose -f compose.infra.yml)
cleanup(){ docker rm -f shopfast-restore-api >/dev/null 2>&1 || true; "${compose[@]}" exec -T postgres dropdb -U shopfast --if-exists "$fixture"; rm -f "restore/$file" "restore/$file.sha256"; }
trap cleanup EXIT
"${compose[@]}" exec -T postgres createdb -U shopfast "$fixture"
"${compose[@]}" exec -T postgres pg_restore -U shopfast -d "$fixture" --exit-on-error < "restore/$file"
for table in users products orders inventories tickets invoices; do
  original=$("${compose[@]}" exec -T postgres psql -U shopfast -d shopfast -Atc "SELECT count(*) FROM $table")
  restored=$("${compose[@]}" exec -T postgres psql -U shopfast -d "$fixture" -Atc "SELECT count(*) FROM $table")
  test "$original" = "$restored"
done
invalid=$("${compose[@]}" exec -T postgres psql -U shopfast -d "$fixture" -Atc 'SELECT count(*) FROM inventories WHERE on_hand<0 OR reserved<0 OR reserved>on_hand')
test "$invalid" = 0
invoice_count=$("${compose[@]}" exec -T postgres psql -U shopfast -d "$fixture" -Atc 'SELECT count(*) FROM invoices')
test "$invoice_count" -gt 0
bad_invoices=$("${compose[@]}" exec -T postgres psql -U shopfast -d "$fixture" -Atc "SELECT count(*) FROM invoices WHERE checksum<>encode(sha256(content),'hex') OR substring(content FROM 1 FOR 5)<>convert_to('%PDF-','UTF8')")
test "$bad_invoices" = 0
set -a
. ./.env
set +a
docker run -d --name shopfast-restore-api --network shopfast_default --env-file app.env -e HARNESS_RESTORE_DATABASE="$fixture" -e REDIS_URL=redis://redis:6379/13 -v /opt/shopfast/restore-api.cjs:/tmp/restore-api.cjs:ro -v /opt/shopfast/deployment-seed.env:/tmp/seed.env:ro --memory 768m "${APP_IMAGE:?}" node /tmp/restore-api.cjs server >/dev/null
ready=false
for attempt in $(seq 1 30); do
  if docker exec shopfast-restore-api node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(r=>r.json()).then(r=>process.exit(r.data?.status==='ok'?0:1)).catch(()=>process.exit(1))"; then ready=true; break; fi
  sleep 2
done
test "$ready" = true
docker exec shopfast-restore-api node /tmp/restore-api.cjs smoke | jq -e '.restoredLogin and .restoredOrderRead' >/dev/null
elapsed=$((SECONDS-start))
test "$elapsed" -lt 1800
printf '{"status":"PASS","durationSeconds":%s,"checksumVerified":true,"isolatedDatabase":true,"tableCountsMatched":true,"restoredLogin":true,"restoredOrderRead":true,"invoicePdfAndChecksum":true}\n' "$elapsed" > restore/latest-report.json
cat restore/latest-report.json
