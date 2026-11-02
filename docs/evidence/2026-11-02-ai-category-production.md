# AI category fix production deployment — 2026-11-02

Deployed commit: `fcc59ecdba353d9efd9929f3c49f74fdac7c0fed`.
Application image digest:
`sha256:698b9b6e140eae27d4a7cb8706bb66035b82742292f53c2d019bb31f10605d12`.
Previous release: `ffcb599805ce937654ef22958f392fd74e11ba55`.
Host: `15.135.168.32`; URL: <https://shopfast.tuanpq.com>.

## Release evidence

- [PR 23](https://github.com/tuanpham2xx3/shopfast-module6/pull/23): merged after checks passed.
- [PR Application CI](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41379429200): PASS, 140 combined unit/integration tests and 19 browser cases.
- [Main Application CI](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41380035937): PASS.
- [Main Docs CI](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41380036078): PASS.
- [Release](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41380036014): image publish and OIDC/SSM deployment PASS.
- Host release receipt: promotion took 18 seconds; current release symlink and API/worker images match the deployed commit/digest.
- Pre-deploy DB backup uploaded to the existing S3 backup bucket: `shopfast-20261102T024635Z.dump`.
- Installed release, migration, seed and restore helpers updated for compiled `BE` paths; exact merged source extracted separately and selected on the host. Previous source and release scripts retained.

## Production checks

- HTTPS frontend, API readiness and products: HTTP 200.
- Warehouse, Support and Admin demo logins: HTTP 200.
- API and worker containers running; PostgreSQL and Redis healthy.
- Deterministic provider regression executed inside the exact deployed image against an active demo session: PASS. Same-category tool call returned `OK`, no proposal, no ticket mutation, one provider call; replay returned the stored turn.
- This deterministic regression is not a real-model assertion. It writes a synthetic AI turn to the demo session and does not change the ticket.

## Observed failures and remaining limitation

Real Gemini HTTP inventory lookup returned `UNAVAILABLE` twice after deployment.
An isolated API process using the same deployed code traced a successful inventory
tool followed by malformed JSON from Gemini; output validation correctly refused
the response (`UNGROUNDED_OUTPUT`). A direct service probe returned `OK` with one
inventory evidence item, but this does not make the failed HTTP acceptance PASS.

A temporary isolated-process structured-output experiment did not validate
reliably (tool loop limit and provider timeout); it was not deployed or committed.
The production release keeps the existing grounding checks. AI HTTP reliability
remains unresolved; this receipt proves deployment and the category no-op fix,
not complete AI acceptance.

Repeated login checks also reached the configured five-per-minute login IP limit
(429); subsequent checks after the window reset passed. No rate limit was disabled.

Existing uncommitted AuthService relocation changes remain local and were not
included in the deployed image. No local Docker Desktop/WSL was used.
