#!/usr/bin/env bash
set -euo pipefail
cd /opt/shopfast
schema="harness_recovery_$(date +%s)"
install -d -m 0770 reports
chown ubuntu:ubuntu reports
docker run --rm --network shopfast_default --env-file .env -e NODE_ENV=test -e DATABASE_SCHEMA="$schema" -v /opt/shopfast/resilience.cjs:/app/resilience.cjs:ro -v /opt/shopfast/reports:/reports shopfast-app:initial node /app/resilience.cjs
