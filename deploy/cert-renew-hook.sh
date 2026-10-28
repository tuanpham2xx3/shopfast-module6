#!/usr/bin/env bash
set -euo pipefail
cd /opt/shopfast
docker compose -f compose.infra.yml -f compose.app.yml exec -T web nginx -t
docker compose -f compose.infra.yml -f compose.app.yml exec -T web nginx -s reload
