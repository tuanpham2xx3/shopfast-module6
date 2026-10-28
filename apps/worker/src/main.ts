import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { parseEnvironment } from "../../../libs/platform/src/config/environment";
import {
  FoundationWorker,
  registerOutboxSubscriber,
} from "../../../libs/platform/src/queue/foundation-worker";
import {
  RuntimeModule,
  RuntimeServices,
} from "../../../libs/modules/runtime/runtime.module";

@Module({
  providers: [FoundationWorker],
  imports: [
    RuntimeModule,
    ConfigModule.forRoot({ isGlobal: true, validate: parseEnvironment }),
  ],
})
class WorkerModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const runtime = app.get(RuntimeServices);
  registerOutboxSubscriber(async (event) => {
    if (event.type !== "catalog.invalidate") return;
    const tags = event.payload.tags;
    if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string"))
      throw new Error("INVALID_CACHE_TAGS");
    if (!(await (await runtime.get()).cache.invalidate(tags)))
      throw new Error("CACHE_INVALIDATION_PENDING");
  });
  app.enableShutdownHooks();
}
void main();
