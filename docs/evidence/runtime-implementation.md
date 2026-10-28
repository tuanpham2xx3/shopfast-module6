# Runtime implementation evidence

Date: 2026-10-18. Branch: `feat/complete-application`.

Implemented Redis catalog read-through cache with TTL/jitter, short negative caching, scoped reverse indexes, atomic generation checks, miss version revalidation, stampede locks, timeout/circuit fallback and DB bulkhead. Mutation outbox records old/new membership tags transactionally; synchronous invalidation finishes before response or marks `cacheInvalidationPending` and bypasses the affected tags. Startup replays pending/recent invalidation tags and retries failed invalidation. No KEYS/namespace flush.

Global limits use verified user IDs when a bearer token is supplied, otherwise socket IP. Redis unavailable uses conservative per-process counters. Login IP, normalized target-account escalation/reset, existing OTP send, and checkout/promo limits use atomic PostgreSQL counters for sensitive paths. Errors carry 429 and Retry-After; UI renders a countdown. Forwarded IP headers are not trusted.

Executed before this report: native PostgreSQL + deterministic Redis-protocol double suites passed as part of twelve integration suites (46 tests). Whole unit/contract run passed 35 tests. Real Redis compatibility on this completion branch remains NOT_RUN; these doubles do not establish Lua/BullMQ compatibility or latency SLAs.

Scope is the single API instance baseline. Multi-instance cache-bypass coordination and distributed realtime socket connection caps need review before scale-out; cloud architecture remains deferred.
