# Module layout validation — 28/10/2026

Scope:23feature source files moved into per-module `src`; worker orchestration moved from platform to the worker application. Static TypeScript imports and three compiled CommonJS harness imports updated. Public contracts and schema unchanged. Historical evidence bundles untouched.

Executed on the refactoring worktree:

- `npm run check`: PASS; format, architecture, lint, typecheck,68tests/17suites, API/worker/web build.
- `npm run test:integration`: first run FAIL because SSH Redis tunnel was down (5Redis tests failed). Reconnected the existing EC2 tunnel and reran unchanged tests:69tests/16suites PASS. No Redis assertion removed or weakened.
- `npm run test:e2e` with native PostgreSQL and Linux Redis through the tunnel:3/3PASS, including real browser purchase, four role actions, network offline/recovery and socket resubscription;1.4minutes.
- `npm run harness:selftest`:17/17PASS.
- `npm run harness:check`:format PASS,34source files parsed.
- `npm run docs:check --prefix tools`:50files,0broken links.
- `npm run format:check --prefix tools`:PASS.

The first unit invocation accidentally crawled the ignored CI fixture worktree inside `.secrets`, causing its intentional negative test to fail and duplicate68tests. Added Jest module path exclusions for `.secrets` and tool reference repositories. The subsequent normal suite executed only the real68tests and passed. This preserves the negative fixture without letting it contaminate product testing.

These are development validation results; fresh CI/image/runtime checks are required for the refactored release. No cloud acceptance or111-item aggregate PASS is asserted here.
