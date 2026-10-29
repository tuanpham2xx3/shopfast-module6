import { ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import { DataSource } from "typeorm";
import { RuntimeServices } from "../../libs/modules/runtime/src/composition/runtime.runtime";
import { RuntimeRateInterceptor } from "../../libs/modules/runtime/src/http/runtime.interceptor";
import {
  RateLimitError,
  RuntimeLimiter,
} from "../../libs/modules/runtime/src/limiter";
describe("HTTP runtime limiter adapter", () => {
  it("uses a conservative process fallback and fails closed for sensitive scopes", async () => {
    const source = new DataSource({ type: "postgres" });
    const limiter = new RuntimeLimiter(source);
    await limiter.consume("public", "ip", 2, 60000);
    await expect(
      limiter.consume("public", "ip", 2, 60000),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(limiter.degraded).toBe(true);
    await expect(
      limiter.consume("promo", "u", 3, 60000, true),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      limiter.loginTarget("e@example.com", "check"),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("propagates Retry-After from downstream controller failures", async () => {
    const runtime = {
      get: async () => ({
        limiter: { consume: async () => undefined, degraded: false },
      }),
    };
    const response = { setHeader: jest.fn() };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ path: "/api/v1/auth/login", ip: "127.0.0.1" }),
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const interceptor = new RuntimeRateInterceptor(
      runtime as unknown as RuntimeServices,
    );
    await expect(
      firstValueFrom(
        interceptor.intercept(context, {
          handle: () => {
            throw new RateLimitError(60);
          },
        }),
      ),
    ).rejects.toMatchObject({ retryAfter: 60 });
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", 60);
  });
  it("does not initialize database-backed runtime for liveness", async () => {
    const runtime = { get: jest.fn() };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ path: "/api/v1/health/live" }),
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;
    const interceptor = new RuntimeRateInterceptor(
      runtime as unknown as RuntimeServices,
    );
    expect(
      await firstValueFrom(
        interceptor.intercept(context, { handle: () => of({ status: "ok" }) }),
      ),
    ).toEqual({ status: "ok" });
    expect(runtime.get).not.toHaveBeenCalled();
  });
});
