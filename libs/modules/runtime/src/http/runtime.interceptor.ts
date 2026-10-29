import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { catchError, from, mergeMap, throwError } from "rxjs";
import { RuntimeServices } from "../composition/runtime.runtime";
import { RateLimitError } from "../limiter";

@Injectable()
export class RuntimeRateInterceptor implements NestInterceptor {
  constructor(private readonly runtime: RuntimeServices) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string } }>();
    const response = context.switchToHttp().getResponse<Response>();
    if (/^\/(?:api\/v1\/)?health\/(?:live|ready)\/?$/.test(request.path))
      return next.handle();
    const run = async () => {
      const { limiter } = await this.runtime.get();
      const bearer = request.header?.("authorization");
      if (!request.user && bearer?.startsWith("Bearer "))
        request.user =
          (await this.runtime.authenticatedUser(bearer.slice(7))) ?? undefined;
      await limiter.consume(
        request.user ? "api-user" : "api-public",
        request.user?.id ?? request.ip ?? "unknown",
        request.user ? 120 : 60,
        60000,
      );
      if (limiter.degraded) response.setHeader("X-RateLimit-Degraded", "true");
    };
    return from(run()).pipe(
      mergeMap(() => next.handle()),
      catchError((error: unknown) => {
        if (error instanceof RateLimitError)
          response.setHeader("Retry-After", error.retryAfter);
        else if (error instanceof ServiceUnavailableException) {
          const body = error.getResponse();
          if (typeof body === "object" && "retryAfter" in body)
            response.setHeader("Retry-After", String(body.retryAfter));
        }
        return throwError(() => error);
      }),
    );
  }
}
