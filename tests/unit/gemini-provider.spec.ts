import {
  BoundedProvider,
  GoogleGeminiProvider,
  ProviderError,
} from "../../libs/modules/ai/gemini.provider";
describe("Gemini provider boundaries", () => {
  it("declares numeric confidence in the provider classification schema", async () => {
    const transport = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: '{"category":"OTHER","confidence":0.9,"reason":"Demo"}',
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );
    try {
      await new GoogleGeminiProvider(
        "synthetic-test-key",
        "gemini-3.1-flash-lite",
      ).generate({
        contents: [],
        classification: true,
        signal: new AbortController().signal,
      });
      const body = JSON.parse(String(transport.mock.calls[0]?.[1]?.body));
      expect(
        body.generationConfig.responseSchema.properties.confidence.type,
      ).toBe("NUMBER");
      expect(body.generationConfig.responseSchema.required).toContain(
        "confidence",
      );
    } finally {
      transport.mockRestore();
    }
  });
  afterEach(() => jest.useRealTimers());
  it("fails explicitly without backend configuration", async () => {
    await expect(
      new GoogleGeminiProvider("", "").generate({
        contents: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("GEMINI_UNAVAILABLE");
  });
  it("times out even a provider that ignores abort", async () => {
    jest.useFakeTimers();
    const provider = new BoundedProvider({
      generate: () => new Promise(() => {}),
    });
    const result = provider.generate([], Date.now() + 100);
    const assertion = expect(result).rejects.toThrow("GEMINI_UNAVAILABLE");
    await jest.advanceTimersByTimeAsync(101);
    await assertion;
  });
  it("opens after five failures, then permits one successful half-open probe", async () => {
    jest.useFakeTimers();
    let fail = true,
      calls = 0;
    const provider = new BoundedProvider({
      generate: async () => {
        calls++;
        if (fail) throw new ProviderError(403);
        return [{ text: "ok" }];
      },
    });
    for (let i = 0; i < 5; i++)
      await expect(provider.generate([], Date.now() + 25000)).rejects.toThrow();
    expect(calls).toBe(5);
    expect(provider.health().status).toBe("OPEN");
    await expect(provider.generate([], Date.now() + 25000)).rejects.toThrow();
    expect(calls).toBe(5);
    await jest.advanceTimersByTimeAsync(60001);
    fail = false;
    expect(await provider.generate([], Date.now() + 25000)).toEqual([
      { text: "ok" },
    ]);
    expect(provider.health().status).toBe("CLOSED");
  });
  it("retries a transient error only once", async () => {
    jest.useFakeTimers();
    let calls = 0;
    const provider = new BoundedProvider({
      generate: async () => {
        calls++;
        throw new ProviderError(429, 100);
      },
    });
    const result = provider.generate([], Date.now() + 5000);
    const assertion = expect(result).rejects.toThrow();
    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(calls).toBe(2);
  });
});
