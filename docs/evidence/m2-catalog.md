# M2 catalog and inventory evidence

Date: 2026-10-18. Branch: `feat/m2-catalog`.

Implemented public category/brand/product lists, AND filters, stable sorting and pagination, product detail, guarded admin creation/update, warehouse inventory/movements and versioned stock adjustments. Inventory changes use transactional row locks, actor-scoped idempotency keys with payload hashes, persisted replay responses and movement history. Stock constraints protect reserved units. SKU is immutable through the update API.

## Executed verification

- Catalog service integration: 3 tests passed, including concurrent stale-version adjustment, identical replay, changed-payload conflict, negative-stock rollback, initial zero stock and inactive parent visibility.
- Catalog HTTP plus migration integration: 5 tests passed. Real HTTP validates guest 401, unverified and customer 403, admin product creation, required idempotency key, stock visibility, invalid filters and immutable SKU.
- `npm run test:e2e` with `TEST_DATABASE_URL`: 2 Chromium tests passed. The live test uses the built Nest API, an isolated PostgreSQL schema and the real React UI: register → verify from synthetic outbox → reload session → catalog → warehouse adjustment → visible updated availability. At 390px width no horizontal overflow was detected. Only the separate auth UI test mocks HTTP.
- Native `npm run db:migrate`: applied security-counter and catalog migrations. `npm run db:seed` ran twice successfully without duplicate products or stock.

Browser tests start a dedicated API on 4300 and Vite on 4173. Build API before running them. Set `TEST_DATABASE_URL` to the disposable test database; schemas are unique per run and removed afterward. No Docker/WSL was used.

## Development data

Set `DEV_SEED_PASSWORD` to a local password of 10–128 characters before `npm run db:seed`. Accounts: `customer@shopfast.test`, `warehouse@shopfast.test`, `support@shopfast.test`, `admin@shopfast.test`. The seed only creates missing accounts and does not reset existing passwords. Three synthetic audio products receive initial stock through the audited adjustment service. The password is not stored in source or printed.

## Remaining scope

M2 has a basic catalog and warehouse UI. Admin product/category/brand operations currently have HTTP APIs; the admin editor UI remains pending. Cache invalidation belongs to M5 and is not claimed here. Full project acceptance and Gemini/provider smoke remain pending.
