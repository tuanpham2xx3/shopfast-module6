# Vietnamese order answer wording — 2026-11-02

The assistant's server-rendered order answer now maps order/payment states to
Vietnamese sentences, for example “Đơn SF… đã giao hàng và đã thanh toán.”
It omits internal version numbers and English enum values from answer/draft text.
Technical evidence retains the unchanged DB status/payment/version for auditing.

Checks before commit:

- AI service unit tests: 18/18 PASS, including delivered/paid, shipping/paid,
  pending/unpaid and cancelled/refunded wording cases.
- Native PostgreSQL ticket/AI integration: 12/12 PASS; checks Vietnamese text
  while retaining original evidence states.
- Typecheck, API build and scoped ESLint: PASS.
- Repository source format check: PASS.

This source change follows the demo fixture repair on the same branch. Existing
uncommitted AuthService relocation changes are excluded. Production wording
requires release and fresh-turn validation; historical stored answers are not
rewritten by this patch.
