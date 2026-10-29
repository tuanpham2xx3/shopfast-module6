import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpException,
  Module,
  NestApplicationOptions,
  ServiceUnavailableException,
  ValidationPipe,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import "dotenv/config";
import { json, NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import "reflect-metadata";
import { AuthModule } from "../../../libs/modules/auth/src/auth.module";
import { AuthError } from "../../../libs/modules/auth/src/auth.contracts";
import { CatalogModule } from "../../../libs/modules/catalog/src/catalog.module";
import { CatalogError } from "../../../libs/modules/catalog/src/catalog.contracts";
import { JobsModule } from "../../../libs/modules/jobs/src/jobs.module";
import { OperationsModule } from "../../../libs/modules/operations/src/operations.module";
import { OrderModule } from "../../../libs/modules/orders/src/order.module";
import { OrderError } from "../../../libs/modules/orders/src/order.service";
import { RealtimeModule } from "../../../libs/modules/realtime/src/realtime.module";
import { RuntimeRateInterceptor } from "../../../libs/modules/runtime/src/http/runtime.interceptor";
import { RateLimitError } from "../../../libs/modules/runtime/src/limiter";
import { RuntimeModule } from "../../../libs/modules/runtime/src/runtime.module";
import { TicketsModule } from "../../../libs/modules/tickets/src/tickets.module";
import { TicketError } from "../../../libs/modules/tickets/src/tickets.service";
import { parseEnvironment } from "../../../libs/platform/src/config/environment";
import {
  probeDatabase,
  probeRedis,
} from "../../../libs/platform/src/health/dependency-probes";
import { checkReadiness } from "../../../libs/platform/src/health/readiness";

type IdentifiedRequest = Request & { requestId: string };

@Catch()
class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<IdentifiedRequest>();
    const parserType =
      typeof exception === "object" && exception !== null && "type" in exception
        ? exception.type
        : undefined;
    const authStatuses: Record<string, number> = {
      INVALID_CREDENTIALS: 401,
      INVALID_ACCESS_TOKEN: 401,
      INVALID_REFRESH_TOKEN: 401,
      REFRESH_TOKEN_REUSED: 401,
      INVALID_VERIFICATION_CODE: 400,
      EMAIL_ALREADY_REGISTERED: 409,
      RATE_LIMITED: 429,
    };
    const databaseCode = (exception as { driverError?: { code?: string } })
      ?.driverError?.code;
    const catalogStatuses: Record<string, number> = {
      FORBIDDEN: 403,
      PRICE_CHANGED: 409,
      OUT_OF_STOCK: 409,
      PROMO_NOT_ELIGIBLE: 409,
      PROMO_EXHAUSTED: 409,
      PROMOTION_INVALID: 409,
      INVALID_TRANSITION: 409,
      REQUEST_IN_PROGRESS: 409,
      NOT_FOUND: 404,
      BAD_REQUEST: 400,
      VERSION_CONFLICT: 409,
      IDEMPOTENCY_CONFLICT: 409,
      INSUFFICIENT_STOCK: 409,
    };
    const status =
      exception instanceof TicketError
        ? exception.code === "NOT_FOUND" ||
          exception.code === "ORDER_NOT_ACCESSIBLE"
          ? 404
          : exception.code === "FORBIDDEN" ||
              exception.code === "SESSION_NOT_ACCESSIBLE"
            ? 403
            : exception.code === "BAD_REQUEST"
              ? 400
              : 409
        : exception instanceof CatalogError || exception instanceof OrderError
          ? (catalogStatuses[exception.code] ?? 400)
          : databaseCode === "23505"
            ? 409
            : databaseCode === "23503" || databaseCode === "23514"
              ? 400
              : exception instanceof AuthError
                ? (authStatuses[exception.code] ?? 400)
                : exception instanceof HttpException
                  ? exception.getStatus()
                  : parserType === "entity.too.large"
                    ? 413
                    : parserType === "entity.parse.failed"
                      ? 400
                      : 500;
    const messages: Record<number, [string, string]> = {
      400: ["BAD_REQUEST", "Invalid request"],
      401: ["UNAUTHORIZED", "Authentication required"],
      403: ["FORBIDDEN", "Access denied"],
      404: ["NOT_FOUND", "Resource not found"],
      413: ["PAYLOAD_TOO_LARGE", "Request body exceeds the size limit"],
      409: [
        "CONFLICT",
        "Dữ liệu đã thay đổi hoặc thao tác xung đột. Vui lòng tải lại.",
      ],
      429: ["RATE_LIMITED", "Bạn thao tác quá nhanh. Vui lòng thử lại sau."],
      503: ["SERVICE_UNAVAILABLE", "Service unavailable"],
    };
    const [code, message] =
      exception instanceof TicketError
        ? [
            exception.code,
            "Không thể xử lý yêu cầu hỗ trợ. Vui lòng kiểm tra quyền hoặc tải lại.",
          ]
        : exception instanceof CatalogError || exception instanceof OrderError
          ? [
              exception.code,
              "Không thể thực hiện thao tác. Vui lòng kiểm tra dữ liệu hoặc tải lại.",
            ]
          : exception instanceof AuthError
            ? [
                exception.code,
                exception.code === "RATE_LIMITED"
                  ? `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${exception.retryAfter ?? 900} giây.`
                  : exception.code === "INVALID_CREDENTIALS"
                    ? "Invalid email or password"
                    : "Authentication request failed",
              ]
            : (messages[status] ?? ["INTERNAL_ERROR", "Internal server error"]);
    if (exception instanceof AuthError && exception.code === "RATE_LIMITED") {
      response.setHeader("Retry-After", exception.retryAfter ?? 900);
    }
    if (exception instanceof RateLimitError)
      response.setHeader("Retry-After", exception.retryAfter);
    if (
      (exception instanceof OrderError || exception instanceof TicketError) &&
      exception.code === "REQUEST_IN_PROGRESS"
    )
      response.setHeader("Retry-After", 1);
    response.status(status).json({
      error: { code, message, details: null },
      requestId: request.requestId,
    });
  }
}

@Controller("health")
class HealthController {
  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    const status = await checkReadiness(
      () => probeDatabase(process.env.DATABASE_URL),
      () => probeRedis(process.env.REDIS_URL),
    );
    if (status === "unavailable") throw new ServiceUnavailableException();
    return { status };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === "test",
      validate: parseEnvironment,
    }),
    AuthModule,
    CatalogModule,
    OrderModule,
    RealtimeModule,
    RuntimeModule,
    JobsModule,
    TicketsModule,
    OperationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RuntimeRateInterceptor }],
})
class ApiModule {}

export async function createApiApp(options: NestApplicationOptions = {}) {
  const environment = parseEnvironment(process.env);
  const app = await NestFactory.create(ApiModule, {
    ...options,
    bodyParser: false,
  });
  app.use(
    (request: IdentifiedRequest, response: Response, next: NextFunction) => {
      const supplied = request.header("x-request-id");
      request.requestId =
        supplied && /^[a-zA-Z0-9_-]{1,64}$/.test(supplied)
          ? supplied
          : randomUUID();
      response.setHeader("x-request-id", request.requestId);
      next();
    },
  );
  app.use(json({ limit: "64kb" }));
  app.use(cookieParser());
  // Only the private Compose Nginx network is trusted, never arbitrary Internet proxies.
  if (process.env.TRUST_PROXY_CIDR)
    app
      .getHttpAdapter()
      .getInstance()
      .set("trust proxy", process.env.TRUST_PROXY_CIDR);
  app.setGlobalPrefix(environment.API_PREFIX);
  app.enableCors({ origin: environment.WEB_ORIGIN, credentials: true });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const { map } = await import("rxjs/operators");
  app.useGlobalInterceptors({
    intercept(context, next) {
      const request = context.switchToHttp().getRequest<IdentifiedRequest>();
      return next
        .handle()
        .pipe(map((data) => ({ data, requestId: request.requestId })));
    },
  });
  if (environment.NODE_ENV !== "production") {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("ShopFast API")
        .setVersion("0.1.0")
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup("api/docs", app, document);
  }
  app.enableShutdownHooks();
  await app.init();
  return app;
}
