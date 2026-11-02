# Ticket creation form and HTTP regression — 2026-11-02

## Reproduced contract mismatch

The customer form exposed a free-text “ID đơn liên quan” field while the API
requires an internal UUID. Entering the visible order code (SF…) reproduces HTTP
400; an owned UUID succeeds. The original reported request body was not captured,
so this is a verified reproduction of the form/API failure path, not a claim to
have recovered the user's exact input. The form already omitted an empty value.

The updated form lists up to 100 recent orders of the authenticated customer,
shows their order codes/statuses and submits the selected UUID. The optional
reference is omitted when no order is selected. Title/body are trimmed and
validated with Vietnamese messages before POST; invalid input is preserved.
If the optional order list cannot load, a clear message explains that the user
may still create a ticket without linking an order.

No API auth/ownership/UUID validation was weakened. A first guest refresh 401 or
an expired access token 401 is not itself proof that authenticated ticket creation
failed: the client already renews once and retries with the new token. The new
browser test verifies this recovery path for the create request.

## Executed checks

- `npx playwright test BE/tests/e2e/ticket-creation.e2e.spec.ts`: 3/3 PASS. Cases:
  unlinked create with trimmed fields; owned-order selection plus create 401 →
  refresh → successful retry with identical payload/new bearer; whitespace-only
  input blocked before POST.
- Native PostgreSQL `tickets-http.integration.spec.ts`: 3/3 PASS. No session
  returns 401 without a ticket; order code as UUID returns 400; own UUID returns
  201; omitted optional link returns 201; blank UUID returns 400; foreign order
  UUID returns 404 without disclosing ownership or creating a ticket.
- The initial HTTP suite failed because its setup used an invalid empty Redis
  URL. Setup was corrected to omit the optional setting; application validation
  was not relaxed.
- Frontend build and scoped ESLint: PASS.
- Existing route suite plus new ticket cases: 12/12 browser cases PASS;
  scoped source format check and documentation links also PASS.

Browser regression uses routed API fixtures; HTTP contract checks use an isolated
native PostgreSQL schema, dropped afterward. These local checks do not constitute
production acceptance; the separate post-deployment run is recorded below.

## Production verification — 2026-11-02 16:30 ICT

The older production release `378b747` was still serving the free-text order
field when the user reported the persistent failure. A fresh authenticated API
reproduction with the visible SF order code in `orderId` returned HTTP 400
`BAD_REQUEST`. This identifies a reproducible failure path, not the user's exact
unrecorded request.

[PR #27](https://github.com/tuanpham2xx3/shopfast-module6/pull/27) passed
[Application CI](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41419848794)
and Docs checks before merge. Production release
`d4bb8f8fb7d42cc6ffda846c8b5cb2b620e9cf24` was deployed by
[Release](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41420794751).
Its app image ID is
`sha256:73234d860b92050a798087c8ebbac254880df6444e49581b9773908e8452680c`.
CI log totals: **81 unit/contract**, **156 combined unit/integration** and
**22 browser** cases passed; Linux runtime/web image builds also passed.

A real Chromium session on `https://shopfast.tuanpq.com` logged in as the existing
verified synthetic CUSTOMER, selected its own order by displayed code, submitted
its UUID and received HTTP **201 Created**. The ticket detail heading rendered
successfully. Synthetic ticket ID: `aa920ea7-c58e-4135-b21d-6f121b12efe9`.
The request was explicitly labeled a test and did not modify a real customer's
ticket. [Production screenshot](2026-11-02-ticket-production.png).

This validates linked-order ticket creation for that deployed SHA. No claim is
made that arbitrary invalid requests should return 201 or that the adjacent
WAREHOUSE route mismatch was fixed.

After the separate catalog-image release `6e305cb5602637f3a8dd854f45aa997ebe30de7a`,
a second real Chromium check at 16:38 ICT created an **unlinked** synthetic
customer ticket `47da5e83-e41c-4ed8-bf52-76525e6c6792`: the POST omitted orderId,
returned **201**, and rendered the ticket detail. Both optional-link paths have
therefore been exercised against production, on their explicitly recorded SHAs.

## Separate finding

The existing frontend route allows WAREHOUSE to open `/tickets`, while the
customer ticket controller permits CUSTOMER only. This adjacent role-policy
mismatch can produce 403, not the reported 401/400; it was not changed in this
patch. Existing uncommitted AuthService relocation files were not edited.
