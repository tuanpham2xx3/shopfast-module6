#!/usr/bin/env bash
set -euo pipefail
cd /opt/shopfast
exec 9>performance.lock
flock -n 9 || exit 1
schema="harness_load_$(date +%s)"
[[ "$schema" =~ ^harness_load_[0-9]+$ ]] || exit 1
set -a
. ./.env
set +a
image=${HARNESS_APP_IMAGE:-${APP_IMAGE:?}}
[[ "$image" =~ ^shopfast-app:[a-z0-9-]+$ || "$image" =~ ^ghcr.io/tuanpham2xx3/shopfast-module6-app: ]] || exit 1
install -d -m 0770 reports
chown ubuntu:ubuntu reports
cleanup(){
  docker rm -f shopfast-load-api shopfast-load-nginx >/dev/null 2>&1 || true
  docker run --rm --network shopfast_default --env-file .env -e DATABASE_SCHEMA="$schema" -v /opt/shopfast/performance.cjs:/app/performance.cjs:ro "$image" node /app/performance.cjs cleanup
}
trap cleanup EXIT
docker run --rm --network shopfast_default --env-file .env -e DATABASE_SCHEMA="$schema" -v /opt/shopfast/performance.cjs:/app/performance.cjs:ro "$image" node /app/performance.cjs seed
docker run -d --name shopfast-load-api --network shopfast_default --env-file app.env -e "DATABASE_URL=postgresql://shopfast:$POSTGRES_PASSWORD@postgres:5432/shopfast" -e DATABASE_SCHEMA="$schema" -e REDIS_URL=redis://redis:6379/14 "$image"
docker run -d --name shopfast-load-nginx --network shopfast_default -v /opt/shopfast/performance-nginx.conf:/etc/nginx/nginx.conf:ro -v /etc/letsencrypt:/etc/letsencrypt:ro nginx:stable-bookworm
ready=false
for attempt in $(seq 1 30); do
  if docker exec shopfast-load-api node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then ready=true; break; fi
  sleep 2
done
test "$ready" = true
ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' shopfast-load-nginx)
docker run --rm --network shopfast_default --add-host "shopfast.tuanpq.com:$ip" --env-file .env --env-file app.env -e DATABASE_SCHEMA="$schema" -e REDIS_URL=redis://redis:6379/14 -v /opt/shopfast/performance.cjs:/app/performance.cjs:ro -v /opt/shopfast/reports:/reports "$image" node /app/performance.cjs measure
