import { createDataSource } from "../../libs/platform/src/database/data-source";

describe("database configuration", () => {
  it("never enables schema synchronization or query logging", () => {
    const source = createDataSource(
      "postgresql://shopfast:secret@127.0.0.1:5432/shopfast",
    );
    expect(source.options.synchronize).toBe(false);
    expect(source.options.logging).toBe(false);
    expect(source.migrations).toHaveLength(0);
    expect(source.options.migrations).toHaveLength(1);
  });
  it("rejects an unsafe migration schema identifier", () => {
    expect(() =>
      createDataSource(
        "postgresql://localhost/shopfast",
        "public; DROP TABLE users",
      ),
    ).toThrow("schema");
  });
});
