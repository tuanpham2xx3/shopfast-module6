import request from "supertest";
import { createApiApp } from "../../apps/api/src/bootstrap";

describe("API HTTP contract", () => {
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
