# Tool-first assistant regression — 2026-11-02

Base: `c59b07aa3137fb49a98802272632fa2bba93976f`.

## Previous release findings retained

[PR 24](https://github.com/tuanpham2xx3/shopfast-module6/pull/24) and its
[release](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41382543929)
passed. `c59b07a` was deployed with application digest
`sha256:3b75efb011efe36536eaf78a6af12336ba6ab752c3f0db40a3be49404fb1aa44`.
Readiness, products and three demo role logins passed. A real browser inventory
lookup passed ([screenshot](2026-11-02-ai-panel-c59b07a.png)).

Repeated HTTP testing was **not fully successful**: the first sequence passed
once and then returned UNAVAILABLE; a second sequence passed twice and failed on
the third turn. Direct probes succeeded but do not override those failed HTTP
receipts. The synthesis fallback alone was insufficient for acceptance.

## Candidate behavior

Assistant requests require a function decision (`ANY`). The allowlist adds
`request_more_information` and `respond_out_of_scope`, which return fixed server
messages and never modify the ticket. A vague request or an unavailable reference
returns NEEDS_INPUT, displayed as “Cần thêm thông tin”.

Successful DB reads/proposals return server-owned results immediately after
processing that round's tools. No final model synthesis request is made. All
ownership/session/schema checks and human confirmation remain. Failed or
unauthorized reads never become evidence; historical facts are not reused as
current inventory/order data.

## Checks before commit

- AI service/provider/deadline unit tests: 21/21 PASS.
- Native PostgreSQL ticket/AI integration: 12/12 PASS.
- Typecheck, API/worker/frontend build, scoped ESLint: PASS.
- Architecture: 8/8 PASS; 140 files, zero violations.
- Documentation links: PASS.
- Real Gemini in an isolated candidate API process on the VPS: “hỗ trợ tôi”
  selected request_more_information and returned NEEDS_INPUT; inventory returned
  OK with DB evidence after one provider call; an unrelated poetry request
  selected respond_out_of_scope and returned OUT_OF_SCOPE.

These isolated probes do not claim production was already updated. Release
acceptance requires repeated HTTP and browser checks after deployment.
