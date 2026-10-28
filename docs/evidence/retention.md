# Retention verification

Implementation: `RetentionService`, worker scheduling, migration `1780000700000-retention-indexes`. Policy and limits: docs04 section4.3, decision D22.

PostgreSQL integration regression: `tests/integration/retention.integration.spec.ts`.

- Batch bound, active idempotency retention and concurrent-cleaner advisory lock.
- Old unapproved turn deletion, approved turn redaction, preserved customer message/FK and repeat-run stability.
- Succeeded-job payload compaction without deleting its replay tombstone; pending/failed jobs and active lockout retained.
- Concurrent human approval: a trigger pauses insertion after draft validation. Cleanup must skip the locked turn; approval succeeds and later cleanup redacts its private prompt/draft.

The concurrent approval test first failed with a real FK violation, then passed after `FOR UPDATE OF x` in approval validation. The scheduler unit regression first failed because cleanup blocked the tick, then passed with independent cleanup scheduling and overlap protection. Final focused results: **4/4 PostgreSQL tests and 1/1 scheduler unit test passed**.

Migration indexes are exercised by creation on empty isolated schemas; migration contract also verifies rerun. Cleanup has only been executed against synthetic test schemas. No existing application/customer history was purged during this task. Backlog throughput and large-table index migration duration have not been load-tested; archive of outbox/failed-job history remains deferred.
