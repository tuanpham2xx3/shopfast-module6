# AI synthesis failure regression — 2026-11-02

Base: `fcc59ecdba353d9efd9929f3c49f74fdac7c0fed`.

Production reproduction: Gemini successfully called `check_inventory`, which
returned current DB inventory. The final Gemini response contained unquoted JSON
keys/values split across text parts. Parsing failed with `UNGROUNDED_OUTPUT` and
the application discarded the successful tool result.

The patch renders a fixed answer from current-turn validated evidence or a valid
pending proposal when final JSON/schema parsing or the final provider call fails.
It never publishes failed model prose, creates evidence from model assertions,
executes a proposal, or skips session/ownership checks. Initial provider failure
without evidence remains unavailable. Unsupported claims for an unread resource
remain rejected. Final synthesis uses one provider attempt to preserve deadline.

## Checks before commit

- New regression tests first failed on the existing implementation (2 failures).
- AI unit/deadline tests: 12/12 PASS after the patch.
- Native PostgreSQL ticket/AI integration: 11/11 PASS.
- Typecheck, API/worker/frontend builds, scoped ESLint and Prettier: PASS.
- Architecture checks: 8/8 PASS, 140 files, zero violations.
- Documentation link check: PASS.
- Isolated API process on the existing VPS, loading the candidate service while
  retaining the production Gemini adapter/key/model: real `check_inventory`
  succeeded, Gemini again returned malformed final JSON, patched HTTP path
  returned `OK` with one DB evidence item. This was an isolated pre-release
  probe, not a claim that the production API process was already updated.

Existing uncommitted AuthService relocation changes are excluded.
