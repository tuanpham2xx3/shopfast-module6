# M0 implementation ledger — 18/10/2026

Plan: `docs/superpowers/plans/2026-10-18-m0-foundation.md`.

## Task 1 — workspace and HTTP contract

- Branch `feat/m0-foundation`; implementation remains in the existing checkout.
- API, worker, and React web scaffold created. Web is an initial placeholder.
- API configuration validation, request IDs, safe errors, liveness and OpenAPI implemented.
- Ruling: the API contract in document 03 is authoritative: success is `{data, requestId}` and error is `{error, requestId}`. Corrected the unfinished initial tests accordingly.
- Ruling: readiness depends primarily on PostgreSQL; Redis-only outage means degraded, as document 03 requires. Until probes are connected, the endpoint returns 503.
- Verified: 9 tests pass; TypeScript, ESLint, API/worker/web builds pass.
- PostgreSQL 16 portable was subsequently initialized on loopback port 55432 with `shared_buffers=32MB` and `max_connections=20`. App connects as `shopfast_app` (no superuser/createdb/createrole); generated credentials and local `.env` are gitignored.
- Dependency audit currently reports transitive advisories on the required NestJS 10 stack. No automatic major upgrade. Dependency remediation remains open before final acceptance.

## Task 2 — PostgreSQL and outbox persistence

- PostgreSQL `16.15` Windows binaries downloaded from EDB's official binaries download page. The native server runs separately from any machine-wide installation.
- Initial migration adds `outbox_events`, `job_executions`, and `fake_deliveries` with keys, constraints, and pending-outbox index.
- `db:migrate` applied 1 migration; a second invocation applied 0. `db:seed` created an idempotent fake email event.
- Four integration tests passed on real PostgreSQL under Node `20.20.2`, including a rerun as the restricted app role. Tests create random schemas and clean them up.
- Tests prove atomic rollback of an outbox insert, duplicate-safe fake delivery, and retry state after a failed publish. They do not yet prove a Redis-backed queue roundtrip.

## Task 3 — worker and Redis contract (implementation awaiting native acceptance)

- Worker connects to PostgreSQL and BullMQ, leases pending rows with `SKIP LOCKED`, fences publisher updates using a lease token, and retries queue publication failures.
- Fake email/storage/partner delivery is idempotent by business key in the same transaction as job completion.
- Redis contract tests cover expiring counters, Lua, Pub/Sub, delayed jobs and retry. These tests have not passed locally: Memurai is not installed/running.
- Downloaded Memurai 4.0.1 MSI has a valid Janea Systems signature. Automatic approval review rejected the `msiexec /a` extraction action with `blocked by policy`; no further installer action was attempted.
- `dev:doctor` passed Node 20 and PostgreSQL 16 connectivity and failed Redis connectivity/version, as expected for the current machine.

## Task 4 — verification and CI

- Application CI added with PostgreSQL 16/Redis 7 Linux service containers. No local Docker or WSL was started. Workflow is local only and has not run on GitHub because this implementation branch has not been pushed.
- API HTTP tests cover malformed JSON, the 64 KB body limit, safe 404 errors, request IDs, liveness, and unavailable DB readiness.
- Compiled API startup smoke passed on Node `20.20.2`.
- Follow-up `--detectOpenHandles` run passed 13 tests and reported no open handles. Normal runs emitted a delayed-exit warning after local `.env` was added; HTTP tests were then isolated from both local DB and Redis URLs to avoid incidental network probes.
- Nonbreaking `npm audit fix --ignore-scripts` applied safe updates. Audit still reports 65 advisories across application/development dependencies (4 low, 15 moderate, 46 high), including the required NestJS 10 dependency tree. This is an open acceptance item; no claim of production readiness.

## Remaining acceptance work

Implementation commits: `71587d6` (workspace), `f66da1b` (database/readiness), `731c6e6` (worker/outbox). Final Node 20 checks passed format/lint/typecheck, 13 unit/HTTP tests and all application builds. Final 13-test run after environment isolation exited without a delayed-exit warning. Four PostgreSQL integration tests and compiled API smoke also passed.

Finish native Memurai installation, run the Redis/BullMQ contracts and full queue roundtrip, resolve or explicitly assess dependency advisories, and run the new CI workflow after an authorized push. M0 remains in progress until these gates pass.
