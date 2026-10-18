# M0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally runnable ShopFast API, worker, and web foundation with validated configuration, PostgreSQL migrations, Redis/BullMQ contracts, and an outbox fake-job slice.

**Architecture:** Use an npm workspace with NestJS 10 API and worker applications, a React/Vite web application, and focused shared libraries. PostgreSQL is authoritative; Redis/Memurai supports queues and readiness but does not replace database state.

**Tech Stack:** Node.js 20, TypeScript, NestJS 10, TypeORM 0.3, PostgreSQL 16, BullMQ, ioredis, React, Vite, Jest, Supertest.

**Spec:** `docs/07-implementation-roadmap.md` (M0), supported by `docs/02-data-architecture.md`, `docs/03-api-contract.md`, and `docs/04-runtime-flows.md`.

## Global Constraints

- Do not start Docker Desktop or WSL on the development machine.
- Keep secrets in environment variables and commit examples only.
- Bind local PostgreSQL and Memurai to loopback.
- Use the standard API envelope and propagate `requestId`.
- Every behavior change starts with a failing test and ends with a focused commit.

## Review Focus

- Missing or malformed environment variables must stop startup with actionable errors.
- A caller-supplied valid request ID is preserved; invalid input is replaced.
- Unknown routes and validation failures use the same safe error envelope.
- Readiness fails when a required dependency is unavailable while liveness remains healthy.
- Reprocessing an outbox event must not duplicate the fake side effect.

---

### Task 1: Runnable workspace and HTTP contract

**Files:** root workspace config; `apps/api/**`; `apps/worker/**`; `apps/web/**`; `libs/platform/src/config/**`; API contract tests.

**Interfaces:** Produces `createApiApp()`, validated `AppEnvironment`, `/health/live`, `/health/ready`, request ID middleware, and global error envelope.

- [ ] Write failing API contract and configuration tests.
- [ ] Add the minimal workspace and applications needed to pass them.
- [ ] Verify format, lint, typecheck, unit tests, and builds.
- [ ] Commit `feat(foundation): scaffold ShopFast applications`.

### Task 2: PostgreSQL foundation

**Files:** `libs/platform/src/database/**`; `database/migrations/**`; `database/seeds/**`; integration tests and doctor scripts.

**Interfaces:** Produces a TypeORM data source, repeatable migration command, initial outbox/job tables, small development seed, and PostgreSQL readiness probe.

- [ ] Write failing migration and database health integration tests.
- [ ] Add the data source, migrations, seed, and lifecycle integration.
- [ ] Verify migration from empty DB and safe rerun against PostgreSQL 16 native.
- [ ] Commit `feat(database): add PostgreSQL foundation`.

### Task 3: Redis, queue, and transactional outbox slice

**Files:** `libs/platform/src/redis/**`; `libs/platform/src/queue/**`; `libs/platform/src/outbox/**`; worker handlers; contract/integration tests.

**Interfaces:** Produces Redis and BullMQ connectivity probes, delayed/retry smoke, outbox leasing publisher, idempotent fake adapters, and worker health.

- [ ] Write failing Redis/BullMQ and outbox idempotency tests.
- [ ] Add the probes, queue adapters, publisher, and fake handler.
- [ ] Verify commands, Lua, Pub/Sub, delayed/retry, and duplicate delivery against Memurai native.
- [ ] Commit `feat(worker): add outbox queue foundation`.

### Task 4: M0 CI and evidence

**Files:** root scripts; `.github/workflows/ci.yml`; `docs/evidence/**`; roadmap status.

**Interfaces:** Produces one local/CI command for format, lint, typecheck, unit, integration, and build, plus reproducible M0 evidence.

- [ ] Add checks that fail when a required stage is missing or broken.
- [ ] Add CI jobs using service containers only on GitHub-hosted Linux.
- [ ] Run the full local suite and record real evidence and any environment gaps.
- [ ] Commit `ci: verify M0 foundation`.

