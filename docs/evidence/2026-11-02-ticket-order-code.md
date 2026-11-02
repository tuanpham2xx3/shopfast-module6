# Ticket linked order code — 2026-11-02

Ticket detail now returns `orderCode` after existing ticket authorization. The
lookup is constrained by both linked order UUID and ticket customer ID. Only the
code is added to the response; no order mutation or additional order permissions.
The UI displays it below the ticket body, including in the support desk. Missing
links and unavailable codes have distinct messages; ticket text is never parsed
to invent a link.

Executed locally: PostgreSQL HTTP contract 3/3, browser ticket cases 3/3,
TypeScript and scoped ESLint passed. New HTTP assertions failed first because
orderCode was missing, then passed after implementation. The first attempt could
not connect to stopped native PostgreSQL; it was started without Docker/WSL.
Browser cases verify both the linked code and the no-link message.

## Production

[PR #29](https://github.com/tuanpham2xx3/shopfast-module6/pull/29) merged after
[Application](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41426967082)
and Docs checks passed. Release SHA `469dede46f3f97c0698a23ce395e40d94cbd8822`,
app image ID `sha256:9b24c048e25bc3ff525f5537d19391fbc624b2022eced6dc8e2d503951589d2c`,
promotion duration 19 seconds; previous release `6e305cb` retained.

A real Chromium admin session opened the support desk and verified the API code
`SF202610287D9B1302` rendered below the ticket body. A separate unlinked ticket
showed “Chưa liên kết đơn hàng”. No records were mutated by this acceptance run.
[Screenshot](2026-11-02-support-order-code.png).
The first browser verifier matched the HTML navigation response instead of the
API response; its URL matcher was corrected and the rerun passed, without any
application change. This validates the support desk through ADMIN; SUPPORT uses
the same view but its existing assignment authorization remains enforced.
