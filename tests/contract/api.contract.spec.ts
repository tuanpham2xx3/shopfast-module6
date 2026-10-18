import request from "supertest";
import { createApiApp } from "../../apps/api/src/bootstrap";

describe("API HTTP contract", () => {
  const savedDatabaseUrl = process.env.DATABASE_URL;
  const savedRedisUrl = process.env.REDIS_URL;
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
  });
  afterEach(() => {
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    if (savedRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = savedRedisUrl;
  });
  it("rejects malformed JSON safely as a bad request", async () => {
    const app = await createApiApp({ logger: false });
    try {
      const response = await request(app.getHttpServer())
        .post("/api/v1/missing")
        .set("Content-Type", "application/json")
        .send("{bad")
        .expect(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
      expect(JSON.stringify(response.body)).not.toContain("SyntaxError");
    } finally {
      await app.close();
    }
  });

  it("enforces the 64 KB JSON body limit", async () => {
    const app = await createApiApp({ logger: false });
    try {
      const response = await request(app.getHttpServer())
        .post("/api/v1/missing")
        .send({ body: "x".repeat(66000) })
        .expect(413);
      expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    } finally {
      await app.close();
    }
  });
  it("replaces an unsafe caller request ID", async () => {
    const app = await createApiApp({ logger: false });
    try {
      const response = await request(app.getHttpServer())
        .get("/api/v1/health/live")
        .set("x-request-id", "<script>")
        .expect(200);
      expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      await app.close();
    }
  });

  it("reports unavailable readiness when no database is configured", async () => {
    const app = await createApiApp({ logger: false });
    try {
      const response = await request(app.getHttpServer())
        .get("/api/v1/health/ready")
        .expect(503);
      expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
    } finally {
      await app.close();
    }
  });
  it("reports liveness with the standard success envelope and request ID", async () => {
    const app = await createApiApp({ logger: false });
    try {
      const response = await request(app.getHttpServer())
        .get("/api/v1/health/live")
        .set("x-request-id", "01JAR9M6V8R1QX8ZC4N7W2K5TY")
        .expect(200);

      expect(response.headers["x-request-id"]).toBe(
        "01JAR9M6V8R1QX8ZC4N7W2K5TY",
      );
      expect(response.body).toMatchObject({
        data: { status: "ok" },
        requestId: "01JAR9M6V8R1QX8ZC4N7W2K5TY",
      });
    } finally {
      await app.close();
    }
  });

  it("returns unknown routes in the standard safe error envelope", async () => {
    const app = await createApiApp({ logger: false });
    try {
      const response = await request(app.getHttpServer())
        .get("/api/v1/missing")
        .expect(404);
      expect(response.body).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Resource not found",
          details: null,
        },
        requestId: expect.any(String),
      });
      expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    } finally {
      await app.close();
    }
  });
});
