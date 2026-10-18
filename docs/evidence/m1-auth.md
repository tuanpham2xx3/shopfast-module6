# M1 Auth acceptance evidence

Date: 2026-10-18  
Branch: `feat/m1-auth`

## Automated checks

| Scope | Command | Result |
| --- | --- | --- |
| Auth service and HTTP | `jest --config jest.integration.config.js --runInBand --runTestsByPath tests/integration/auth.integration.spec.ts tests/integration/auth-http.integration.spec.ts` | PASS, 6 tests |
| PostgreSQL integrations | `jest --config jest.integration.config.js --runInBand --runTestsByPath tests/integration/database.integration.spec.ts tests/integration/outbox.integration.spec.ts tests/integration/auth.integration.spec.ts tests/integration/auth-http.integration.spec.ts` | PASS, 10 tests |
| Auth guards | `jest --runInBand --runTestsByPath tests/unit/auth-guards.spec.ts` | PASS, 3 tests |
| Browser auth flow | `npm run test:e2e` | PASS, Chromium register → verify → account |
| Web production build | `npm run build:web` | PASS |

`npm run check` passed locally: formatting, lint, typecheck, 16 Jest tests, and all three production builds. GitHub Actions also installs Chromium and runs `test:e2e` on the pull request.

The complete local `npm run test:integration` additionally requires Redis/Memurai and was not marked passing in this run because the native Redis-compatible service is intentionally unavailable on this machine. The same Redis 7 integration suite passed in GitHub Actions for M0 and remains in CI for this branch.

## Real local integration walkthrough

Environment: PostgreSQL 16.15 native on `127.0.0.1:55432`, Nest API on `127.0.0.1:3000`, Vite UI on `127.0.0.1:5173`; Docker and WSL were not used.

1. Registered a new customer through the browser.
2. Confirmed that the UI moved directly to email verification with its limited access token.
3. Read the synthetic OTP from the transactional outbox, representing the fake email adapter used in development.
4. Submitted the OTP in the browser and reached the verified account view.

Evidence:

- `m1-auth-ui-desktop.png`: accessible registration form at desktop width.
- `m1-auth-ui-verified.png`: verified account after the real browser/API/database flow.

## Acceptance mapping

| Case | Status | Evidence |
| --- | --- | --- |
| AUTH-01 | PASS | integration test normalizes email, hashes password and forces CUSTOMER |
| AUTH-01A | PASS | browser walkthrough and auth HTTP integration complete register → OTP without another login |
| AUTH-02 OTP attempts | PASS | service integration validates one-time code, resend invalidation and attempt ceiling |
| AUTH-02 protected modules | PARTIAL | verified guard is implemented and tested; checkout itself belongs to M4 |
| AUTH-03 | PASS | integration test proves rotated-token reuse revokes the active family |
| AUTH-04 | PARTIAL | access/verified/role guards return 401/403 in unit tests; private-resource ownership is exercised in later business modules |

Tokens and OTPs are absent from API responses and screenshots. Cloud deployment remains deferred by project decision.
