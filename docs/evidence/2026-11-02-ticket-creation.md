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
native PostgreSQL schema, dropped afterward. No production creation/acceptance is
claimed here; that must be checked after deployment.

## Separate finding

The existing frontend route allows WAREHOUSE to open `/tickets`, while the
customer ticket controller permits CUSTOMER only. This adjacent role-policy
mismatch can produce 403, not the reported 401/400; it was not changed in this
patch. Existing uncommitted AuthService relocation files were not edited.
