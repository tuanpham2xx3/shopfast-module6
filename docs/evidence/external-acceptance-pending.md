# Deferred live acceptance

User requested implementing all application features before configuring external services. This file is a reproducible acceptance queue, not a PASS report.

| Area                                                          | Status                        | Run when ready                                                                                                                                                                               |
| ------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Memurai / real Redis 7 queue/cache/Lua/pubsub          | NOT_RUN for completion branch | Set TEST_DATABASE_URL/TEST_REDIS_URL; `npm run test:integration`; run API + worker and browser flow with native service                                                                      |
| Gemini real project/model                                     | PARTIAL PASS                  | Classification 30/30 cumulative; real agent tools/proposal/confirmation 4/4 passed. See `gemini-31-paced-2026-10-19.md` and `gemini-agent-live.json`. Broader adversarial live cases remain. |
| Email provider delivery, timeout and crash-window idempotency | NOT_RUN                       | Configure HTTPS EMAIL_PROVIDER_URL/TOKEN honoring Idempotency-Key, stop worker after accepted send and restart; verify provider key lookup and single delivery                               |
| Performance thresholds / load dataset / coverage >=60%        | NOT_RUN                       | Use docs08 performance profile; record host specs, workload, p95/hit-rate/realtime latency and coverage before final defense                                                                 |
| VPS/Docker/AWS, HTTPS, backup/restore/deploy                  | DEFERRED                      | User has postponed infrastructure; no cloud resources created                                                                                                                                |

Local deterministic tests include native PostgreSQL transactions, cache Redis-protocol double, provider doubles, real Socket.IO ownership and browser API/UI flows. These do not establish live provider compatibility or performance acceptance.

`npm run smoke:gemini` contains 30 synthetic Vietnamese tickets, five per category. Labels are an initial reviewable evaluation fixture, not a claim of independently human-validated labels or measured accuracy. It writes only model/results/confusion matrix; never keys. The command is opt-in and absent from default CI.
