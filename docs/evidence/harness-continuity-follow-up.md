# Continuity harness follow-up — 28/10/2026

Baseline release: `f8d169625a2820f54cdc6214f76dbd9dec7e1f17`, PR7 merged and deployed. Full run completed with49/49docs08cases PASS and8technical profiles PASS. Overall result was FAIL/BLOCKED: active-session rehearsal first failed during login without recording its HTTP status, and cloud/handover gates remained unverified.

A separate rehearsal on the old observer recorded57HTTPreads with zero failures, successful promotion/rollback/restoration, but one generic `subscribe timeout`. The old observer did not retain socket identity or distinguish a connected timeout from an acknowledgement interrupted by disconnect/cleanup; the recorded data cannot prove which occurred. Do not retrospectively label that failure as429or harmless cleanup.

## Corrective changes and validation

- HTTP login handles429using Retry-After with bounded attempts/wait;401is not retried; network failures are not hidden by retries. Failed login now records the HTTP status.
- Subscription observer records each socket ID, outcome and error. Denial and an acknowledgement timeout on the current connected socket remain fatal. Disconnected old attempts are retained separately; a new connection must receive a fresh ACK.
- Rehearsal waits for the restored subscription and actual browser order/tracking state before cleanup. HTTP read assertions still allow zero failures; no read retries were added.
- Real local HTTP server and real Socket.IO transport tests reproduce429, disconnect during pending ACK, connected ACK timeout and authorization denial.17harness self-tests PASS.
- Development live run with the corrected observer:57reads,3successful subscriptions, no errors, promotion/rollback PASS and original release restored. Source was dirty during development, so this is scoped validation, not a clean-commit acceptance receipt.
- Fixed partner-demo collector matching: short selector text previously did not include the complete partner test title. Match the actual Jest full test name; no product code or partner behavior changed. PostgreSQL collector rerun passed137tests; partner demo receipt PASS in development, external cases stay BLOCKED until their collectors execute.
- Browser collector rejects a stale Playwright JSON file, and CI discovers all harness `.test.mjs` files automatically.

No backend contract/data model changed. Final acceptance must retain original failed runs and collect fresh receipts for the committed harness; this document does not announce all SRS PASS.

## Clean-source execution

Fresh receipt on clean source `d208339b498c1faa0b7c3406b8c1f48efdc9abd1` completed at `2026-10-28T12:54:49.662Z`: [manifest and original report](runs/71439da4c76d69db/manifest.json). Both start and final source checks were clean. Target release was `9b7b96f3503b022e924a26a96f9abcf1d9403ea2`; fixture candidate was `edd1fe6f814925636be5c561de8809ea7f0f68be`.

Result PASS:57authenticated HTTP reads,3successful private socket subscriptions, zero recorded errors, healthy promotion followed by injected post-promotion health rejection and rollback in5seconds. Finally restored the original9b7b96frelease; an independent SSH read of `release.json` confirmed it. Artifact content was reviewed and exported with its SHA256. The earlier dirty-source runs remain development evidence and are not relabeled. This closes the scoped active-session rehearsal, not host HA or all SRS requirements.
