import "reflect-metadata";
import "dotenv/config";
import { randomUUID } from "node:crypto";
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
import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, Request, Response, NextFunction } from "express";
import { parseEnvironment } from "../../../libs/platform/src/config/environment";
import { checkReadiness } from "../../../libs/platform/src/health/readiness";
import {
  probeDatabase,
  probeRedis,
} from "../../../libs/platform/src/health/dependency-probes";

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
    const status =
      exception instanceof HttpException
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
      503: ["SERVICE_UNAVAILABLE", "Service unavailable"],
    };
    const [code, message] = messages[status] ?? [
      "INTERNAL_ERROR",
      "Internal server error",
    ];
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
  ],
  controllers: [HealthController],
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
