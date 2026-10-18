# Coverage baseline

Executed locally after `43149df` with the Gemini agent smoke tooling changes:

`node node_modules/jest/bin/jest.js --runInBand --coverage --coverageReporters=json-summary --coverageReporters=text-summary`

- 11 suites / 37 tests passed.
- Backend-wide line coverage: **35.90% (726/2022)**; statements 35.63%, branches 14.72%, functions 25.96%.
- This command excludes PostgreSQL integration tests and browser tests. It measures all API/worker/library TypeScript, including adapters/controllers, so it is not a dedicated business-only metric.
- Corrected the Jest collection glob to exclude Vite frontend TypeScript, which requires a different module transform. No backend source was excluded by this correction.
- The documented business unit coverage >=60% gate remains **NOT_MET / not yet demonstrated**. Do not report overall project acceptance from these results.

Raw coverage output stays in ignored `coverage/`; regenerate for the current commit before using it as final acceptance evidence.
