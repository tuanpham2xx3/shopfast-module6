#!/usr/bin/env bash
set -euo pipefail
cd /opt/shopfast
umask 077
install -d -m 0700 backups
exec 9>backups/.lock
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="backups/shopfast-${stamp}.dump"
docker compose -f compose.infra.yml exec -T postgres pg_dump -U shopfast -d shopfast -Fc --exclude-schema='harness_*' --exclude-schema='test_*' > "$file"
test -s "$file"
sha256sum "$file" > "${file}.sha256"
/opt/shopfast/aws-venv/bin/aws s3 cp "$file" "s3://shopfast-backups-321323528839-ap-southeast-2/backups/${file##*/}" --region ap-southeast-2 --only-show-errors
/opt/shopfast/aws-venv/bin/aws s3 cp "${file}.sha256" "s3://shopfast-backups-321323528839-ap-southeast-2/backups/${file##*/}.sha256" --region ap-southeast-2 --only-show-errors
printf '%s\n' "$stamp" > backups/last-success
find backups -maxdepth 1 -type f -name 'shopfast-*.dump*' -mtime +3 -delete
echo "Backup uploaded: ${file##*/}"
