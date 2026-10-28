# AWS delivery execution ledger

28/10/2026, branch `feat/aws-delivery`. Work in progress; full acceptance not complete.

## Latest execution update

- User upgraded account; AWS API reported PAID/ACTIVE with179.72USD credit before advanced-feature transition. OIDC read permission subsequently became available, and IAM-only provisioning created the restricted GitHub role/document. EC2 is SSM Online. Old SCP blocker below is historical. Free Tier balance API later returned missing account data after transition; do not treat the previous balance as a current hard spending cap.
- PR2 created with authorized push. Main now protected by required application-checks/docs-checks, admins enforced, force-push/deletion disabled. Production environment permits protected branches only. Application/docs CI passed at `c1c8ba4`; later changes require fresh checks before merge.
- Real staging8checks PASS: secure cookie, worker/Resend OTP and verify, idempotent checkout, warehouse lifecycle/private sockets, real PDF download, ticket claim/reply, customer forbidden admin, HTTPS mobile no overflow. Test fixture email only configured inbox alias; no third-party recipients.
- Standalone unit/contract business-module coverage60.06% (1119/1863 lines),17suites68tests PASS; independent of PostgreSQL integrations. Meaningful auth/refresh/OTP, ticket authorization/state, AI grounding/proposal/classification and stock/pagination decisions added. Threshold remains60% and now included in CI.
- Hot-key regression RED:10DBloads for10concurrent misses. GREEN:1DBload,9waiters read published cache; bounded100ms polling then protected DB fallback. Existing invalidation race/outage tests still pass.
- First full load profile on200kcustomer/10kproduct/100korder fixture **FAIL**: catalog p95~404ms, checkout p95~255ms, second-read p95~15.6ms, realtime max14ms, cache hit~93%,6000rate-limited requests. Workload violated existing10checkout/min/account; retry uses6.5s pacing while keeping10VUs, does not weaken limiter. Cache stampede bug fixed and full rerun is in progress; do not claim latency PASS from first run.
- Process crash/restart harness4checks PASS using deterministic DB-backed test sink, not live Resend: SIGKILL after accepted side effect, expired lease, restarted process, one delivery/twoattempts. Backup/restore rerun still4seconds PASS; backups now exclude test/harness schemas.
- Branded email mobile preview inspected at390px with no overflow. Preview is browser rendering; it does not certify every mail client.
- Secondary Gemini key smoke HTTP200/schemaPASS with one classification. Key1 remains active; no key switch or quota-capacity claim.
- Release/rollback scripts and workflow written, Linux build/real registry promotion/rehearsal pending. Unimplemented or unrun gates remain non-PASS.

- User authorized push/PR/merge after CI/deploy and existing Gemini key on EC2. Credit-only budget; AWS Free Tier API confirmed FREE/ACTIVE,179.88USD remaining, expiry26/04/2027. No extra instance/RDS/ALB/NAT created.
- Resend domain verified. Added branded HTML/plain-text templates and durable Resend receipt table. Provider replay uses persisted immutable body; successful response stores message ID and clears body; retry after23h refuses manual/automatic blind resend. Live branded synthetic order email accepted, replay sameID; inbox appearance not yet confirmed.
- Linux image built successfully on EC2;9migrations applied; non-superuser `shopfast_app` created with DML grants; seed synthetic accounts stored credentials ignored. API/worker run production mode. Secrets transferred over SCP, no token/private key committed.
- First HTTPS deploy serves `shopfast.tuanpq.com`; live endpoint PASS and HTTP→HTTPS redirect PASS. Certbot webroot reconfiguration/dry-run simulation succeeded; need add post-renew Nginx reload hook. Public app is not final acceptance release.
- PostgreSQL/Redis loopback listeners; app containers private; named volumes. Partner sync production remains unavailable on initial image; explicit versioned demo mode change is pending rebuilt release and is not a real external partner integration.
- Local `npm run check`: formatting/lint/typecheck,41tests, API/worker/web builds passed. PostgreSQL originally at5432 after restart vs expected55432; tests supplied corrected runtime URL without logging credentials.
- Combined coverage with native PostgreSQL16.15 and SSH-tunneled real Redis7.4.8 on EC2:28suites/96tests PASS; lines83.39%, statements81.32%, branches63.93%, functions74.60%. Redis tests use random keys/queues and DB15; no production flush.
- Harness core selftests3/3 PASS. Preflight6/6 PASS. Runner profiles not yet fully implemented explicitly return BLOCKED for missing acceptance; no stub is counted as PASS. Unit-only60% remains unverified.
- Created S3 private/encrypted/versioned backup bucket with30day lifecycle, instance role scoped backup prefix plus SSM core. Daily systemd backup enabled. Actual pg_dump upload and isolated S3 download/restore/checksum/counts/inventory invariants PASS in4seconds; no live DB overwritten.
- **BLOCKER:** IAM `ListOpenIDConnectProviders` denied by Organizations SCP despite AccountFullAccessRole. Did not bypass with permanent keys/public SSH/self-hosted runner. GitHub→AWS OIDC deploy gate blocked until account policy supports it; user asked to inspect advanced feature conditions without upgrading.

Remaining: merge/remote CI, production email worker flow, least privilege migration refinement, CI image digest/release switch/rollback automation, all harness profiles, load dataset/latency, unit-only coverage, final role browser/realtime/AI target acceptance, S3 restore smoke beyond counts and final report. Existing evidence is scoped to commands actually executed.
