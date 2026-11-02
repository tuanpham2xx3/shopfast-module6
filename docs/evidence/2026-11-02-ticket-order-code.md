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

Production rollout remains pending in this receipt; local checks are not a live
acceptance claim.
