# Gemini live smoke — 2026-10-19 Asia/Bangkok

User selected `gemini-3.5-flash-lite`. Updated the ignored local `.env` model setting and used the existing backend API key without printing it. Official model reference: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite.

Executed `npm run smoke:gemini` against 30 synthetic Vietnamese classification examples. Results: 19 valid responses, all 19 matched their expected label; 11 UNAVAILABLE responses. The script's all-sample accuracy is 19/30 (63.3%), below the 80% gate, so the run is FAIL/incomplete acceptance. Do not interpret missing responses as incorrect classifications or claim 100% dataset accuracy.

A subsequent minimal generateContent probe returned HTTP 429 / RESOURCE_EXHAUSTED. The classification script does not persist per-example HTTP status, so this probe establishes current quota/rate exhaustion, not the exact cause of each of the 11 missing responses.

Raw sanitized results: `gemini-live-evaluation.json`. No credentials or user conversation were written. Repeat the evaluation after the project's rate/quota limit permits it. Real assistant tool calling, proposal flow with Gemini, and remaining provider acceptance are not established by this classification smoke.
