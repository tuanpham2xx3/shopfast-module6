export async function fetchRespectingRateLimit(
  operation,
  {
    attempts = 3,
    maxWaitMs = 120000,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onWait = () => {},
  } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await operation();
    if (response.status !== 429 || attempt === attempts - 1) return response;
    const seconds = Number(response.headers.get("retry-after"));
    const delay =
      (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60000) + 100;
    if (delay > maxWaitMs) {
      await response.body?.cancel();
      throw new Error(
        "Retry-After exceeds harness wait limit; stop without bypassing rate protection",
      );
    }
    await response.body?.cancel();
    onWait(delay);
    await wait(delay);
  }
  throw new Error("At least one HTTP attempt is required");
}
