# Live Gemini agent acceptance

Command: `npm run smoke:gemini-agent` with backend `.env` credentials and native PostgreSQL `TEST_DATABASE_URL`.

Result: **4/4 PASS**, six real Gemini 3.1 Flash Lite requests, minimum five seconds between request starts. Exact UTC execution time is in [machine-readable evidence](gemini-agent-live.json). This is a service/provider integration smoke, not HTTP/browser acceptance.

- Model selected `get_order_status` and `check_inventory`; facts matched synthetic PostgreSQL order CONFIRMED and seven available units.
- Model created a PAYMENT proposal; ticket category and customer messages remained unchanged before confirmation.
- Identical client message replay returned the stored response without calling Gemini again.
- Explicit staff confirmation set category PAYMENT with HUMAN source; repeated confirmation returned the same result.

Only synthetic ticket/order/product data were sent to Google. A temporary database schema was created and dropped in `finally`. Evidence excludes credentials, prompt bodies and raw provider responses. Failure writes partial checks and exits nonzero; smoke is opt-in and absent from CI. No automatic retry of failed full runs.

This supplements deterministic ownership/stale-proposal/injection tests; it does not establish exhaustive live adversarial robustness, production quota capacity or latency SLA.
