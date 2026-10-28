#!/usr/bin/env bash
set -euo pipefail
cd /opt/shopfast
exec 9>release.lock
flock -n 9 || { echo 'Another release is active'; exit 1; }
sha=${1:?Commit SHA required}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 1
app="ghcr.io/tuanpham2xx3/shopfast-module6-app:$sha"
web="ghcr.io/tuanpham2xx3/shopfast-module6-web:$sha"
start=$SECONDS
docker pull "$app"
docker pull "$web"
app=$(docker image inspect -f '{{index .RepoDigests 0}}' "$app")
web=$(docker image inspect -f '{{index .RepoDigests 0}}' "$web")
install -d -m 0750 "releases/$sha/web" nginx
container=$(docker create "$web")
docker cp "$container:/usr/share/nginx/html/." "releases/$sha/web/"
docker rm "$container" >/dev/null
api="shopfast-api-$sha"
docker inspect "$api" >/dev/null 2>&1 || docker run -d --name "$api" --network shopfast_default --env-file app.env --restart unless-stopped --memory 768m "$app"
if [ "$(docker inspect -f '{{.State.Running}}' "$api")" != true ]; then docker start "$api" >/dev/null; fi
ready=false
for attempt in $(seq 1 24); do
  if docker exec "$api" node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then ready=true; break; fi
  sleep 2
done
test "$ready" = true || { docker stop "$api"; echo 'Candidate not ready; old release unchanged'; exit 1; }
# Migrations run before promotion with the bootstrap/migration identity, never application credentials.
docker run --rm --network shopfast_default --env-file .env -v /opt/shopfast/migrate.cjs:/tmp/migrate.cjs:ro "$app" node /tmp/migrate.cjs
previous=$(readlink releases/current || true)
cp nginx/default.conf nginx/previous.conf.bak
sed "s|http://api:3000|http://$api:3000|g; s|/usr/share/nginx/html|/srv/releases/current/web|g" source/deploy/nginx.conf > nginx/candidate.conf.tmp
mv nginx/candidate.conf.tmp nginx/default.conf
ln -sfn "$sha" releases/next
mv -Tf releases/next releases/current
rollback(){
  cp nginx/previous.conf.bak nginx/default.conf
  if [ -n "$previous" ]; then ln -sfn "$previous" releases/next; mv -Tf releases/next releases/current; fi
  docker compose -f compose.infra.yml -f compose.app.yml exec -T web nginx -t
  docker compose -f compose.infra.yml -f compose.app.yml exec -T web nginx -s reload
  docker stop "$api" >/dev/null
  echo 'Previous release restored'
}
if ! docker compose -f compose.infra.yml -f compose.app.yml exec -T web nginx -t; then rollback; exit 1; fi
docker compose -f compose.infra.yml -f compose.app.yml exec -T web nginx -s reload
if [ "${HARNESS_FORCE_ROLLBACK:-0}" = 1 ] || ! curl --fail --silent --max-time 15 https://shopfast.tuanpq.com/api/v1/health/ready >/dev/null; then rollback; exit 1; fi
# Worker switchover after API is healthy. Preserve old worker for rollback.
worker="shopfast-worker-$sha"
old_worker=$(docker ps --format '{{.Names}}' | grep '^shopfast-worker-' | head -n1 || true)
if [ "$old_worker" != "$worker" ]; then
  [ -z "$old_worker" ] || docker stop --time 60 "$old_worker" >/dev/null
  if ! (docker inspect "$worker" >/dev/null 2>&1 && docker start "$worker" >/dev/null || docker run -d --name "$worker" --network shopfast_default --env-file app.env --restart unless-stopped --memory 768m "$app" node dist/apps/worker/src/main.js); then
    [ -z "$old_worker" ] || docker start "$old_worker" >/dev/null
    rollback; exit 1
  fi
fi
sleep 3
if [ "$(docker inspect -f '{{.State.Running}}' "$worker")" != true ]; then
  [ -z "$old_worker" ] || docker start "$old_worker" >/dev/null
  rollback; exit 1
fi
printf '{"commit":"%s","appImageId":"%s","durationSeconds":%s,"previous":"%s"}\n' "$sha" "$(docker image inspect -f '{{.Id}}' "$app")" "$((SECONDS-start))" "$previous" > release.json
test "$((SECONDS-start))" -lt 600
echo "Release promoted: $sha"
