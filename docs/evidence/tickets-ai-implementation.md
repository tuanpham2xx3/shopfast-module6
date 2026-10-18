# Tickets and Gemini implementation evidence — 2026-10-18

Scope: ticket lifecycle and messages, staff ownership/claim, ticket-scoped order lookup, actual Gemini REST adapter, bounded read tools, background classification, immutable human-confirmed category proposals.

## Executed checks

- `npx tsc --noEmit`: PASS (whole workspace at check time).
- Focused ESLint for tickets, AI, owned migration and focused tests: PASS.
- `npx jest --runInBand --testPathPattern=gemini-provider`: PASS, 4 tests. Explicit missing config, provider ignoring abort, circuit opening/half-open recovery, bounded transient retry.
- `npx jest --config jest.integration.config.js --runInBand --testPathPattern=tickets-ai`: PASS, 8 tests against native PostgreSQL using an isolated migrated schema, cleaned afterward. URL supplied from ignored runtime file without printing it.
- Integration scenarios cover both actual DB tools, customer-order isolation, grounded output, explicit staff approval before customer messages, concurrent claims, state transitions/reopen/closed messaging, immutable proposal payload, actor/version/expiry/rejection and repeated confirmation, turn dedup, role-injected arguments, bounded looping, assignment revocation, schema failure and low confidence review, HUMAN label preservation.

## Integration exports

- `TicketsModule` exports `TicketsRuntime`; `get()` resolves `{tickets, ai}`.
- Worker hook: `new AiService(new TicketsService(source, schema)).classify(ticketId, classificationVersion)`; outbox type `ticket.classify`, payload `{ticketId, classificationVersion}`.
- Migration: `TicketsAi1780000600000` in `1780000600000-tickets-ai.ts`; central registry is handled by integration owner.
- Production adapter `GoogleGeminiProvider` calls Gemini Developer API `v1beta/models/{GEMINI_MODEL}:generateContent` using backend `x-goog-api-key`. There is no production fake fallback.
- Official API reference inspected: https://ai.google.dev/gemini-api/docs/function-calling (2026-10-18). Model content including thought signatures is replayed; tool call IDs are returned with function responses when supplied.

## Grounding and failure behavior

Gemini selects allowlisted tools and returns structured claims. Backend rejects missing/unsupported current-turn evidence. As a conservative output policy, published order/inventory answers render templates from validated fresh DB tool results, never arbitrary provider prose. Unsupported prose cannot claim success merely by listing a genuine resource. Proposal-only answers use a server confirmation instruction; out-of-scope uses a fixed response. This preserves the evidence contract and intentionally limits freeform phrasing.

Provider deadlines: 12 seconds per call, 25 seconds per turn; provider ignoring AbortSignal still times out. Maximum four tool rounds/six tool calls; database tool transactions use a two-second statement timeout. Provider outage is explicit UNAVAILABLE. Circuit opens after five failed provider requests for 60 seconds. Context keeps at most twelve messages and 20,000 characters. Turn crash retries older than thirty seconds become a persisted UNAVAILABLE response instead of reissuing tools.

## Deferred acceptance

Real Gemini key/model smoke: NOT_RUN — user deferred external provider acceptance. No key was supplied or logged. Live model tool/schema compatibility, latency, quota behavior, and 30-ticket human-labeled classification accuracy remain unmeasured. These deterministic tests do not claim provider accuracy or production acceptance. Cloud deployment remains deferred.
