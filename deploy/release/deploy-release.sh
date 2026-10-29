#!/usr/bin/env bash
set -euo pipefail
cd /opt/shopfast
exec 9>release.lock
flock -n 9 || { echo 'Another release is active'; exit 1; }
sha=${1:?Commit SHA required}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 1
frontend_ready(){
  local html asset
  html=$(curl --fail --silent --max-time 15 https://shopfast.tuanpq.com/) || return 1
  grep -q 'id="root"' <<< "$html" || return 1
  asset=$(sed -n 's/.*src="\([^"]*\.js\)".*/\1/p' <<< "$html" | head -n1)
  [[ "$asset" =~ ^/assets/[a-zA-Z0-9_.-]+\.js$ ]] || return 1
  curl --fail --silent --head --max-time 15 "https://shopfast.tuanpq.com$asset" | grep -qi 'content-type:.*javascript'
}
if [ "${HARNESS_FORCE_ROLLBACK:-0}" != 1 ] && [ -f release.json ] && [ "$(jq -r .commit release.json)" = "$sha" ] && [ "$(readlink releases/current)" = "$sha" ]; then
  curl --fail --silent --max-time 15 https://shopfast.tuanpq.com/api/v1/health/ready | jq -e '.data.status == "ok"' >/dev/null
  frontend_ready
  echo 'Exact release already active and healthy'; exit 0
fi
app="ghcr.io/tuanpham2xx3/shopfast-module6-app:$sha"
web="ghcr.io/tuanpham2xx3/shopfast-module6-web:$sha"
start=$SECONDS
docker pull "$app"
docker pull "$web"
app=$(docker image inspect -f '{{index .RepoDigests 0}}' "$app")
web=$(docker image inspect -f '{{index .RepoDigests 0}}' "$web")
install -d -m 0755 "releases/$sha/web"
install -d -m 0750 nginx
container=$(docker create "$web")
docker cp "$container:/usr/share/nginx/html/." "releases/$sha/web/"
docker rm "$container" >/dev/null
# Nginx worker UID must traverse/read public assets; these contain no runtime secrets.
find "releases/$sha/web" -type d -exec chmod 0755 {} +
find "releases/$sha/web" -type f -exec chmod 0644 {} +
api="shopfast-api-$sha"
if [ "${HARNESS_FORCE_ROLLBACK:-0}" = 1 ]; then api="${api}-rehearsal"; fi
docker inspect "$api" >/dev/null 2>&1 || docker run -d --name "$api" --network shopfast_default --env-file app.env --restart unless-stopped --memory 768m "$app"
if [ "$(docker inspect -f '{{.State.Running}}' "$api")" != true ]; then docker start "$api" >/dev/null; fi
ready=false
for attempt in $(seq 1 24); do
  if docker exec "$api" node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(r=>r.json()).then(r=>process.exit(r.data?.status==='ok'?0:1)).catch(()=>process.exit(1))"; then ready=true; break; fi
  sleep 2
done
test "$ready" = true || { docker stop "$api"; echo 'Candidate not ready; old release unchanged'; exit 1; }
# Migrations run before promotion with the bootstrap/migration identity, never application credentials.
docker run --rm --network shopfast_default --env-file .env -v /opt/shopfast/migrate.cjs:/tmp/migrate.cjs:ro "$app" node /tmp/migrate.cjs
previous=$(readlink releases/current || true)
cp nginx/default.conf nginx/previous.conf.bak
sed "s|http://api:3000|http://$api:3000|g; s|/usr/share/nginx/html|/srv/releases/current/web|g" source/deploy/nginx/nginx.conf > nginx/candidate.conf.tmp
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
if [ "${HARNESS_FORCE_ROLLBACK:-0}" = 1 ] || ! curl --fail --silent --max-time 15 https://shopfast.tuanpq.com/api/v1/health/ready | jq -e '.data.status == "ok"' >/dev/null || ! frontend_ready; then rollback; exit 1; fi
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
if [ "$((SECONDS-start))" -ge 600 ]; then
  docker stop "$worker" >/dev/null
  [ -z "$old_worker" ] || docker start "$old_worker" >/dev/null
  rollback; echo 'Release exceeded deadline'; exit 1
fi
printf '{"commit":"%s","appImageId":"%s","durationSeconds":%s,"previous":"%s"}\n' "$sha" "$(docker image inspect -f '{{.Id}}' "$app")" "$((SECONDS-start))" "$previous" > release.json.tmp
mv release.json.tmp release.json
sed -i '/^APP_IMAGE=/d; /^WEB_IMAGE=/d' .env
printf 'APP_IMAGE=%s\nWEB_IMAGE=%s\n' "$app" "$web" >> .env
chmod 600 .env
# Keep containers available for recovery without consuming RAM after draining requests.
sleep 15
while IFS= read -r old_api; do
  [ "$old_api" = "$api" ] || docker stop --time 30 "$old_api" >/dev/null
done < <(docker ps --format '{{.Names}}' | grep '^shopfast-api-' || true)
echo "Release promoted: $sha"
