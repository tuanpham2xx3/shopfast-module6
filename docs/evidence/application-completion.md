# Application implementation checkpoint — 2026-10-18

Branch: `feat/complete-application`. User authorized implementing remaining application features while deferring live external acceptance. No Docker/WSL, cloud provisioning, push or deploy.

## Implemented application paths

- Auth: limited registration/OTP, rotating session restore, logout, roles/verified guards; target-account/IP login protection and generic errors.
- Catalog/inventory/orders: transactional constraints/idempotency/ownership, filters, quantity editing, versioned inventory, promotions, mock payment/cancel/refund/expiry/delivery, scoped cache invalidation.
- Jobs: BullMQ primary dispatch, durable fenced PostgreSQL execution leases, retries/archive/admin retry, fake development and configurable HTTPS email adapters, partner version mock, real PDF invoice and authorized expiring download, reminder/expiry/revenue catch-up.
- Realtime: Socket.IO handshake/session/verified/ownership checks, subscription caps, expiry/revocation disconnect, post-commit events plus Redis outbox recovery; UI REST resync and polling fallback.
- Tickets/Gemini: ownership/claim/lifecycle/reopen, messages and approved drafts, linked-customer order lookup, bounded REST provider, classification, current-turn DB tools, grounded answers, immutable expiring proposals requiring human HTTP confirmation, deduplication.
- UI: customer, warehouse, support and admin views; catalog/product/taxonomy/promotion management, queue/health/failure controls, invoice download, request/error/loading states, rate-limit countdown and session refresh.

## Executed checks

| Check                                                        | Result                                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                              | PASS: format, lint, typecheck, 36 tests, all builds                                                                     |
| PostgreSQL integration excluding `redis.integration.spec.ts` | PASS: 12 suites, 47 tests                                                                                               |
| `npm run test:e2e` with TEST_DATABASE_URL                    | PASS: 2 Chromium tests, including live purchase → ticket → support reply → unconfigured-AI failure state → admin mobile |
| `npm run smoke:api`                                          | PASS: built API liveness                                                                                                |
| `npm run db:migrate`                                         | PASS: jobs/ticket migrations applied to native dev DB                                                                   |
| tooling `docs:check`                                         | PASS: 28 documentation files, no broken links at execution                                                              |

Focused lint and API/worker builds were rerun after the final Swagger compilation configuration and legacy development-event routing changes. The API smoke passed against compiled output. `support-ui-mobile.png` was visually inspected; the full browser test also checks no horizontal overflow in admin at 390px.

## Review and corrections

Independent AI review found an overall deadline gap, multiplied classification retries and a per-job circuit reset. Added the whole-request deadline, checks before late work, PROCESSING-fenced final persistence, a two-call classification budget and a retained worker AiService. Regression tests cover stalled initial DB lookup and the two-call quota-failure budget. Earlier order review findings remain in m3 evidence.

Integration caught a failed-jobs response envelope mismatch; the endpoint now returns paginated `{items,total,page,pageSize}` for the admin UI. Browser testing caught reading a React form after await; the AI form snapshots its message before awaiting session creation. Authenticated public catalog reads now contribute to the validated user limiter rather than consuming the guest IP budget.

## Acceptance remains separate

This checkpoint establishes implemented application behavior and the checks above. It does not mark final SRS acceptance complete. Live Redis/BullMQ/Lua/pubsub/cache compatibility, Gemini/email project/provider smoke, performance SLA, coverage threshold, independent 30-ticket human labels and infrastructure restore/deployment evidence remain unverified. P2 long-term retention/cleanup and scale-out control-plane coordination remain hardening work. See `external-acceptance-pending.md` for commands and required evidence.
