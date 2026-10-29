#!/usr/bin/env bash
set -euo pipefail
cd /opt/shopfast
install -d -m 0755 nginx releases/initial/web
if [ ! -L releases/current ]; then
  docker cp shopfast-web-1:/usr/share/nginx/html/. releases/initial/web/
  ln -s initial releases/current
fi
if [ ! -f nginx/default.conf ]; then
  sed 's|/usr/share/nginx/html|/srv/releases/current/web|g' source/deploy/nginx/nginx.conf > nginx/default.conf
fi
docker compose -f compose.infra.yml -f compose.app.yml up -d --no-deps web
curl --fail --silent --max-time 15 https://shopfast.tuanpq.com/api/v1/health/live >/dev/null
echo 'Release directory and Nginx mounts ready'
