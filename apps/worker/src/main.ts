import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { RuntimeServices } from "../../../libs/modules/runtime/src/composition/runtime.runtime";
import { RuntimeModule } from "../../../libs/modules/runtime/src/runtime.module";
import { parseEnvironment } from "../../../libs/platform/src/config/environment";
import {
  FoundationWorker,
  registerOutboxSubscriber,
} from "./foundation-worker";

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
