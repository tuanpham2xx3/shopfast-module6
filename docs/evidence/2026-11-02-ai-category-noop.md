# AI category no-op regression — 2026-11-02

Base: `211b108`, branch `refactor/be-fe-layout`. Checks ran against the working
tree, including existing AuthService relocation changes excluded from this task.

The category proposal tool now compares the target with the locked ticket.
Same-category calls return `UNCHANGED` without inserting a proposal or changing
ticket version/classification source. A proposal-only no-op turn returns a
server-generated explanation and `proposal=null`, without publishing model prose
as an order fact. Legacy pending no-op proposals cannot be confirmed:
`CATEGORY_UNCHANGED` (409). Executed proposal replay remains idempotent.
The frontend hides legacy same-category cards and labels model reasons as
requiring review.

## Verification

- `npx jest --runInBand BE/tests/unit/ai-service.spec.ts`: 8/8 PASS.
- `npx jest --config jest.integration.config.js --runInBand BE/tests/integration/tickets-ai.integration.spec.ts`: 10/10 PASS against native PostgreSQL.
- `npm run typecheck`: PASS.
- `npm run build`: API, worker, frontend PASS.
- ESLint on the five modified TypeScript/TSX files: PASS.
- Prettier check on the five modified TypeScript/TSX files: PASS.
- `npm run architecture:check`: 8/8 checks PASS; 140 files, zero violations.

Regression cases verify no proposal insertion, no ticket mutation, idempotent
turn replay, no second provider request for a proposal-only no-op, refusal to
confirm legacy redundant proposals, and the existing genuine category-change
confirmation/ownership/version/expiry paths.

No browser end-to-end run, live Gemini acceptance, push, or deployment was
performed for this patch. Production remains on its previously deployed release.
