import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  AccessGuard,
  AuthenticatedRequest,
  RolesGuard,
  VerifiedGuard,
} from "../../libs/modules/auth/src/http/auth.guards";

function context(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe("auth guards", () => {
  const user = {
    id: "user-1",
    email: "customer@example.test",
    displayName: "Customer",
    role: "CUSTOMER",
    verified: true,
  };

  it("hydrates the request from a valid bearer token", async () => {
    const runtime = {
      get: jest
        .fn()
        .mockResolvedValue({ currentUser: jest.fn().mockResolvedValue(user) }),
    };
    const request = { headers: { authorization: "Bearer access-token" } };
    await expect(
      new AccessGuard(runtime as never).canActivate(context(request)),
    ).resolves.toBe(true);
    expect(request).toHaveProperty("user", user);
  });

  it("rejects unverified users", () => {
    const request = { user: { ...user, verified: false } };
    expect(() => new VerifiedGuard().canActivate(context(request))).toThrow(
      "Forbidden",
    );
  });

  it("rejects roles not declared on the route", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["ADMIN"]),
    } as unknown as Reflector;
    expect(() =>
      new RolesGuard(reflector).canActivate(context({ user })),
    ).toThrow("Forbidden");
  });
});
