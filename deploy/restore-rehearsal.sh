#!/usr/bin/env bash
set -euo pipefail
cd /opt/shopfast
umask 077
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
cleanup(){ "${compose[@]}" exec -T postgres dropdb -U shopfast --if-exists "$fixture"; rm -f "restore/$file" "restore/$file.sha256"; }
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
elapsed=$((SECONDS-start))
test "$elapsed" -lt 1800
printf '{"status":"PASS","durationSeconds":%s,"checksumVerified":true,"isolatedDatabase":true,"tableCountsMatched":true}\n' "$elapsed" > restore/latest-report.json
cat restore/latest-report.json
