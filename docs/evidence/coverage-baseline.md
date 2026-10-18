# Coverage baseline

Executed locally after `43149df` with the Gemini agent smoke tooling changes:

`node node_modules/jest/bin/jest.js --runInBand --coverage --coverageReporters=json-summary --coverageReporters=text-summary`

- 11 suites / 37 tests passed.
- Backend-wide line coverage: **35.90% (726/2022)**; statements 35.63%, branches 14.72%, functions 25.96%.
- This command excludes PostgreSQL integration tests and browser tests. It measures all API/worker/library TypeScript, including adapters/controllers, so it is not a dedicated business-only metric.
- Corrected the Jest collection glob to exclude Vite frontend TypeScript, which requires a different module transform. No backend source was excluded by this correction.
- The documented business unit coverage >=60% gate remains **NOT_MET / not yet demonstrated**. Do not report overall project acceptance from these results.

Raw coverage output stays in ignored `coverage/`; regenerate for the current commit before using it as final acceptance evidence.

## Combined business module coverage

Separate command after retention implementation:

`node node_modules/jest/bin/jest.js --config jest.business.config.js --runInBand --testPathIgnorePatterns=/node_modules/ /tests/e2e/ redis.integration.spec.ts`

Native PostgreSQL `TEST_DATABASE_URL` was supplied through the process environment. Result: **25 suites / 89 tests PASS**, lines **83.21% (1487/1787)**, statements 81.14%, branches 64.37%, functions 74.13%. Collection includes all `libs/modules/**/*.ts`, including HTTP and runtime adapters; these figures combine unit/contract/real PostgreSQL integration tests. Redis integration was explicitly excluded because no local service was available. Browser E2E separately passed **2/2**.

The first concurrent coverage/browser attempt failed from exhausted local PostgreSQL connection slots; the above sequential run passed without changing application limits or dropping an assertion. Run database-heavy suites sequentially on this development machine.

`npm run test:coverage` uses this same collection and a 60% line gate, but includes Redis integration by default; CI supplies PostgreSQL16/Redis7 services. CI now runs this combined command in place of the standalone integration command, preserving those integration cases. No current remote pipeline execution is claimed. This combined gate does not establish the separate unit-only >=60% requirement in docs08.

Other final checks: `npm run check` passed format/lint/typecheck, 38 tests and API/worker/web builds. `npm run docs:check --prefix tools` checked 35 Markdown documents with zero broken links.
