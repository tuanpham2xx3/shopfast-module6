# M3 purchase flow evidence

Date: 2026-10-18. Branch: `feat/m3-orders`.

Implemented customer cart, checkout with shipping-address snapshot, locked inventory reservations, fixed-value promotions, idempotency records, order/payment/history records, mock payment, customer/admin cancellation and warehouse transitions. Every checkout/transition records its outbox event transactionally. Payment does not consume stock; SHIPPING consumes onHand/reserved once. Cancellation releases reservations and refunds a paid mock payment atomically. Expiry service accepts an injected time and can catch up unpaid orders; worker scheduling is M4.

## Verified

- Seven real PostgreSQL transaction tests passed: exactly one success among 20 requests for one available unit; replay and changed-payload conflict; cart quantity subtraction; ownership denial; full delivery lifecycle; price mismatch and multi-item rollback; paid cancellation/refund; concurrent final-promotion quota; expiry replay and paid-order exclusion; 12 concurrent crossed-taxonomy carts.
- Live Chromium purchase flow passed with the documented `shippingAddress` structure. The browser registers/verifies a synthetic user, reloads session, creates stock, adds to cart, checks out, cancels and repurchases, confirms MOCK payment and processes to DELIVERED. Test-only SQL changes the synthetic account role between customer/staff views; production exposes no role-changing registration input.
- Browser mutation retries retain the same idempotency key for an unchanged payload during the page session.

## Independent review fixes

Review found four issues. Empty-array addresses first reproduced HTTP 201 instead of 400; `IsObject` now rejects them. Successful checkout attempts now retire their UI key: the cancel/rebuy regression first left only one order, and now produces two. Checkout locks products, taxonomy parents and inventory in separate deterministic phases; expiry locks all batch inventory globally before release. The concurrent taxonomy test passed after these changes. The two deadlock fixes are based on lock-order review plus contention testing, not a deterministic reproduction of every database interleaving.

## Pending for complete acceptance

Final local verification: `npm run check` passed (format/lint/typecheck, 16 unit/contract tests, API/worker/web builds); PostgreSQL integration excluding the unavailable local Redis suite passed 26 tests across seven suites; `npm run test:e2e` passed both Chromium tests. Redis tests remain in CI and are not marked passing locally.

Redis-backed workers, actual reminder scheduling, invoice generation, realtime events, cache/global/login/promo rate limiting, admin editor UI and Gemini/ticket flows are still pending. No claim of whole-project completion, performance SLA or provider acceptance is made. Docker/cloud remain deferred.
