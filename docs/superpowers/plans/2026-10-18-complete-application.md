# Complete application implementation

User directive: implement all remaining application features now; defer live Redis/Gemini/provider acceptance until configured. Cloud/Docker remain deferred. Existing docs 01–10 remain binding. No push/deploy.

## Work packages

1. Jobs and operations: typed outbox routing, leased/idempotent processing, fake development adapters explicitly labeled, invoice PDF and authorized download, reminder/expiry/revenue catch-up, failed-job archive/retry and queue health. Own `libs/modules/jobs`, migration 1780000500000, worker adapter and focused tests.
2. Tickets and Gemini: ticket/message/claim/state/ownership; provider adapter with backend-only key, bounded tool loop and grounded outputs, real DB tools, classification; immutable expiring proposal/confirmation transaction, dedup. Own `libs/modules/tickets`, `libs/modules/ai`, migration 1780000600000 and focused tests.
3. Runtime: cache with targeted invalidation/race protection/fallback; atomic sensitive and general limiters, login target-account protection. Own `libs/modules/runtime`, migration 1780000700000 and focused tests.
4. Integration: connect modules to API, config, migrations and worker; authenticated realtime order subscription, reconnect/resync UI; admin catalog/promotions/operations and ticket/support/AI screens; complete cart/order UX.
5. Verification/review: format/lint/typecheck/build, native PostgreSQL and deterministic provider tests, browser flows, independent security/invariant review. Add explicit live-test commands and NOT_RUN evidence for Redis/Gemini/email/performance; never label these passing without execution.

## Shared interfaces and rulings

- Workers call domain services; Redis/AI never becomes the authority for orders, inventory or permissions.
- Migration classes are wired centrally after packages finish; each package owns its uniquely numbered file.
- Root owns package installation, bootstrap, config, data-source registry and web entry point. Implementers report module exports and integration hooks; no simultaneous edits to these shared files.
- Existing auth returns PublicUser `{id,email,displayName,role,verified}`. Guards are exported by AuthModule. Services use schema-qualified PostgreSQL with validated schema names.
- External acceptance is deferred by user instruction, not implementation of production adapters or their explicit failure states. Fake adapters are development-only and surfaced as such.

## Progress ledger

- Baseline: 1c38805, purchase flow through DELIVERED. Redis native service absent; Gemini key not supplied. Neither prevents implementation.
- Packages 1–4 implemented and integrated. Package 5 local verification: 36 unit/contract +47 PostgreSQL integration +2 browser tests passed; build/lint/typecheck/docs/API smoke passed. Independent AI review corrections were applied. Actual provider/Redis/performance acceptance remains explicitly deferred; checkpoint details in `docs/evidence/application-completion.md`.
