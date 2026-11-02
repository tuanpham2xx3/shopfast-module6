# Tool-first assistant production acceptance — 2026-11-02

Production commit: `f118ed9c8f4a1f8f061b6c7ecf0281e3c9835818`.
Application digest:
`sha256:9da3cff44ef4841d20767140260f8fc3f5e3734c882632c47d9321b23ad82232`.
Host: `15.135.168.32`; URL: <https://shopfast.tuanpq.com>.

- [PR 25](https://github.com/tuanpham2xx3/shopfast-module6/pull/25): merged after checks passed.
- [PR Application CI](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41384071274): PASS; 77 unit/contract tests, 149 combined unit/integration tests, 19 browser cases, Linux image builds.
- [PR Docs CI](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41384071182): PASS.
- [Release](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41384511064): PASS, promotion 19 seconds. Previous release `c59b07aa3137fb49a98802272632fa2bba93976f` retained.
- [Main Application rerun](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41384511051): separate from the completed PR validation; consult the run for its latest status.
- Pre-release backup uploaded: `shopfast-20261102T033437Z.dump`.
- Exact merged source selected on the host. API/worker running; PostgreSQL and Redis healthy. No local Docker/WSL used.

## Real HTTP acceptance after promotion

One real Gemini session, six new message IDs, no fake provider:

| Case                                         | HTTP | Assistant status | Evidence                          |
| -------------------------------------------- | ---- | ---------------- | --------------------------------- |
| Natural-language inventory lookup SF-AUDIO-1 | 200  | OK               | One current inventory result      |
| Ask again how much stock remains             | 200  | OK               | One current inventory result      |
| Request fresh stock again                    | 200  | OK               | One current inventory result      |
| “hỗ trợ tôi”                                 | 200  | NEEDS_INPUT      | None; asks for the task/reference |
| Nonexistent SKU SF-NOT-EXIST-99999           | 200  | NEEDS_INPUT      | None; no invented stock           |
| Unrelated poetry request                     | 200  | OUT_OF_SCOPE     | None                              |

All six passed. Each inventory answer was checked against its returned DB
evidence value. Calls were paced six seconds apart to respect the configured
Gemini quota. HTTPS frontend, readiness and catalog also returned 200; Warehouse,
Support and Admin demo logins returned 200.

## Real browser acceptance

Headless Chromium logged into production, opened an assigned ticket, sent
“hỗ trợ tôi” and verified NEEDS_INPUT rendered as “Cần thêm thông tin”. In the
same browser assistant session it then asked naturally for stock, received OK
with inventory evidence, and displayed the server-owned result.

- [Vague request screenshot](2026-11-02-ai-help-panel.png).
- [Inventory screenshot](2026-11-02-ai-panel.png).

An additional deterministic regression inside the exact deployed image verified
same-category proposals insert nothing, leave the ticket unchanged, and replay
the stored turn without a second provider call. That check used a fake provider
and is distinct from the real Gemini HTTP/browser checks above.

Earlier failed releases/repeated-turn checks remain documented in
[the regression history](2026-11-02-ai-tool-first.md). These results cover the
listed scenarios, not a guarantee of future third-party API availability.
