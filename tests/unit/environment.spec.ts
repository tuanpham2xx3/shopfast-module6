import { parseEnvironment } from "../../libs/platform/src/config/environment";

describe("parseEnvironment", () => {
  it("rejects an invalid HTTP port with an actionable field path", () => {
    expect(() => parseEnvironment({ NODE_ENV: "test", PORT: "70000" })).toThrow(
      /PORT/,
    );
  });

  it("applies safe local defaults outside production", () => {
    expect(parseEnvironment({ NODE_ENV: "test" })).toMatchObject({
      NODE_ENV: "test",
      PORT: 3000,
      API_PREFIX: "api/v1",
    });
  });
});
