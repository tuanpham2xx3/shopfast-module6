# Gemini 3.1 Flash-Lite paced evaluation

User corrected selected model to `gemini-3.1-flash-lite` and clarified each model has an independent 15 RPM allowance. Local ignored `.env` now selects 3.1. The unfinished paced 3.5 evaluation was stopped; it is not claimed as completed.

The smoke runner spaces request start times by at least 5000ms (at most approximately 12/minute). HTTP 429 waits at least 60 seconds or the provider retry hint before retrying the same example, with at most three attempts. `GEMINI_SMOKE_RESUME=true` reuses valid results for the same model and retries missing results; errors retain HTTP status/error type without credentials.

The first complete paced 3.1 evaluation produced 18 valid correct labels and 12 schema errors. Subsequent diagnostics established the invalid field: `confidence` returned as a string rather than the numeric contract. The provider request now supplies responseSchema with numeric confidence, required category/confidence/reason and the category enum. Server validation remains strict. A regression verifies this outbound schema; all five provider unit tests passed, plus typecheck and focused ESLint.

Final resumed run retried the 12 missing examples after the schema correction and all twelve passed without a reported 429. Combined checkpoint: **30/30 valid correct labels, zero unavailable**. This is a cumulative resumed evaluation (18 previous +12 newly executed), not a fresh uninterrupted 30-request run after the fix. Raw sanitized results: `gemini-live-evaluation.json`. The dataset remains synthetic and not independently human-validated; real assistant tool-calling/proposal acceptance is separate.

The original 3.5 19/30 quota-limited report remains in commit `627f83f`; the shared latest JSON now describes 3.1. No API key was logged or committed. Official model reference: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite.
